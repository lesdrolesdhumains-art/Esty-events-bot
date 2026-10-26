'use strict';
// Grande finale indépendante : création additive, préserve les données rc_* existantes.
const db=require('./reine-db');
const {pool}=require('./db');
const {randomInt}=require('node:crypto');
const q=(sql,params=[])=>db.q(sql,params);
const one=async(sql,params=[])=> (await q(sql,params)).rows[0]||null;
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS rc_finalists (
  stage_id BIGINT NOT NULL REFERENCES rc_stages(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL, final_number SMALLINT NOT NULL CHECK(final_number IN (1,2)),
  PRIMARY KEY(stage_id,candidate_id),UNIQUE(stage_id,final_number)
 );`);
 await q(`CREATE TABLE IF NOT EXISTS rc_final_answers (
  stage_id BIGINT NOT NULL REFERENCES rc_stages(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL, act SMALLINT NOT NULL CHECK(act BETWEEN 1 AND 3),
  title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(stage_id,candidate_id,act),
  FOREIGN KEY(stage_id,candidate_id) REFERENCES rc_finalists(stage_id,candidate_id) ON DELETE CASCADE
 );`);
 await q(`CREATE TABLE IF NOT EXISTS rc_final_grades (
  stage_id BIGINT NOT NULL REFERENCES rc_stages(id) ON DELETE CASCADE,
  judge_id TEXT NOT NULL,candidate_id TEXT NOT NULL,act SMALLINT NOT NULL CHECK(act BETWEEN 1 AND 3),
  grade INT NOT NULL CHECK(grade BETWEEN 0 AND 10), comment TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(stage_id,judge_id,candidate_id,act),
  FOREIGN KEY(stage_id,candidate_id,act) REFERENCES rc_final_answers(stage_id,candidate_id,act) ON DELETE CASCADE
 );`);
}
async function create(guild,title,prompt){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const conf=(await c.query('SELECT registrations_closed FROM rc_settings WHERE guild_id=$1 FOR UPDATE',[guild])).rows[0];
  if(!conf?.registrations_closed)throw Error('Les inscriptions ne sont pas clôturées.');
  const last=(await c.query('SELECT id,status FROM rc_stages WHERE guild_id=$1 ORDER BY id DESC LIMIT 1 FOR UPDATE',[guild])).rows[0];
  if(!last||last.status!=='closed')throw Error('Il faut terminer et clôturer la manche précédente avant la finale.');
  const active=(await c.query("SELECT user_id,number FROM rc_members WHERE guild_id=$1 AND kind='candidate' AND active=TRUE ORDER BY number FOR UPDATE",[guild])).rows;
  if(active.length!==2)throw Error(`La finale nécessite exactement 2 candidates encore actives (actuellement ${active.length}).`);
  const st=(await c.query("INSERT INTO rc_stages(guild_id,title,prompt,kind) VALUES($1,$2,$3,'finale') RETURNING *",[guild,title,prompt])).rows[0];
  const order=randomInt(2)?[active[1],active[0]]:active;
  for(let ix=0;ix<order.length;ix++)await c.query('INSERT INTO rc_finalists(stage_id,candidate_id,final_number) VALUES($1,$2,$3)',[st.id,order[ix].user_id,ix+1]);
  await c.query('COMMIT');return st;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function finalists(stageId){return (await q('SELECT * FROM rc_finalists WHERE stage_id=$1 ORDER BY final_number',[stageId])).rows;}
async function answers(stageId){return (await q('SELECT * FROM rc_final_answers WHERE stage_id=$1 ORDER BY act,candidate_id',[stageId])).rows;}
async function grades(stageId){return (await q('SELECT * FROM rc_final_grades WHERE stage_id=$1 ORDER BY judge_id,act,candidate_id',[stageId])).rows;}
async function saveAnswer(guild,stageId,user,act,title,body){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT status,kind FROM rc_stages WHERE id=$1 AND guild_id=$2 FOR UPDATE',[stageId,guild])).rows[0];
  if(!st||st.kind!=='finale'||st.status!=='collect')throw Error('La réception des textes de la finale est fermée.');
  const f=(await c.query('SELECT 1 FROM rc_finalists WHERE stage_id=$1 AND candidate_id=$2',[stageId,user])).rows[0];
  if(!f)throw Error('Tu ne fais pas partie des deux finalistes.');
  const r=(await c.query(`INSERT INTO rc_final_answers(stage_id,candidate_id,act,title,body)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(stage_id,candidate_id,act) DO UPDATE
    SET title=$4,body=$5,updated_at=NOW() RETURNING *`,[stageId,user,act,title,body])).rows[0];
  await c.query('COMMIT');return r;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function saveGrade(guild,stageId,judge,candidate,act,grade,comment){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT status,kind FROM rc_stages WHERE guild_id=$1 AND id=$2 FOR UPDATE',[guild,stageId])).rows[0];
  if(!st||st.kind!=='finale'||st.status!=='published')throw Error('Les notes de la finale sont fermées.');
  const judgeRow=(await c.query(`SELECT 1 FROM rc_members m WHERE m.guild_id=$1 AND m.user_id=$2 AND
   (m.kind='judge' OR EXISTS(SELECT 1 FROM rc_dual_judges d WHERE d.guild_id=m.guild_id AND d.user_id=m.user_id))`,[guild,judge])).rows[0];
  if(!judgeRow)throw Error('Accès réservé aux juges inscrits.');
  if(judge===candidate)throw Error('Un infiltré ne peut jamais noter sa propre prestation.');
  if(!Number.isInteger(grade)||grade<0||grade>10)throw Error('La note doit être comprise entre 0 et 10.');
  const a=(await c.query('SELECT 1 FROM rc_final_answers WHERE stage_id=$1 AND candidate_id=$2 AND act=$3',[stageId,candidate,act])).rows[0];
  if(!a)throw Error('Aucun texte rendu pour cet acte.');
  const row=(await c.query(`INSERT INTO rc_final_grades(stage_id,judge_id,candidate_id,act,grade,comment)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(stage_id,judge_id,candidate_id,act)
   DO UPDATE SET grade=$5,comment=$6,updated_at=NOW() RETURNING *`,[stageId,judge,candidate,act,grade,comment])).rows[0];
  await c.query('COMMIT');return row;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
// Un bulletin est complet si toutes les réponses éligibles sont notées.
// Les réponses manquantes (publication forcée) valent 0 au score de l'acte,
// sans nécessiter de note ; l'infiltré n'est jamais tenu de se noter lui-même.
async function stats(guild,stageId){
 const [players,ans,marks,judges,st]=await Promise.all([finalists(stageId),answers(stageId),grades(stageId),db.members(guild,'judge',true),db.stage(guild,stageId)]);
 const expected=[];
 for(const j of judges)for(const a of ans)if(j.user_id!==a.candidate_id)expected.push(`${j.user_id}:${a.candidate_id}:${a.act}`);
 const recorded=new Set(marks.map(g=>`${g.judge_id}:${g.candidate_id}:${g.act}`));
 const fullJudges=judges.filter(j=>expected.filter(k=>k.startsWith(j.user_id+':')).every(k=>recorded.has(k)));
 const validIds=new Set(fullJudges.map(x=>x.user_id));
 const validMarks=marks.filter(g=>validIds.has(g.judge_id));
 const scores=players.map(p=>{
  const perAct=[1,2,3].map(act=>{
   if(!ans.some(a=>a.candidate_id===p.candidate_id&&a.act===act))return 0;
   const selected=validMarks.filter(g=>g.candidate_id===p.candidate_id&&g.act===act);
   return selected.length?selected.reduce((sum,g)=>sum+g.grade,0)/selected.length:null;
  });
  return {...p,perAct,total:perAct.every(x=>x!==null)?perAct.reduce((s,x)=>s+x,0):null};
 });
 return {players,answers:ans,grades:marks,judges,stage:st,expected,recorded,fullJudges,scores};
}
async function verdict(guild,stageId,winningNumber){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const st=(await c.query('SELECT status,kind FROM rc_stages WHERE guild_id=$1 AND id=$2 FOR UPDATE',[guild,stageId])).rows[0];
  if(!st||st.kind!=='finale'||st.status!=='closed')throw Error('Clôture les notes de la finale avant de choisir la gagnante.');
  const players=(await c.query('SELECT * FROM rc_finalists WHERE stage_id=$1 ORDER BY final_number',[stageId])).rows;
  if(players.length!==2)throw Error('Deux finalistes nécessaires.');
  const winner=players.find(p=>p.final_number===winningNumber),loser=players.find(p=>p.final_number!==winningNumber);
  if(!winner)throw Error('Choisis le numéro final 1 ou 2.');
  const active=(await c.query("SELECT user_id FROM rc_members WHERE guild_id=$1 AND kind='candidate' AND active=TRUE FOR UPDATE",[guild])).rows;
  if(active.length!==2||!active.some(p=>p.user_id===winner.candidate_id)||!active.some(p=>p.user_id===loser.candidate_id))throw Error('Le verdict a déjà été enregistré ou les deux finalistes ne sont plus actives.');
  await c.query("UPDATE rc_members SET active=FALSE WHERE guild_id=$1 AND user_id=$2 AND kind='candidate'",[guild,loser.candidate_id]);
  await c.query('COMMIT');return {winner,loser};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
module.exports={init,create,finalists,answers,grades,saveAnswer,saveGrade,stats,verdict};
