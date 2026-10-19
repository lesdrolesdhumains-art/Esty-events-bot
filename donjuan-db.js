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
 -- Ancien verrou : UNIQUE(guild_id,round_no,judge_id), donc 1 seule question par juge.
 -- Retirer uniquement CETTE contrainte, sans effacer ou modifier les questions existantes.
 ALTER TABLE dj_questions DROP CONSTRAINT IF EXISTS dj_questions_guild_id_round_no_judge_id_key;
 ALTER TABLE dj_sessions ADD COLUMN IF NOT EXISTS judge_role TEXT;
 -- Épreuves supplémentaires isolées ; aucune modification des scores historiques.
 CREATE TABLE IF NOT EXISTS dj_stages (
  guild_id TEXT NOT NULL, stage_no INT NOT NULL CHECK(stage_no BETWEEN 0 AND 3),
  state TEXT NOT NULL CHECK(state IN ('collect','published','closed','eliminated')),
  prompt TEXT NOT NULL, active_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,stage_no)
 );
 CREATE TABLE IF NOT EXISTS dj_stage_participants (
  guild_id TEXT NOT NULL, stage_no INT NOT NULL, candidate_id TEXT NOT NULL,
  PRIMARY KEY(guild_id,stage_no,candidate_id)
 );
 CREATE TABLE IF NOT EXISTS dj_stage_answers (
  guild_id TEXT NOT NULL, stage_no INT NOT NULL, candidate_id TEXT NOT NULL,
  answer TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,stage_no,candidate_id)
 );
 CREATE TABLE IF NOT EXISTS dj_stage_ratings (
  guild_id TEXT NOT NULL, stage_no INT NOT NULL, judge_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL, grade INT NOT NULL CHECK(grade BETWEEN 0 AND 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,stage_no,judge_id,candidate_id)
 );
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
async function addQuestion(guild,round,judge,candidate,question){
 // Chaque soumission est atomique : le verrou de session empêche de dépasser
 // 3 questions en cas de double clic ou de fermer la phase entre 2 requêtes.
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const state=(await c.query('SELECT phase,round_no FROM dj_sessions WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];
  if(!state||state.phase!=='questions'||state.round_no!==round){const e=Error('Round non ouvert');e.code='DJ_PHASE_CHANGED';throw e;}
  const n=Number((await c.query('SELECT COUNT(*)::int AS n FROM dj_questions WHERE guild_id=$1 AND round_no=$2 AND judge_id=$3',[guild,round,judge])).rows[0].n);
  if(n>=3){const e=Error('Limite de trois questions par juge');e.code='DJ_JUDGE_LIMIT';throw e;}
  const total=Number((await c.query('SELECT COUNT(*)::int AS n FROM dj_questions WHERE guild_id=$1 AND round_no=$2',[guild,round])).rows[0].n);
  if(total>=125){const e=Error('Limite technique des menus de vote');e.code='DJ_ROUND_LIMIT';throw e;}
  const eligible=(await c.query("SELECT 1 FROM dj_users WHERE guild_id=$1 AND user_id=$2 AND kind='candidate' AND active=TRUE",[guild,candidate])).rowCount>0;
  if(!eligible){const e=Error('Candidat inactif');e.code='DJ_INVALID_CANDIDATE';throw e;}
  const inserted=(await c.query('INSERT INTO dj_questions(guild_id,round_no,judge_id,candidate_id,question) VALUES($1,$2,$3,$4,$5) RETURNING *',[guild,round,judge,candidate,question])).rows[0];
  await c.query('COMMIT');
  return {...inserted,judge_question_count:n+1};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
 finally{c.release();}
}
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
// ================= SÉLECTION / ÉPREUVES SANS MODIFIER LE CLASSEMENT HISTORIQUE =================
function bottomCut(rows, numberToEliminate, numbers=[]) {
 const sorted=[...rows].sort((a,b)=>Number(a.points)-Number(b.points)||a.number-b.number);
 if(sorted.length<=numberToEliminate)throw Error('Il faut conserver au moins un candidat.');
 const threshold=Number(sorted[numberToEliminate-1].points);
 const must=sorted.filter(x=>Number(x.points)<threshold);
 const tied=sorted.filter(x=>Number(x.points)===threshold);
 const seats=numberToEliminate-must.length;
 if(numbers.length===0&&tied.length>seats){
  const e=Error(`Égalité au seuil : ${tied.map(x=>'#'+x.number).join(', ')} (${threshold}). Il faut départager ces candidats avant confirmation.`);
  e.code='DJ_CUTOFF_TIE';e.tied=tied;e.must=must;throw e;
 }
 const proposed=numbers.length ? sorted.filter(x=>numbers.includes(x.number)) : [...must,...tied.slice(0,seats)];
 if(proposed.length!==numberToEliminate || new Set(numbers).size!==numbers.length || (numbers.length&&numbers.length!==numberToEliminate) || must.some(x=>!proposed.some(y=>y.user_id===x.user_id)) || proposed.some(x=>Number(x.points)>threshold)){
  throw Error(`Sélection invalide : indique exactement ${numberToEliminate} numéros parmi les derniers, sans éliminer un candidat mieux classé.`);
 }
 return proposed;
}
function parseNumbers(input){if(!input)return [];if(!/^\d{1,2}(\s*,\s*\d{1,2})*$/.test(input.trim()))throw Error('Numéros attendus : exemple 2,5,8');return input.split(',').map(x=>Number(x.trim()));}
async function latestStage(guild){return one('SELECT * FROM dj_stages WHERE guild_id=$1 ORDER BY stage_no DESC LIMIT 1',[guild]);}
async function stage(guild,n){return one('SELECT * FROM dj_stages WHERE guild_id=$1 AND stage_no=$2',[guild,n]);}
async function stageAnswers(guild,n){return (await q(`SELECT a.*,u.number,u.active FROM dj_stage_answers a JOIN dj_users u ON u.guild_id=a.guild_id AND u.user_id=a.candidate_id WHERE a.guild_id=$1 AND a.stage_no=$2 ORDER BY u.number`,[guild,n])).rows;}
async function stageRatings(guild,n){return (await q('SELECT * FROM dj_stage_ratings WHERE guild_id=$1 AND stage_no=$2',[guild,n])).rows;}
async function selection(guild,numberList,commit=false){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT phase FROM dj_sessions WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];
  if(st?.phase!=='between')throw Error('Clôture d’abord le vote du round de questions avec /donjuan vote-fermer.');
  const players=(await c.query("SELECT user_id,number,score AS points FROM dj_users WHERE guild_id=$1 AND kind='candidate' AND active=TRUE ORDER BY number FOR UPDATE",[guild])).rows;
  if(players.length!==10)throw Error(`Cette première sélection est prévue pour 10 candidats actifs (actuellement ${players.length}).`);
  const chosen=bottomCut(players,3,numberList);
  if(commit){
   for(const p of chosen)await c.query("UPDATE dj_users SET active=FALSE WHERE guild_id=$1 AND user_id=$2 AND kind='candidate' AND active=TRUE",[guild,p.user_id]);
   await c.query("INSERT INTO dj_stages(guild_id,stage_no,state,prompt,active_count) VALUES($1,0,'eliminated','Sélection initiale sur le classement historique',10)",[guild]);
   await c.query("UPDATE dj_sessions SET phase='challenges',updated_at=NOW() WHERE guild_id=$1",[guild]);
  }
  await c.query('COMMIT');return {chosen,players};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function startStage(guild,n,prompt,expected){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const sess=(await c.query('SELECT phase FROM dj_sessions WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];
  if(sess?.phase!=='challenges')throw Error('La sélection des 10 à 7 n’est pas encore terminée.');
  const last=(await c.query('SELECT stage_no,state FROM dj_stages WHERE guild_id=$1 ORDER BY stage_no DESC LIMIT 1',[guild])).rows[0];
  if(!last||last.stage_no!==n-1||last.state!=='eliminated')throw Error('Il faut terminer et appliquer les éliminations de l’épreuve précédente.');
  const active=Number((await c.query("SELECT COUNT(*)::int AS count FROM dj_users WHERE guild_id=$1 AND kind='candidate' AND active=TRUE",[guild])).rows[0].count);
  if(active!==expected)throw Error(`Cette épreuve doit commencer avec ${expected} candidats actifs, et non ${active}.`);
  const added=(await c.query("INSERT INTO dj_stages(guild_id,stage_no,state,prompt,active_count) VALUES($1,$2,'collect',$3,$4) RETURNING *",[guild,n,prompt,expected])).rows[0];
  await c.query("INSERT INTO dj_stage_participants(guild_id,stage_no,candidate_id) SELECT guild_id,$2,user_id FROM dj_users WHERE guild_id=$1 AND kind='candidate' AND active=TRUE",[guild,n]);
  await c.query('COMMIT');return added;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function saveStageAnswer(guild,n,user,answer){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT state FROM dj_stages WHERE guild_id=$1 AND stage_no=$2 FOR UPDATE',[guild,n])).rows[0];
  if(st?.state!=='collect')throw Error('La collecte des réponses est terminée.');
  const exists=(await c.query("SELECT 1 FROM dj_users WHERE guild_id=$1 AND user_id=$2 AND kind='candidate' AND active=TRUE",[guild,user])).rowCount>0;
  if(!exists)throw Error('Tu ne participes pas à cette épreuve.');
  await c.query(`INSERT INTO dj_stage_answers(guild_id,stage_no,candidate_id,answer) VALUES($1,$2,$3,$4)
   ON CONFLICT(guild_id,stage_no,candidate_id) DO UPDATE SET answer=$4,updated_at=NOW()`,[guild,n,user,answer]);
  await c.query('COMMIT');return true;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function publishStage(guild,n,force){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT * FROM dj_stages WHERE guild_id=$1 AND stage_no=$2 FOR UPDATE',[guild,n])).rows[0];
  if(!st||!['collect','published'].includes(st.state))throw Error('Cette épreuve n’est pas prête pour publication.');
  const count=Number((await c.query('SELECT COUNT(*)::int AS count FROM dj_stage_answers WHERE guild_id=$1 AND stage_no=$2',[guild,n])).rows[0].count);
  if(count===0)throw Error('Aucune réponse reçue.');
  if(st.state==='collect'&&count<st.active_count&&!force)throw Error(`Seulement ${count}/${st.active_count} réponses. Pour publier malgré les absents, utilise forcer:true (leurs notes seront 0).`);
  if(st.state==='collect')await c.query("UPDATE dj_stages SET state='published' WHERE guild_id=$1 AND stage_no=$2",[guild,n]);
  await c.query('COMMIT');return {total:count,expected:st.active_count,repost:st.state==='published'};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function stageRate(guild,n,judge,candidate,grade){
 if(!Number.isInteger(grade)||grade<0||grade>10)throw Error('La note doit être un entier entre 0 et 10.');
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT state FROM dj_stages WHERE guild_id=$1 AND stage_no=$2 FOR UPDATE',[guild,n])).rows[0];
  if(st?.state!=='published')throw Error('Le jury ne peut plus noter cette épreuve.');
  const judgeOk=(await c.query("SELECT 1 FROM dj_users WHERE guild_id=$1 AND user_id=$2 AND kind='judge'",[guild,judge])).rowCount>0;
  const candOk=(await c.query("SELECT 1 FROM dj_users u JOIN dj_stage_answers a ON a.guild_id=u.guild_id AND a.candidate_id=u.user_id AND a.stage_no=$3 WHERE u.guild_id=$1 AND u.user_id=$2 AND u.kind='candidate' AND u.active=TRUE",[guild,candidate,n])).rowCount>0;
  if(!judgeOk||!candOk)throw Error('Juge non inscrite ou candidat sans réponse publiée.');
  await c.query(`INSERT INTO dj_stage_ratings(guild_id,stage_no,judge_id,candidate_id,grade) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(guild_id,stage_no,judge_id,candidate_id) DO UPDATE SET grade=$5,updated_at=NOW()`,[guild,n,judge,candidate,grade]);
  await c.query('COMMIT');return true;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
function calculateStageScores(candidates,answers,ratings,judges){
 const submitted=new Set(answers.map(x=>x.candidate_id));
 const candidateIds=new Set(candidates.map(x=>x.user_id));
 const judgeIds=new Set(judges.map(x=>x.user_id));
 const graded=new Map();
 for(const r of ratings){
  if(!judgeIds.has(r.judge_id)||!submitted.has(r.candidate_id)||!candidateIds.has(r.candidate_id))continue;
  if(!graded.has(r.judge_id))graded.set(r.judge_id,new Map());
  graded.get(r.judge_id).set(r.candidate_id,Number(r.grade));
 }
 const validJudges=[...graded].filter(([id,m])=>m.size===submitted.size).map(([id])=>id);
 const scores=candidates.map(p=>{
  const points=submitted.has(p.user_id)?validJudges.reduce((sum,id)=>sum+graded.get(id).get(p.user_id),0):0;
  return {...p,points,mean:validJudges.length?points/validJudges.length:0,has_answer:submitted.has(p.user_id)};
 });
 return {scores,validJudges,graded,submitted};
}
async function stageCandidates(guild,n){return (await q("SELECT u.* FROM dj_users u JOIN dj_stage_participants p ON p.guild_id=u.guild_id AND p.candidate_id=u.user_id AND p.stage_no=$2 WHERE u.guild_id=$1 ORDER BY u.number",[guild,n])).rows;}
async function stageStats(guild,n){
 const [candidates,judges,answers,ratings]=await Promise.all([
  stageCandidates(guild,n),entries(guild,'judge'),stageAnswers(guild,n),stageRatings(guild,n)]);
 return {...calculateStageScores(candidates,answers,ratings,judges),candidates,judges,answers,ratings};
}
async function closeStage(guild,n){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT state FROM dj_stages WHERE guild_id=$1 AND stage_no=$2 FOR UPDATE',[guild,n])).rows[0];
  if(st?.state!=='published')throw Error('Il faut d’abord publier les réponses et ouvrir la notation.');
  const candidates=(await c.query("SELECT * FROM dj_users WHERE guild_id=$1 AND kind='candidate' AND active=TRUE ORDER BY number",[guild])).rows;
  const judges=(await c.query("SELECT * FROM dj_users WHERE guild_id=$1 AND kind='judge'",[guild])).rows;
  const answers=(await c.query('SELECT * FROM dj_stage_answers WHERE guild_id=$1 AND stage_no=$2',[guild,n])).rows;
  const ratings=(await c.query('SELECT * FROM dj_stage_ratings WHERE guild_id=$1 AND stage_no=$2',[guild,n])).rows;
  const result=calculateStageScores(candidates,answers,ratings,judges);
  if(!result.validJudges.length)throw Error('Aucune juge n’a noté TOUS les candidats ayant répondu. Il faut au moins un bulletin complet pour clôturer.');
  await c.query("UPDATE dj_stages SET state='closed' WHERE guild_id=$1 AND stage_no=$2",[guild,n]);
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function finishStage(guild,n,toEliminate,numbers){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT state FROM dj_stages WHERE guild_id=$1 AND stage_no=$2 FOR UPDATE',[guild,n])).rows[0];
  if(st?.state!=='closed')throw Error('Il faut clôturer la notation de cette épreuve.');
  const candidates=(await c.query("SELECT * FROM dj_users WHERE guild_id=$1 AND kind='candidate' AND active=TRUE ORDER BY number FOR UPDATE",[guild])).rows;
  const judges=(await c.query("SELECT * FROM dj_users WHERE guild_id=$1 AND kind='judge'",[guild])).rows;
  const answers=(await c.query('SELECT * FROM dj_stage_answers WHERE guild_id=$1 AND stage_no=$2',[guild,n])).rows;
  const ratings=(await c.query('SELECT * FROM dj_stage_ratings WHERE guild_id=$1 AND stage_no=$2',[guild,n])).rows;
  const stats=calculateStageScores(candidates,answers,ratings,judges);
  const chosen=bottomCut(stats.scores,toEliminate,numbers);
  for(const p of chosen)await c.query("UPDATE dj_users SET active=FALSE WHERE guild_id=$1 AND user_id=$2 AND kind='candidate' AND active=TRUE",[guild,p.user_id]);
  await c.query("UPDATE dj_stages SET state='eliminated' WHERE guild_id=$1 AND stage_no=$2",[guild,n]);
  await c.query('COMMIT');return {chosen,stats};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function reset(guild){
 const c=await pool.connect();try{await c.query('BEGIN');
 for(const t of ['dj_stage_ratings','dj_stage_answers','dj_stage_participants','dj_stages','dj_votes','dj_questions','dj_users'])await c.query(`DELETE FROM ${t} WHERE guild_id=$1`,[guild]);
 await c.query("UPDATE dj_sessions SET phase='draft',announce_channel=NULL,announce_message=NULL,round_no=0,deadline=NULL,vote_message=NULL,vote_channel=NULL,vote_kind=NULL,vote_choices=NULL WHERE guild_id=$1",[guild]);
 await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={init,q,one,session,updateSession,phaseTransition,isAdmin,addAdmin,removeAdmin,entry,upsertEntry,removeEntry,entries,assignNumbers,savePresentation,addQuestion,question,saveAnswer,questions,vote,unvote,votes,tally,eliminate,reset,parseNumbers,bottomCut,latestStage,stage,stageAnswers,stageRatings,stageCandidates,selection,startStage,saveStageAnswer,publishStage,stageRate,calculateStageScores,stageStats,closeStage,finishStage};
