'use strict';
function wordsOf(text) { return String(text || '').trim().split(/\s+/u).filter(Boolean); }
function showWords(text, n) { return wordsOf(text).slice(0, n).join(' '); }
function clamp(n,a,b) { return Math.max(a, Math.min(b,n)); }
function qualified(players, scores, count) {
  if (!Number.isInteger(count) || count < 1 || count > players.length)
    throw new Error(`Le nombre de qualifiés doit être entre 1 et ${players.length}.`);
  const sorted = [...players].sort((a,b) => (scores[b]||0)-(scores[a]||0) || a.localeCompare(b));
  const floor = scores[sorted[count-1]]||0;
  const next = count<sorted.length ? (scores[sorted[count]]||0) : null;
  if (next !== null && floor === next) return { tie: true, at: floor, players: sorted.filter(id=>(scores[id]||0)===floor), ranked: sorted };
  return { tie:false, chosen: sorted.slice(0,count), ranked:sorted };
}
function finalPoints(fraction) { return fraction<=0.25?4:fraction<=0.5?3:fraction<=0.75?2:1; }
function initialState(guild) { return {
  guildId:guild, ownerId:'', hostId:null, cohosts:[], players:[],
  channelId:null, boardMessageId:null, status:'idle', round:1,
  eligible:[], scores:{'1':{},'2':{},'3':{}},
  settings:{qualifiers:{'1':null,'2':null},format:{'1':'classement','2':'classement'},objective:{'1':9,'2':4},questionCap:{'1':30,'2':15}},
  questionsCount:0, question:null, serie:null, tieBreakIds:[], used:[], log:[]
}; }
function isStaff(s,id,ownerId) { return id===ownerId || s.hostId===id || s.cohosts.includes(id); }
function canBuzz(s,id) { return s.status==='running' && s.question?.phase==='revealing' && s.eligible.includes(id) && !s.question.banned?.includes(id) && (!s.tieBreakIds?.length || s.tieBreakIds.includes(id)) && (s.round!==2 || s.settings.format['2']!=='serie' || s.serie?.candidate===id || (s.tieBreakIds||[]).includes(id)); }
module.exports={wordsOf,showWords,clamp,qualified,finalPoints,initialState,isStaff,canBuzz};
