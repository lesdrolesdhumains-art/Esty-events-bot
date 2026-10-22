'use strict';
// Tables rc_* indépendantes : ne modifie ni les problèmes, ni l'ancien Don Juan.
const {pool}=require('./db');
async function q(sql,params=[]){return pool.query(sql,params);}
async function one(sql,params=[]){return (await q(sql,params)).rows[0]||null;}
async function init(){await q(`
CREATE TABLE IF NOT EXISTS rc_settings (
 guild_id TEXT PRIMARY KEY, judge_channel TEXT, judge_role TEXT, winner_role TEXT,
 registrations_closed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS rc_admins (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS rc_members (
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('judge','candidate')),
 number INT, active BOOLEAN NOT NULL DEFAULT TRUE,
 PRIMARY KEY(guild_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS rc_unique_number ON rc_members(guild_id,number) WHERE number IS NOT NULL;
CREATE TABLE IF NOT EXISTS rc_stages (
 id BIGSERIAL PRIMARY KEY,guild_id TEXT NOT NULL,
 title TEXT NOT NULL,prompt TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','collect','published','closed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rc_submissions (
 stage_id BIGINT NOT NULL REFERENCES rc_stages(id) ON DELETE CASCADE,
 candidate_id TEXT NOT NULL, answer TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(stage_id,candidate_id)
);
CREATE TABLE IF NOT EXISTS rc_grades (
 stage_id BIGINT NOT NULL REFERENCES rc_stages(id) ON DELETE CASCADE,
 judge_id TEXT NOT NULL,candidate_id TEXT NOT NULL,
 grade INT NOT NULL CHECK(grade BETWEEN 0 AND 10),comment TEXT NOT NULL DEFAULT '',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(stage_id,judge_id,candidate_id)
);
`);}
async function settings(guild){await q('INSERT INTO rc_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[guild]);return one('SELECT * FROM rc_settings WHERE guild_id=$1',[guild]);}
async function setSetting(guild,key,val){if(!['judge_channel','judge_role','winner_role','registrations_closed'].includes(key))throw Error('Configuration refusée');await settings(guild);return one(`UPDATE rc_settings SET ${key}=$2 WHERE guild_id=$1 RETURNING *`,[guild,val]);}
async function isAdmin(guild,id){return !!await one('SELECT 1 FROM rc_admins WHERE guild_id=$1 AND user_id=$2',[guild,id]);}
async function addAdmin(guild,id){await q('INSERT INTO rc_admins VALUES($1,$2) ON CONFLICT DO NOTHING',[guild,id]);}
async function removeAdmin(guild,id){await q('DELETE FROM rc_admins WHERE guild_id=$1 AND user_id=$2',[guild,id]);}
async function member(guild,id){return one('SELECT * FROM rc_members WHERE guild_id=$1 AND user_id=$2',[guild,id]);}
async function members(guild,kind,activeOnly=false){return (await q(`SELECT * FROM rc_members WHERE guild_id=$1 AND kind=$2 ${activeOnly?'AND active=TRUE':''} ORDER BY number NULLS LAST,user_id`,[guild,kind])).rows;}
async function addMember(guild,id,kind){const s=await settings(guild);const stages=await q('SELECT 1 FROM rc_stages WHERE guild_id=$1 LIMIT 1',[guild]);if(s.registrations_closed||stages.rowCount)throw Error('Inscriptions fermées, ou des épreuves existent déjà.');
 const other=await member(guild,id);if(other&&other.kind!==kind)throw Error('Une même personne ne peut pas être juge ET candidate.');
 return one('INSERT INTO rc_members(guild_id,user_id,kind) VALUES($1,$2,$3) ON CONFLICT(guild_id,user_id) DO UPDATE SET kind=$3,active=TRUE RETURNING *',[guild,id,kind]);}
async function removeMember(guild,id,kind){const s=await settings(guild);const stages=await q('SELECT 1 FROM rc_stages WHERE guild_id=$1 LIMIT 1',[guild]);if(s.registrations_closed||stages.rowCount)throw Error('Les inscriptions sont figées après leur clôture : réinitialiser la partie pour recommencer.');return one('DELETE FROM rc_members WHERE guild_id=$1 AND user_id=$2 AND kind=$3 RETURNING *',[guild,id,kind]);}
async function closeRegistrations(guild){const c=await pool.connect();try{await c.query('BEGIN');const s=(await c.query('SELECT * FROM rc_settings WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];if(!s||s.registrations_closed)throw Error('Inscriptions déjà clôturées ou non configurées.');const candidates=(await c.query("SELECT user_id FROM rc_members WHERE guild_id=$1 AND kind='candidate' ORDER BY RANDOM() FOR UPDATE",[guild])).rows;if(candidates.length<2)throw Error('Il faut au moins deux candidates.');await c.query('UPDATE rc_members SET number=NULL WHERE guild_id=$1',[guild]);for(let n=0;n<candidates.length;n++)await c.query('UPDATE rc_members SET number=$3 WHERE guild_id=$1 AND user_id=$2',[guild,candidates[n].user_id,n+1]);await c.query('UPDATE rc_settings SET registrations_closed=TRUE WHERE guild_id=$1',[guild]);await c.query('COMMIT');return candidates.length;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
async function latest(guild){return one('SELECT * FROM rc_stages WHERE guild_id=$1 ORDER BY id DESC LIMIT 1',[guild]);}
async function stage(guild,id){return one('SELECT * FROM rc_stages WHERE guild_id=$1 AND id=$2',[guild,id]);}
async function createStage(guild,title,prompt){const s=await settings(guild);if(!s.registrations_closed)throw Error('Ferme d’abord les inscriptions.');const last=await latest(guild);if(last&&last.status!=='closed')throw Error('Clôture d’abord la précédente épreuve.');const remaining=await members(guild,'candidate',true);if(remaining.length<2)throw Error('Pas assez de candidates encore en jeu.');return one('INSERT INTO rc_stages(guild_id,title,prompt) VALUES($1,$2,$3) RETURNING *',[guild,title,prompt]);}
async function setStageStatus(guild,id,from,to){return one('UPDATE rc_stages SET status=$4 WHERE guild_id=$1 AND id=$2 AND status=$3 RETURNING *',[guild,id,from,to]);}
async function submissions(id){return (await q('SELECT s.*,m.number,m.active FROM rc_submissions s JOIN rc_members m ON m.user_id=s.candidate_id JOIN rc_stages t ON t.id=s.stage_id AND t.guild_id=m.guild_id WHERE s.stage_id=$1 ORDER BY m.number',[id])).rows;}
async function saveSubmission(guild,id,candidate,answer){const st=await stage(guild,id);if(!st||st.status!=='collect')throw Error('Réception des textes fermée.');const m=await member(guild,candidate);if(!m||m.kind!=='candidate'||!m.active)throw Error('Candidate non autorisée.');return one('INSERT INTO rc_submissions(stage_id,candidate_id,answer) VALUES($1,$2,$3) ON CONFLICT(stage_id,candidate_id) DO UPDATE SET answer=$3,updated_at=NOW() RETURNING *',[id,candidate,answer]);}
async function grades(id){return (await q('SELECT * FROM rc_grades WHERE stage_id=$1 ORDER BY judge_id,candidate_id',[id])).rows;}
async function setGrade(guild,id,judge,candidate,grade,comment){const st=await stage(guild,id);if(!st||st.status!=='published')throw Error('Les notes ne sont pas ouvertes.');const j=await member(guild,judge);if(!j||j.kind!=='judge')throw Error('Accès réservé aux juges inscrits.');const s=await one('SELECT 1 FROM rc_submissions WHERE stage_id=$1 AND candidate_id=$2',[id,candidate]);if(!s)throw Error('Cette candidate n’a pas rendu de texte.');return one('INSERT INTO rc_grades(stage_id,judge_id,candidate_id,grade,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(stage_id,judge_id,candidate_id) DO UPDATE SET grade=$4,comment=$5,updated_at=NOW() RETURNING *',[id,judge,candidate,grade,comment]);}
async function ranking(guild,id){return (await q(`SELECT m.user_id,m.number,m.active,COUNT(g.grade)::int AS notes,
 ROUND(AVG(g.grade)::numeric,2) AS moyenne,SUM(g.grade)::int AS total
 FROM rc_members m JOIN rc_submissions s ON s.candidate_id=m.user_id AND s.stage_id=$2
 LEFT JOIN rc_grades g ON g.stage_id=s.stage_id AND g.candidate_id=m.user_id
 WHERE m.guild_id=$1 AND m.kind='candidate'
 GROUP BY m.user_id,m.number,m.active ORDER BY moyenne DESC NULLS LAST,m.number`,[guild,id])).rows;}
async function eliminate(guild,id){return one("UPDATE rc_members SET active=FALSE WHERE guild_id=$1 AND number=$2 AND kind='candidate' AND active=TRUE RETURNING *",[guild,id]);}
async function reset(guild){const c=await pool.connect();try{await c.query('BEGIN');await c.query('DELETE FROM rc_stages WHERE guild_id=$1',[guild]);await c.query('DELETE FROM rc_members WHERE guild_id=$1',[guild]);await c.query('UPDATE rc_settings SET registrations_closed=FALSE WHERE guild_id=$1',[guild]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
module.exports={q,one,init,settings,setSetting,isAdmin,addAdmin,removeAdmin,member,members,addMember,removeMember,closeRegistrations,latest,stage,createStage,setStageStatus,submissions,saveSubmission,grades,setGrade,ranking,eliminate,reset};
