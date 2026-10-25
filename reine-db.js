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
`);
// Migration additive : les tables et inscriptions existantes sont conservées.
await q("ALTER TABLE rc_stages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text'");
await q(`CREATE TABLE IF NOT EXISTS rc_dual_judges (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS rc_questions (
 id BIGSERIAL PRIMARY KEY, stage_id BIGINT NOT NULL REFERENCES rc_stages(id) ON DELETE CASCADE,
 judge_id TEXT NOT NULL, candidate_id TEXT NOT NULL, question TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rc_questions_by_judge ON rc_questions(stage_id,judge_id);
CREATE TABLE IF NOT EXISTS rc_question_answers (
 question_id BIGINT PRIMARY KEY REFERENCES rc_questions(id) ON DELETE CASCADE,
 answer TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
// Migration additive : aucune inscription, note, question ni réponse existante n'est effacée.
await q('ALTER TABLE rc_stages ADD COLUMN IF NOT EXISTS questions_posted BOOLEAN NOT NULL DEFAULT FALSE');
await q(`CREATE TABLE IF NOT EXISTS rc_question_grades (
 question_id BIGINT NOT NULL REFERENCES rc_questions(id) ON DELETE CASCADE,
 judge_id TEXT NOT NULL,
 grade INT NOT NULL CHECK (grade BETWEEN 0 AND 10),
 comment TEXT NOT NULL DEFAULT '',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(question_id,judge_id)
);
CREATE INDEX IF NOT EXISTS rc_qgrades_by_judge ON rc_question_grades(judge_id);`);
// Conserve les numéros de chaque manche dans les archives, même après un remélange.
await q(`CREATE TABLE IF NOT EXISTS rc_stage_numbers (
 stage_id BIGINT NOT NULL REFERENCES rc_stages(id) ON DELETE CASCADE,
 candidate_id TEXT NOT NULL,
 number INT NOT NULL,
 PRIMARY KEY(stage_id,candidate_id),
 UNIQUE(stage_id,number)
);`);
}
async function settings(guild){await q('INSERT INTO rc_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[guild]);return one('SELECT * FROM rc_settings WHERE guild_id=$1',[guild]);}
async function setSetting(guild,key,val){if(!['judge_channel','judge_role','winner_role','registrations_closed'].includes(key))throw Error('Configuration refusée');await settings(guild);return one(`UPDATE rc_settings SET ${key}=$2 WHERE guild_id=$1 RETURNING *`,[guild,val]);}
async function isAdmin(guild,id){return !!await one('SELECT 1 FROM rc_admins WHERE guild_id=$1 AND user_id=$2',[guild,id]);}
async function addAdmin(guild,id){await q('INSERT INTO rc_admins VALUES($1,$2) ON CONFLICT DO NOTHING',[guild,id]);}
async function removeAdmin(guild,id){await q('DELETE FROM rc_admins WHERE guild_id=$1 AND user_id=$2',[guild,id]);}
async function member(guild,id){return one('SELECT * FROM rc_members WHERE guild_id=$1 AND user_id=$2',[guild,id]);}
async function members(guild,kind,activeOnly=false){
 return (await q(`SELECT m.* FROM rc_members m WHERE m.guild_id=$1
 AND (m.kind=$2 ${kind==='judge'?"OR (m.kind='candidate' AND EXISTS (SELECT 1 FROM rc_dual_judges d WHERE d.guild_id=m.guild_id AND d.user_id=m.user_id))":''})
 ${activeOnly?(kind==='judge'?"AND (m.active=TRUE OR (m.kind='candidate' AND EXISTS (SELECT 1 FROM rc_dual_judges d WHERE d.guild_id=m.guild_id AND d.user_id=m.user_id)))":'AND m.active=TRUE'):''} ORDER BY m.number NULLS LAST,m.user_id`,[guild,kind])).rows;
}
async function isDualJudge(guild,id){return !!await one('SELECT 1 FROM rc_dual_judges WHERE guild_id=$1 AND user_id=$2',[guild,id]);}
async function addInfiltrator(guild,id){
 const s=await settings(guild),old=await member(guild,id);
 if(old?.kind==='candidate'){if(!old.active)throw Error('Cette candidate a déjà été éliminée.');const previous=await latest(guild);if(previous&&previous.status!=='draft')throw Error('Un double rôle ne peut pas être ajouté pendant une épreuve en cours ou terminée.');await q('INSERT INTO rc_dual_judges(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[guild,id]);return;}
 if(s.registrations_closed||(await latest(guild)))throw Error('Ajoute un nouvel infiltré avant la clôture des inscriptions. Une candidate déjà inscrite peut cependant recevoir le double rôle.');
 if((await members(guild,'candidate')).length>=15)throw Error('Maximum 15 candidates.');
 if(old?.kind==='judge')await q("UPDATE rc_members SET kind='candidate',number=NULL,active=TRUE WHERE guild_id=$1 AND user_id=$2",[guild,id]);
 else await q("INSERT INTO rc_members(guild_id,user_id,kind) VALUES($1,$2,'candidate')",[guild,id]);
 await q('INSERT INTO rc_dual_judges(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[guild,id]);
}
async function removeInfiltrator(guild,id){const s=await settings(guild);if(s.registrations_closed)throw Error('Modifie les rôles avant la clôture des inscriptions.');return one('DELETE FROM rc_dual_judges WHERE guild_id=$1 AND user_id=$2 RETURNING *',[guild,id]);}

async function addMember(guild,id,kind){const s=await settings(guild);const stages=await q('SELECT 1 FROM rc_stages WHERE guild_id=$1 LIMIT 1',[guild]);if(s.registrations_closed||stages.rowCount)throw Error('Inscriptions fermées, ou des épreuves existent déjà.');
 const other=await member(guild,id);if(other&&other.kind!==kind)throw Error('Une même personne ne peut pas être juge ET candidate.');
 return one('INSERT INTO rc_members(guild_id,user_id,kind) VALUES($1,$2,$3) ON CONFLICT(guild_id,user_id) DO UPDATE SET kind=$3,active=TRUE RETURNING *',[guild,id,kind]);}
async function removeMember(guild,id,kind){
 const s=await settings(guild),stages=await q('SELECT 1 FROM rc_stages WHERE guild_id=$1 LIMIT 1',[guild]);
 if(s.registrations_closed||stages.rowCount)throw Error('Les inscriptions sont figées après leur clôture : réinitialiser la partie pour recommencer.');
 if(kind==='judge' && await isDualJudge(guild,id))return q('DELETE FROM rc_dual_judges WHERE guild_id=$1 AND user_id=$2 RETURNING *',[guild,id]).then(r=>r.rows[0]||null);
 if(kind==='candidate')await q('DELETE FROM rc_dual_judges WHERE guild_id=$1 AND user_id=$2',[guild,id]);
 return one('DELETE FROM rc_members WHERE guild_id=$1 AND user_id=$2 AND kind=$3 RETURNING *',[guild,id,kind]);
}
async function closeRegistrations(guild){const c=await pool.connect();try{await c.query('BEGIN');const s=(await c.query('SELECT * FROM rc_settings WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];if(!s||s.registrations_closed)throw Error('Inscriptions déjà clôturées ou non configurées.');const candidates=(await c.query("SELECT user_id FROM rc_members WHERE guild_id=$1 AND kind='candidate' ORDER BY RANDOM() FOR UPDATE",[guild])).rows;if(candidates.length<2)throw Error('Il faut au moins deux candidates.');await c.query('UPDATE rc_members SET number=NULL WHERE guild_id=$1',[guild]);for(let n=0;n<candidates.length;n++)await c.query('UPDATE rc_members SET number=$3 WHERE guild_id=$1 AND user_id=$2',[guild,candidates[n].user_id,n+1]);await c.query('UPDATE rc_settings SET registrations_closed=TRUE WHERE guild_id=$1',[guild]);await c.query('COMMIT');return candidates.length;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
async function latest(guild){return one('SELECT * FROM rc_stages WHERE guild_id=$1 ORDER BY id DESC LIMIT 1',[guild]);}
async function lastTextStage(guild){return one("SELECT * FROM rc_stages WHERE guild_id=$1 AND kind='text' AND status='closed' ORDER BY id DESC LIMIT 1",[guild]);}
async function stage(guild,id){return one('SELECT * FROM rc_stages WHERE guild_id=$1 AND id=$2',[guild,id]);}
async function createStage(guild,title,prompt,kind='text'){
 const s=await settings(guild);if(!s.registrations_closed)throw Error('Ferme d’abord les inscriptions.');
 const last=await latest(guild);if(last&&last.status!=='closed')throw Error('Clôture d’abord la précédente épreuve.');
 const remaining=await members(guild,'candidate',true);if(remaining.length<2)throw Error('Pas assez de candidates encore en jeu.');
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const row=(await c.query('INSERT INTO rc_stages(guild_id,title,prompt,kind) VALUES($1,$2,$3,$4) RETURNING *',[guild,title,prompt,kind])).rows[0];
  await c.query(`INSERT INTO rc_stage_numbers(stage_id,candidate_id,number)
   SELECT $1,user_id,number FROM rc_members WHERE guild_id=$2 AND kind='candidate' AND number IS NOT NULL`,[row.id,guild]);
  await c.query('COMMIT');return row;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
// Renumérotation de la liste active uniquement, avec historique intact.
// Chaque personne reçoit un numéro différent (dérangement complet).
async function melangerNumeros(guild){
 const {randomInt}=require('node:crypto');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const cfg=(await c.query('SELECT registrations_closed FROM rc_settings WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];
  if(!cfg?.registrations_closed)throw Error('Clôture d’abord les inscriptions.');
  const st=(await c.query('SELECT id,status FROM rc_stages WHERE guild_id=$1 ORDER BY id DESC LIMIT 1 FOR UPDATE',[guild])).rows[0];
  if(!st||st.status!=='closed')throw Error('La manche actuelle doit être terminée et les notes clôturées avant de remélanger.');
  const active=(await c.query(`SELECT user_id,number FROM rc_members
   WHERE guild_id=$1 AND kind='candidate' AND active=TRUE ORDER BY number FOR UPDATE`,[guild])).rows;
  if(active.length<2)throw Error('Il faut au moins deux candidates actives pour remélanger les numéros.');
  if(active.some(row=>row.number===null))throw Error('Une candidate active ne possède pas de numéro.');
  // Reconstituer le mapping historique de toutes les manches, UNE SEULE FOIS par manche.
  await c.query(`INSERT INTO rc_stage_numbers(stage_id,candidate_id,number)
   SELECT s.id,m.user_id,m.number FROM rc_stages s
   JOIN rc_members m ON m.guild_id=s.guild_id AND m.kind='candidate' AND m.number IS NOT NULL
   WHERE s.guild_id=$1 ON CONFLICT(stage_id,candidate_id) DO NOTHING`,[guild]);
  const original=active.map(row=>Number(row.number));
  let newNumbers;
  for(let attempt=0;attempt<100;attempt++){
   const bag=[...original];
   for(let k=bag.length-1;k>0;k--){const j=randomInt(k+1);[bag[k],bag[j]]=[bag[j],bag[k]];}
   if(bag.every((value,index)=>value!==original[index])){newNumbers=bag;break;}
  }
  if(!newNumbers){const delta=randomInt(1,original.length);newNumbers=original.map((_,index)=>original[(index+delta)%original.length]);}
  // Libérer les numéros actifs puis attribuer les nouveaux, sans toucher aux éliminées.
  await c.query("UPDATE rc_members SET number=NULL WHERE guild_id=$1 AND kind='candidate' AND active=TRUE",[guild]);
  for(let k=0;k<active.length;k++)await c.query('UPDATE rc_members SET number=$3 WHERE guild_id=$1 AND user_id=$2',[guild,active[k].user_id,newNumbers[k]]);
  await c.query('COMMIT');
  return active.map((entry,k)=>({user_id:entry.user_id,oldNumber:Number(entry.number),newNumber:newNumbers[k]}));
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function stageNumberMap(stageId){return new Map((await q('SELECT candidate_id,number FROM rc_stage_numbers WHERE stage_id=$1',[stageId])).rows.map(r=>[r.candidate_id,r.number]));}

async function setStageStatus(guild,id,from,to){return one('UPDATE rc_stages SET status=$4 WHERE guild_id=$1 AND id=$2 AND status=$3 RETURNING *',[guild,id,from,to]);}
async function submissions(id){return (await q('SELECT s.*,COALESCE(sn.number,m.number) AS number,m.active FROM rc_submissions s JOIN rc_members m ON m.user_id=s.candidate_id JOIN rc_stages t ON t.id=s.stage_id AND t.guild_id=m.guild_id LEFT JOIN rc_stage_numbers sn ON sn.stage_id=s.stage_id AND sn.candidate_id=s.candidate_id WHERE s.stage_id=$1 ORDER BY COALESCE(sn.number,m.number)',[id])).rows;}
async function saveSubmission(guild,id,candidate,answer){const st=await stage(guild,id);if(!st||st.status!=='collect')throw Error('Réception des textes fermée.');const m=await member(guild,candidate);if(!m||m.kind!=='candidate'||!m.active)throw Error('Candidate non autorisée.');return one('INSERT INTO rc_submissions(stage_id,candidate_id,answer) VALUES($1,$2,$3) ON CONFLICT(stage_id,candidate_id) DO UPDATE SET answer=$3,updated_at=NOW() RETURNING *',[id,candidate,answer]);}
async function grades(id){return (await q('SELECT * FROM rc_grades WHERE stage_id=$1 ORDER BY judge_id,candidate_id',[id])).rows;}
async function setGrade(guild,id,judge,candidate,grade,comment){const st=await stage(guild,id);if(!st||st.status!=='published')throw Error('Les notes ne sont pas ouvertes.');const j=await member(guild,judge);if(!j || (j.kind!=='judge' && !await isDualJudge(guild,judge)))throw Error('Accès réservé aux juges inscrits.');if(judge===candidate)throw Error('Tu ne peux jamais noter ton propre texte.');const s=await one('SELECT 1 FROM rc_submissions WHERE stage_id=$1 AND candidate_id=$2',[id,candidate]);if(!s)throw Error('Cette candidate n’a pas rendu de texte.');return one('INSERT INTO rc_grades(stage_id,judge_id,candidate_id,grade,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(stage_id,judge_id,candidate_id) DO UPDATE SET grade=$4,comment=$5,updated_at=NOW() RETURNING *',[id,judge,candidate,grade,comment]);}
async function ranking(guild,id){return (await q(`SELECT m.user_id,COALESCE(sn.number,m.number) AS number,m.active,COUNT(g.grade)::int AS notes,
 ROUND(AVG(g.grade)::numeric,2) AS moyenne,SUM(g.grade)::int AS total
 FROM rc_members m JOIN rc_submissions s ON s.candidate_id=m.user_id AND s.stage_id=$2
 LEFT JOIN rc_grades g ON g.stage_id=s.stage_id AND g.candidate_id=m.user_id
 LEFT JOIN rc_stage_numbers sn ON sn.stage_id=$2 AND sn.candidate_id=m.user_id
 WHERE m.guild_id=$1 AND m.kind='candidate'
 GROUP BY m.user_id,m.number,sn.number,m.active ORDER BY moyenne DESC NULLS LAST,number`,[guild,id])).rows;}
async function eliminate(guild,id){return one("UPDATE rc_members SET active=FALSE WHERE guild_id=$1 AND number=$2 AND kind='candidate' AND active=TRUE RETURNING *",[guild,id]);}
async function reset(guild){const c=await pool.connect();try{await c.query('BEGIN');await c.query('DELETE FROM rc_stages WHERE guild_id=$1',[guild]);await c.query('DELETE FROM rc_dual_judges WHERE guild_id=$1',[guild]);await c.query('DELETE FROM rc_members WHERE guild_id=$1',[guild]);await c.query('UPDATE rc_settings SET registrations_closed=FALSE WHERE guild_id=$1',[guild]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}

async function questions(stageId){return (await q(`SELECT q.*, COALESCE(sn.number,m.number) AS candidate_number, a.answer
 FROM rc_questions q JOIN rc_stages s ON s.id=q.stage_id
 JOIN rc_members m ON m.guild_id=s.guild_id AND m.user_id=q.candidate_id
 LEFT JOIN rc_stage_numbers sn ON sn.stage_id=q.stage_id AND sn.candidate_id=q.candidate_id
 LEFT JOIN rc_question_answers a ON a.question_id=q.id WHERE q.stage_id=$1
 ORDER BY q.id`,[stageId])).rows;}
async function question(guild,id){return one(`SELECT q.*,s.status,s.kind,COALESCE(sn.number,m.number) AS candidate_number,a.answer
 FROM rc_questions q JOIN rc_stages s ON s.id=q.stage_id
 JOIN rc_members m ON m.guild_id=s.guild_id AND m.user_id=q.candidate_id
 LEFT JOIN rc_stage_numbers sn ON sn.stage_id=q.stage_id AND sn.candidate_id=q.candidate_id
 LEFT JOIN rc_question_answers a ON a.question_id=q.id WHERE q.id=$1 AND s.guild_id=$2`,[id,guild]);}
async function createQuestion(guild,stageId,judgeId,candidateId,body){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT * FROM rc_stages WHERE id=$1 AND guild_id=$2 FOR UPDATE',[stageId,guild])).rows[0];
  if(!st||st.kind!=='questions'||st.status!=='collect')throw Error('Les questions ne sont pas ouvertes.');
  const j=(await c.query(`SELECT 1 FROM rc_members m WHERE m.guild_id=$1 AND m.user_id=$2
    AND (m.kind='judge' OR EXISTS(SELECT 1 FROM rc_dual_judges d WHERE d.guild_id=m.guild_id AND d.user_id=m.user_id))`,[guild,judgeId])).rows[0];
  if(!j)throw Error('Tu ne fais pas partie du jury.');
  const target=(await c.query("SELECT 1 FROM rc_members WHERE guild_id=$1 AND user_id=$2 AND kind='candidate' AND active=TRUE",[guild,candidateId])).rows[0];
  if(!target)throw Error('Candidate introuvable.');
  if(candidateId===judgeId)throw Error('Un infiltré ne peut pas se poser une question à lui-même.');
  const count=Number((await c.query('SELECT COUNT(*) AS n FROM rc_questions WHERE stage_id=$1 AND judge_id=$2',[stageId,judgeId])).rows[0].n);
  if(count>=3)throw Error('Tu as déjà posé tes trois questions.');
  const result=(await c.query('INSERT INTO rc_questions(stage_id,judge_id,candidate_id,question) VALUES($1,$2,$3,$4) RETURNING *',[stageId,judgeId,candidateId,body])).rows[0];
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function saveQuestionAnswer(guild,id,candidateId,answer){
 const row=await question(guild,id);
 if(!row||!['collect','published'].includes(row.status)||row.kind!=='questions')throw Error('Les réponses sont closes.');
 const st=await stage(guild,row.stage_id);if(st.questions_posted)throw Error('Les réponses ont déjà été publiées pour notation.');
 if(row.candidate_id!==candidateId)throw Error('Cette question ne t’est pas adressée.');
 return one('INSERT INTO rc_question_answers(question_id,answer) VALUES($1,$2) ON CONFLICT(question_id) DO UPDATE SET answer=$2,updated_at=NOW() RETURNING *',[id,answer]);
}
// Une réponse peut être notée par chaque juge SAUF la candidate elle-même.
async function markQuestionsPosted(guild,stageId){return one(`UPDATE rc_stages SET questions_posted=TRUE
 WHERE id=$1 AND guild_id=$2 AND kind='questions' AND status='published' AND questions_posted=FALSE RETURNING *`,[stageId,guild]);}
async function questionGrades(stageId){return (await q(`SELECT g.*,q.stage_id,q.candidate_id,COALESCE(sn.number,m.number) AS candidate_number
 FROM rc_question_grades g JOIN rc_questions q ON q.id=g.question_id
 JOIN rc_stages s ON s.id=q.stage_id
 JOIN rc_members m ON m.guild_id=s.guild_id AND m.user_id=q.candidate_id
 LEFT JOIN rc_stage_numbers sn ON sn.stage_id=q.stage_id AND sn.candidate_id=q.candidate_id
 WHERE q.stage_id=$1 ORDER BY q.id,g.judge_id`,[stageId])).rows;}
async function gradeQuestion(guild,questionId,judge,grade,comment){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const row=(await c.query(`SELECT q.*,s.status,s.questions_posted,a.answer FROM rc_questions q
   JOIN rc_stages s ON s.id=q.stage_id
   LEFT JOIN rc_question_answers a ON a.question_id=q.id
   WHERE q.id=$1 AND s.guild_id=$2 AND s.kind='questions' FOR UPDATE OF s`,[questionId,guild])).rows[0];
  if(!row||row.status!=='published'||!row.questions_posted||row.answer===null)throw Error('La notation de cette réponse est fermée.');
  const allowed=(await c.query(`SELECT 1 FROM rc_members m WHERE m.guild_id=$1 AND m.user_id=$2
   AND (m.kind='judge' OR EXISTS(SELECT 1 FROM rc_dual_judges d WHERE d.guild_id=m.guild_id AND d.user_id=m.user_id))`,[guild,judge])).rows[0];
  if(!allowed)throw Error('Tu ne fais pas partie du jury.');
  if(row.candidate_id===judge)throw Error('Tu ne peux pas noter ta propre réponse.');
  if(!Number.isInteger(grade)||grade<0||grade>10)throw Error('Note entière entre 0 et 10 obligatoire.');
  const out=(await c.query(`INSERT INTO rc_question_grades(question_id,judge_id,grade,comment)
   VALUES($1,$2,$3,$4) ON CONFLICT(question_id,judge_id) DO UPDATE
   SET grade=$3,comment=$4,updated_at=NOW() RETURNING *`,[questionId,judge,grade,comment])).rows[0];
  await c.query('COMMIT');return out;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
// Par candidate : moyenne des moyennes par question, pas somme des points.
// Aucune question posée ou notée => moyenne NULL (pas un zéro injuste).
async function questionRanking(guild,stageId){return (await q(`WITH answers AS (
 SELECT q.id AS question_id,q.candidate_id FROM rc_questions q
 JOIN rc_question_answers a ON a.question_id=q.id WHERE q.stage_id=$2
 ), per_question AS (
 SELECT a.question_id,a.candidate_id,COUNT(g.grade)::int AS notes,
        AVG(g.grade)::numeric AS moyenne
 FROM answers a LEFT JOIN rc_question_grades g ON g.question_id=a.question_id
 GROUP BY a.question_id,a.candidate_id
 )
 SELECT m.user_id,COALESCE(sn.number,m.number) AS number,m.active,COUNT(p.question_id)::int AS questions,
        COALESCE(SUM(p.notes),0)::int AS notes,
        ROUND(AVG(p.moyenne),2) AS moyenne
 FROM rc_members m LEFT JOIN per_question p ON p.candidate_id=m.user_id
 LEFT JOIN rc_stage_numbers sn ON sn.stage_id=$2 AND sn.candidate_id=m.user_id
 WHERE m.guild_id=$1 AND m.kind='candidate'
 GROUP BY m.user_id,m.number,sn.number,m.active
 ORDER BY moyenne DESC NULLS LAST,number`,[guild,stageId])).rows;}
module.exports={q,one,init,settings,setSetting,isAdmin,addAdmin,removeAdmin,member,members,isDualJudge,addInfiltrator,removeInfiltrator,addMember,removeMember,closeRegistrations,latest,lastTextStage,stage,createStage,setStageStatus,submissions,saveSubmission,grades,setGrade,ranking,eliminate,reset,questions,question,createQuestion,saveQuestionAnswer,markQuestionsPosted,questionGrades,gradeQuestion,questionRanking,melangerNumeros,stageNumberMap};
