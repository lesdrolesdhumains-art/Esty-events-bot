// Tables distinctes : n'effacent et ne modifient jamais les dossiers /probleme.
const pool = require('./db').pool;
const PHASES = ['draft','registrations','presentations','presentation_vote','between','questions','answers','round_vote','ended'];
async function init() {
 await pool.query(`
 CREATE TABLE IF NOT EXISTS dj_sessions (
   guild_id TEXT PRIMARY KEY,
   phase TEXT NOT NULL DEFAULT 'draft',
   announce_channel TEXT, announce_message TEXT,
   judges_channel TEXT, winner_role TEXT, judge_role TEXT,
   round_no INT NOT NULL DEFAULT 0,
   deadline TIMESTAMPTZ,
   vote_message TEXT, vote_channel TEXT, vote_kind TEXT, vote_choices JSONB,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 ALTER TABLE dj_sessions ADD COLUMN IF NOT EXISTS vote_message TEXT;
 ALTER TABLE dj_sessions ADD COLUMN IF NOT EXISTS vote_channel TEXT;
 ALTER TABLE dj_sessions ADD COLUMN IF NOT EXISTS vote_kind TEXT;
 ALTER TABLE dj_sessions ADD COLUMN IF NOT EXISTS vote_choices JSONB;
 CREATE TABLE IF NOT EXISTS dj_users (
   guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
   kind TEXT NOT NULL CHECK(kind IN ('judge','candidate')),
   number INT, active BOOLEAN NOT NULL DEFAULT TRUE,
   score INT NOT NULL DEFAULT 0, presentation TEXT,
   PRIMARY KEY(guild_id,user_id)
 );
 CREATE UNIQUE INDEX IF NOT EXISTS dj_number_unique ON dj_users(guild_id,number) WHERE number IS NOT NULL;
 CREATE TABLE IF NOT EXISTS dj_admins (
   guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(guild_id,user_id)
 );
 CREATE TABLE IF NOT EXISTS dj_questions (
   id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
   round_no INT NOT NULL, judge_id TEXT NOT NULL,
   candidate_id TEXT NOT NULL, question TEXT NOT NULL,
   answer TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   answered_at TIMESTAMPTZ,
   UNIQUE(guild_id,round_no,judge_id)
 );
 CREATE TABLE IF NOT EXISTS dj_votes (
   guild_id TEXT NOT NULL, round_no INT NOT NULL,
   kind TEXT NOT NULL CHECK(kind IN ('presentation','question')),
   judge_id TEXT NOT NULL, choice TEXT NOT NULL,
   PRIMARY KEY(guild_id,round_no,kind,judge_id)
 );
 ALTER TABLE dj_sessions ADD COLUMN IF NOT EXISTS judge_role TEXT;
 `);
}
async function q(sql,params=[]) {return pool.query(sql,params);}
async function one(sql,params=[]) {return (await q(sql,params)).rows[0]||null;}
async function session(guild) {
 await q('INSERT INTO dj_sessions(guild_id) VALUES($1) ON CONFLICT(guild_id) DO NOTHING',[guild]);
 return one('SELECT * FROM dj_sessions WHERE guild_id=$1',[guild]);
}
async function updateSession(guild,changes) {
 const keys=Object.keys(changes);
 if(!keys.length)return session(guild);
 if(!keys.every(k=>['phase','announce_channel','announce_message','judges_channel','winner_role','judge_role','round_no','deadline','vote_message','vote_channel','vote_kind','vote_choices'].includes(k)))throw Error('Champ non permis');
 const sets=keys.map((k,i)=>`${k}=$${i+2}${k==='vote_choices'?'::jsonb':''}`).join(',');
 return one(`UPDATE dj_sessions SET ${sets},updated_at=NOW() WHERE guild_id=$1 RETURNING *`,[guild,...keys.map(k=>changes[k])]);
}
async function phaseTransition(guild,from,to,extra={}){
 const keys=Object.keys(extra);
 if(!keys.every(k=>['deadline','round_no'].includes(k)))throw Error('Transition invalide');
 const setters=keys.map((k,i)=>`${k}=$${i+4}`).join(',');
 return one(`UPDATE dj_sessions SET phase=$3,updated_at=NOW()${setters?','+setters:''} WHERE guild_id=$1 AND phase=$2 RETURNING *`,[guild,from,to,...keys.map(k=>extra[k])]);
}
async function isAdmin(guild,user){return Boolean(await one('SELECT 1 FROM dj_admins WHERE guild_id=$1 AND user_id=$2',[guild,user]));}
async function addAdmin(guild,user){await q('INSERT INTO dj_admins VALUES ($1,$2) ON CONFLICT DO NOTHING',[guild,user]);}
async function removeAdmin(guild,user){await q('DELETE FROM dj_admins WHERE guild_id=$1 AND user_id=$2',[guild,user]);}
async function entry(guild,user){return one('SELECT * FROM dj_users WHERE guild_id=$1 AND user_id=$2',[guild,user]);}
async function upsertEntry(guild,user,kind){
 return one(`INSERT INTO dj_users(guild_id,user_id,kind) VALUES($1,$2,$3)
 ON CONFLICT(guild_id,user_id) DO UPDATE SET kind=$3,number=NULL,active=TRUE,score=0,presentation=NULL
 RETURNING *`,[guild,user,kind]);
}
async function removeEntry(guild,user,kind){await q('DELETE FROM dj_users WHERE guild_id=$1 AND user_id=$2 AND kind=$3',[guild,user,kind]);}
async function entries(guild,kind,activeOnly=false){return (await q(`SELECT * FROM dj_users WHERE guild_id=$1 AND kind=$2 ${activeOnly?'AND active=TRUE':''} ORDER BY number NULLS LAST,user_id`,[guild,kind])).rows;}
async function assignNumbers(guild){
 const c=await pool.connect();
 try{await c.query('BEGIN');
 const r=await c.query("SELECT user_id FROM dj_users WHERE guild_id=$1 AND kind='candidate' ORDER BY RANDOM()",[guild]);
 // Reset first to avoid the unique index while rearranging existing numbers.
 await c.query("UPDATE dj_users SET number=NULL WHERE guild_id=$1 AND kind='candidate'",[guild]);
 for(let k=0;k<r.rows.length;k++) await c.query('UPDATE dj_users SET number=$3 WHERE guild_id=$1 AND user_id=$2',[guild,r.rows[k].user_id,k+1]);
 await c.query('COMMIT'); return r.rows.length;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function savePresentation(guild,user,text){return one("UPDATE dj_users SET presentation=$3 WHERE guild_id=$1 AND user_id=$2 AND kind='candidate' AND active=TRUE RETURNING *",[guild,user,text]);}
async function addQuestion(guild,round,judge,candidate,question){return one(`INSERT INTO dj_questions(guild_id,round_no,judge_id,candidate_id,question) VALUES($1,$2,$3,$4,$5) RETURNING *`,[guild,round,judge,candidate,question]);}
async function question(guild,id){return one('SELECT * FROM dj_questions WHERE guild_id=$1 AND id=$2',[guild,id]);}
async function saveAnswer(guild,id,candidate,text){return one('UPDATE dj_questions SET answer=$4,answered_at=NOW() WHERE guild_id=$1 AND id=$2 AND candidate_id=$3 AND answer IS NULL RETURNING *',[guild,id,candidate,text]);}
async function questions(guild,round){return (await q('SELECT q.*,u.number FROM dj_questions q JOIN dj_users u ON u.guild_id=q.guild_id AND u.user_id=q.candidate_id WHERE q.guild_id=$1 AND q.round_no=$2 ORDER BY q.id',[guild,round])).rows;}
async function vote(guild,round,kind,judge,choice){await q(`INSERT INTO dj_votes(guild_id,round_no,kind,judge_id,choice) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(guild_id,round_no,kind,judge_id) DO UPDATE SET choice=$5`,[guild,round,kind,judge,choice]);}
async function unvote(guild,round,kind,judge,choice){
 return one('DELETE FROM dj_votes WHERE guild_id=$1 AND round_no=$2 AND kind=$3 AND judge_id=$4 AND choice=$5 RETURNING *',[guild,round,kind,judge,choice]);
}
async function votes(guild,round,kind){return (await q('SELECT choice,COUNT(*)::int AS n FROM dj_votes WHERE guild_id=$1 AND round_no=$2 AND kind=$3 GROUP BY choice',[guild,round,kind])).rows;}
async function tally(guild,round,kind,fromPhase){
 const c=await pool.connect();
 try{await c.query('BEGIN');
 const s=(await c.query('SELECT phase FROM dj_sessions WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];
 if(!s||s.phase!==fromPhase){await c.query('ROLLBACK');return null;}
 const ballots=(await c.query('SELECT choice FROM dj_votes WHERE guild_id=$1 AND round_no=$2 AND kind=$3',[guild,round,kind])).rows;
 const counts={};for(const v of ballots){const uid=kind==='presentation'?v.choice:(await c.query('SELECT candidate_id FROM dj_questions WHERE guild_id=$1 AND round_no=$2 AND id::text=$3',[guild,round,v.choice])).rows[0]?.candidate_id;
 if(uid)counts[uid]=(counts[uid]||0)+1;}
 for(const [uid,n] of Object.entries(counts))await c.query('UPDATE dj_users SET score=score+$3 WHERE guild_id=$1 AND user_id=$2',[guild,uid,n]);
 await c.query("UPDATE dj_sessions SET phase='between',updated_at=NOW() WHERE guild_id=$1",[guild]);
 await c.query('COMMIT');return {counts,nb:ballots.length};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function eliminate(guild,user){return one("UPDATE dj_users SET active=FALSE WHERE guild_id=$1 AND user_id=$2 AND kind='candidate' AND active=TRUE RETURNING *",[guild,user]);}
async function reset(guild){
 const c=await pool.connect();try{await c.query('BEGIN');
 for(const t of ['dj_votes','dj_questions','dj_users'])await c.query(`DELETE FROM ${t} WHERE guild_id=$1`,[guild]);
 await c.query("UPDATE dj_sessions SET phase='draft',announce_channel=NULL,announce_message=NULL,round_no=0,deadline=NULL,vote_message=NULL,vote_channel=NULL,vote_kind=NULL,vote_choices=NULL WHERE guild_id=$1",[guild]);
 await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={init,q,one,session,updateSession,phaseTransition,isAdmin,addAdmin,removeAdmin,entry,upsertEntry,removeEntry,entries,assignNumbers,savePresentation,addQuestion,question,saveAnswer,questions,vote,unvote,votes,tally,eliminate,reset};
