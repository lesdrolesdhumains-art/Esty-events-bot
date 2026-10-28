'use strict';
/** Réutilise la table de réglages existante. Ne supprime jamais les anciens enregistrements Neon. */
const {pool}=require('./db');
async function init(guildId){
  await pool.query(`CREATE TABLE IF NOT EXISTS wheel_settings (
    guild_id TEXT PRIMARY KEY,
    target_id TEXT,
    mode TEXT NOT NULL DEFAULT 'prive' CHECK(mode IN ('prive','tous')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('INSERT INTO wheel_settings(guild_id) VALUES($1) ON CONFLICT(guild_id) DO NOTHING',[guildId]);
}
async function settings(guild){
  const {rows}=await pool.query('SELECT * FROM wheel_settings WHERE guild_id=$1',[guild]);
  return rows[0]||{guild_id:guild,mode:'prive'};
}
async function setMode(guild,mode){
  if(!['prive','tous'].includes(mode)) throw new Error('Mode non autorisé.');
  await pool.query(`INSERT INTO wheel_settings(guild_id,mode) VALUES($1,$2)
    ON CONFLICT(guild_id) DO UPDATE SET mode=$2,updated_at=NOW()`,[guild,mode]);
}
async function problemStats(guild){
  const {rows}=await pool.query(`SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE state='pending')::int AS pending,
    count(*) FILTER (WHERE state='selected')::int AS selected,
    count(*) FILTER (WHERE state='revealed')::int AS revealed
    FROM problems WHERE guild_id=$1`,[guild]);
  return rows[0]||{total:0,pending:0,selected:0,revealed:0};
}
module.exports={init,settings,setMode,problemStats};
