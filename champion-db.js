'use strict';
const {Pool}=require('pg');
const {initialState}=require('./champion-core');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS champion_states (
  guild_id TEXT PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS champion_questions (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, author_id TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'Général', text TEXT NOT NULL, solution TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 2, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE INDEX IF NOT EXISTS champion_questions_guild_idx ON champion_questions(guild_id,id);`);
}
async function get(guild){
 const {rows}=await pool.query('SELECT state FROM champion_states WHERE guild_id=$1',[guild]);
 return rows[0]?.state||initialState(guild);
}
async function save(guild,state){
 await pool.query(`INSERT INTO champion_states(guild_id,state) VALUES($1,$2::jsonb)
 ON CONFLICT(guild_id) DO UPDATE SET state=$2::jsonb,updated_at=now()`,[guild,JSON.stringify(state)]);
}
async function addQuestion(guild,author,theme,text,solution,points){
 const {rows}=await pool.query(`INSERT INTO champion_questions(guild_id,author_id,theme,text,solution,points)
 VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[guild,author,theme,text,solution,points]); return rows[0].id;
}
async function customQuestions(guild){
 const {rows}=await pool.query('SELECT id,author_id,theme,text,solution,points FROM champion_questions WHERE guild_id=$1 ORDER BY id',[guild]);
 return rows.map(r=>({...r,id:'custom-'+r.id}));
}
async function close(){await pool.end();}
module.exports={pool,init,get,save,addQuestion,customQuestions,close};
