const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS problems (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      question TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      sender TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending','selected','revealed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revealed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS problems_guild_state_idx
      ON problems (guild_id, state, id);
    CREATE UNIQUE INDEX IF NOT EXISTS problems_one_selected_idx
      ON problems (guild_id) WHERE state = 'selected';
    CREATE TABLE IF NOT EXISTS sessions (
      guild_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle','running','paused','ended')),
      next_step INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS polls (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      is_open BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS polls_one_open_idx
      ON polls (guild_id) WHERE is_open = TRUE;
    CREATE TABLE IF NOT EXISTS votes (
      poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (poll_id, user_id)
    );
  `);
}

async function one(query, params = []) {
  const { rows } = await pool.query(query, params);
  return rows[0] || null;
}

async function addProblem(guild, question, target, sender) {
  return one('INSERT INTO problems (guild_id,question,target,sender) VALUES ($1,$2,$3,$4) RETURNING *',
    [guild, question, target, sender]);
}
async function problemById(guild, id) {
  return one('SELECT * FROM problems WHERE guild_id=$1 AND id=$2', [guild, id]);
}
async function listProblems(guild) {
  const { rows } = await pool.query('SELECT * FROM problems WHERE guild_id=$1 ORDER BY id DESC LIMIT 25', [guild]);
  const count = await one('SELECT count(*)::int AS n FROM problems WHERE guild_id=$1', [guild]);
  return { rows, total: count.n };
}
async function updateProblem(guild, id, question, target, sender) {
  return one('UPDATE problems SET question=$3,target=$4,sender=$5 WHERE guild_id=$1 AND id=$2 RETURNING *',
    [guild, id, question, target, sender]);
}
async function deleteProblem(guild, id) {
  return one('DELETE FROM problems WHERE guild_id=$1 AND id=$2 RETURNING id', [guild, id]);
}
async function getSelectedProblem(guild) {
  return one("SELECT * FROM problems WHERE guild_id=$1 AND state='selected'", [guild]);
}
async function drawProblem(guild) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Un seul dossier sélectionné par serveur ; verrou sur la table pendant le tirage.
    await client.query('LOCK TABLE problems IN SHARE ROW EXCLUSIVE MODE');
    const selected = await client.query("SELECT * FROM problems WHERE guild_id=$1 AND state='selected'", [guild]);
    if (selected.rows[0]) { await client.query('COMMIT'); return selected.rows[0]; }
    const { rows } = await client.query(`
      SELECT * FROM problems WHERE guild_id=$1 AND state='pending'
      ORDER BY RANDOM() LIMIT 1 FOR UPDATE`, [guild]);
    if (!rows[0]) { await client.query('COMMIT'); return null; }
    const result = await client.query("UPDATE problems SET state='selected' WHERE id=$1 RETURNING *", [rows[0].id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function revealProblem(guild, id) {
  return one("UPDATE problems SET state='revealed', revealed_at=NOW() WHERE guild_id=$1 AND id=$2 AND state='selected' RETURNING *", [guild, id]);
}
async function returnProblem(guild) {
  return one("UPDATE problems SET state='pending' WHERE guild_id=$1 AND state='selected' RETURNING *", [guild]);
}
async function getSession(guild) {
  return (await one('SELECT * FROM sessions WHERE guild_id=$1', [guild])) || { guild_id: guild, status: 'idle', next_step: 0 };
}
async function startSession(guild) {
  return one(`INSERT INTO sessions(guild_id,status,next_step) VALUES($1,'running',0)
    ON CONFLICT(guild_id) DO UPDATE SET status='running',next_step=0,updated_at=NOW()
    RETURNING *`, [guild]);
}
async function setSessionStatus(guild, newStatus) {
  return one(`INSERT INTO sessions(guild_id,status,next_step) VALUES($1,$2,0)
    ON CONFLICT(guild_id) DO UPDATE SET status=$2,updated_at=NOW()
    RETURNING *`, [guild, newStatus]);
}
async function advanceSession(guild, expectedStep) {
  return one(`UPDATE sessions SET next_step=next_step+1,updated_at=NOW()
    WHERE guild_id=$1 AND next_step=$2 AND status='running' RETURNING *`, [guild, expectedStep]);
}
async function openPoll(guild, question, options) {
  return one('INSERT INTO polls(guild_id,question,options) VALUES($1,$2,$3::jsonb) RETURNING *',
    [guild, question, JSON.stringify(options)]);
}
async function attachPollMessage(id, message) {
  await pool.query('UPDATE polls SET channel_id=$2,message_id=$3 WHERE id=$1', [id, message.channelId, message.id]);
}
async function getOpenPoll(guild) {
  return one('SELECT * FROM polls WHERE guild_id=$1 AND is_open=TRUE', [guild]);
}
async function vote(pollId, userId, index) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM polls WHERE id=$1 FOR UPDATE', [pollId]);
    const poll = r.rows[0];
    if (!poll || !poll.is_open) { await client.query('COMMIT'); return 'closed'; }
    if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) {
      await client.query('COMMIT'); return 'invalid';
    }
    await client.query(`INSERT INTO votes(poll_id,user_id,option_index) VALUES($1,$2,$3)
      ON CONFLICT(poll_id,user_id) DO UPDATE SET option_index=$3,voted_at=NOW()`, [pollId,userId,index]);
    await client.query('COMMIT');
    return 'ok';
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function closePoll(guild) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM polls WHERE guild_id=$1 AND is_open=TRUE FOR UPDATE', [guild]);
    if (!rows[0]) { await client.query('COMMIT'); return null; }
    const poll = rows[0];
    await client.query('UPDATE polls SET is_open=FALSE WHERE id=$1', [poll.id]);
    const counts = await client.query('SELECT option_index,count(*)::int AS n FROM votes WHERE poll_id=$1 GROUP BY option_index', [poll.id]);
    await client.query('COMMIT');
    return { ...poll, counts: counts.rows };
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

module.exports = { pool, initDb, addProblem, problemById, listProblems, updateProblem, deleteProblem,
  getSelectedProblem, drawProblem, revealProblem, returnProblem, getSession, startSession, setSessionStatus,
  advanceSession, openPoll, attachPollMessage, getOpenPoll, vote, closePoll };
