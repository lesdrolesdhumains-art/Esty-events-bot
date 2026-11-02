'use strict';
/**
 * Mini-tournoi Brawlhalla (duels 1 contre 1) pour Maîtresse du Jeu.
 * Indépendant du moteur Les Drôles de Champions.
 * Usage : /brawl ajouter, /brawl binomes, /brawl resultat, /brawl classement (+ /brawl reset).
 */
const {SlashCommandBuilder, MessageFlags} = require('discord.js');
const {pool, get: getChampionState} = require('./champion-db');

const command = new SlashCommandBuilder()
  .setName('brawl').setDescription('🥊 Tournoi Brawlhalla : duels et classement')
  .addSubcommand(s => s.setName('ajouter').setDescription('Inscrire un pseudo au tournoi')
    .addStringOption(o => o.setName('pseudo').setDescription('Pseudo du joueur').setRequired(true).setMinLength(1).setMaxLength(32)))
  .addSubcommand(s => s.setName('binomes').setDescription('Tirer les prochains duels 1 contre 1'))
  .addSubcommand(s => s.setName('resultat').setDescription('Enregistrer le gagnant d’un duel')
    .addIntegerOption(o => o.setName('duel').setDescription('Numéro du duel tiré au sort').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('gagnant').setDescription('Qui a gagné ?').setRequired(true)
      .addChoices({name:'Joueur 1 du duel',value:'1'}, {name:'Joueur 2 du duel',value:'2'})))
  .addSubcommand(s => s.setName('classement').setDescription('Afficher le classement cumulé du tournoi'))
  .addSubcommand(s => s.setName('reset').setDescription('Effacer un tournoi terminé, pour en recommencer un')
    .addBooleanOption(o => o.setName('confirmer').setDescription('Confirmer la suppression des résultats et des inscriptions').setRequired(true)));

const blank=()=>({version:1,players:[],round:0,nextDuel:1,matches:[],byes:[]});
const normalize = value => String(value||'').trim().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('fr');
const safe = value => String(value).replace(/([\\*_~`|>])/g,'\\$1').replace(/@/g,'@\u200b');
const byId=(s,id)=>s.players.find(p=>p.id===id)?.name||id;
const score=(s)=>s.players.map(p=>{
  const played=s.matches.filter(m=>m.winner && (m.first===p.id||m.second===p.id));
  const wins=played.filter(m=>m.winner===p.id).length;
  return {...p,wins,losses:played.length-wins,played:played.length,byes:s.byes.filter(b=>b.player===p.id).length};
}).sort((a,b)=>b.wins-a.wins || ((b.played?b.wins/b.played:0)-(a.played?a.wins/a.played:0)) || a.losses-b.losses || a.name.localeCompare(b.name,'fr'));
const ranking=(s)=>{
 const list=score(s); if(!list.length)return 'Aucun participant.';
 return list.slice(0,35).map((p,n)=>`${n+1}. ${safe(p.name)} — **${p.wins} pt${p.wins===1?'':'s'}**, ${p.wins} V / ${p.losses} D${p.byes?' · '+p.byes+' exempt.':''}`).join('\n')+
    (list.length>35?`\n… et ${list.length-35} autres candidats.`:'');
};
const pending=s=>s.matches.some(m=>m.round===s.round&&!m.winner);
const countPending=s=>s.matches.filter(m=>m.round===s.round&&!m.winner).length;
const waitPair=(s,first,second)=>s.matches.filter(m=>m.winner && ((m.first===first&&m.second===second)||(m.first===second&&m.second===first))).length;
const shuffle=arr=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
function nextRound(s){
 if(s.players.length<2)throw new Error('Ajoute au moins deux pseudos avant de tirer les duels.');
 if(pending(s))throw new Error(`Termine les ${countPending(s)} duel(s) encore en attente avant de faire un nouveau tirage.`);
 let ids=s.players.map(p=>p.id),bye=null;
 if(ids.length%2){
  const counts=ids.map(id=>({id,n:s.byes.filter(b=>b.player===id).length}));
  const min=Math.min(...counts.map(c=>c.n));
  bye=shuffle(counts.filter(c=>c.n===min).map(c=>c.id))[0];
  ids=ids.filter(id=>id!==bye);
 }
 // Plusieurs mélanges, en privilégiant les adversaires non encore affrontés.
 let best=null,bestPenalty=Infinity;
 for(let attempt=0;attempt<120;attempt++){
  const v=shuffle(ids),pairs=[];let cost=0;
  for(let k=0;k<v.length;k+=2){pairs.push([v[k],v[k+1]]);cost+=waitPair(s,v[k],v[k+1]);}
  if(cost<bestPenalty){best=pairs;bestPenalty=cost;if(cost===0)break;}
 }
 s.round++;
 const drawn=[];
 for(const [a,b] of best){const m={id:s.nextDuel++,round:s.round,first:a,second:b,winner:null};s.matches.push(m);drawn.push(m);}
 if(bye)s.byes.push({round:s.round,player:bye});
 return {drawn,bye};
}
async function init(){await pool.query(`CREATE TABLE IF NOT EXISTS brawl_tournaments (
  guild_id TEXT PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);}
async function transaction(guild,fn){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`brawl:${guild}`]);
  const {rows}=await db.query('SELECT state FROM brawl_tournaments WHERE guild_id=$1 FOR UPDATE',[guild]);
  const state=rows[0]?.state||blank();
  const reply=await fn(state);
  await db.query(`INSERT INTO brawl_tournaments(guild_id,state) VALUES($1,$2::jsonb)
    ON CONFLICT(guild_id) DO UPDATE SET state=$2::jsonb,updated_at=NOW()`,[guild,JSON.stringify(state)]);
  await db.query('COMMIT');
  return reply;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
 finally{db.release();}
}
const chunks=(text,cap=1850)=>{
 const out=[];let chunk='';
 for(const line of text.split('\n')){
  if(chunk && (chunk.length+line.length+1)>cap){out.push(chunk);chunk='';}
  chunk+= (chunk?'\n':'')+line.slice(0,cap);
 }
 if(chunk)out.push(chunk);return out;
};
async function handle(i){
 const sub=i.options.getSubcommand();
 await i.deferReply({flags:sub==='ajouter'||sub==='reset'?MessageFlags.Ephemeral:undefined});
 try{
  const c=await getChampionState(i.guildId);
  const owner=i.user.id===process.env.OWNER_ID;
  const permitted=owner||c.hostId===i.user.id||(c.cohosts||[]).includes(i.user.id);
  if(!permitted)throw new Error('Commande réservée à Esty et aux animateurs désignés dans /champion animateur.');
  const response=await transaction(i.guildId,s=>{
   if(sub==='ajouter'){
    if(s.round>0)throw new Error('Le tournoi a déjà commencé. Ajoute les joueurs avant le premier tirage.');
    const name=i.options.getString('pseudo',true).replace(/\s+/g,' ').trim();
    const id=normalize(name);
    if(!name||name.length>32)throw new Error('Pseudo invalide (maximum 32 caractères).');
    if(s.players.some(p=>p.id===id))throw new Error('Ce pseudo est déjà inscrit.');
    s.players.push({id,name});
    return `✅ **${safe(name)}** inscrit ! Total : **${s.players.length}** joueur(s).`;
   }
   if(sub==='binomes'){
    const {drawn,bye}=nextRound(s);
    return `🥊 **BRAWLHALLA · TIRAGE DU TOUR ${s.round}**\n\n`+
     drawn.map(m=>`**Duel #${m.id}** · 1️⃣ ${safe(byId(s,m.first))} **VS** 2️⃣ ${safe(byId(s,m.second))}`).join('\n')+
     (bye?`\n\n🛋️ **Exempté de ce tour :** ${safe(byId(s,bye))} (aucun point ajouté).`:'')+
     `\n\n🎤 Pour enregistrer un combat : \`/brawl resultat duel:<numéro> gagnant:<joueur 1 ou 2>\``;
   }
   if(sub==='resultat'){
    const id=i.options.getInteger('duel',true),winnerOption=i.options.getString('gagnant',true);
    const match=s.matches.find(m=>m.id===id);
    if(!match)throw new Error(`Duel #${id} introuvable. Vérifie le numéro annoncé au tirage.`);
    if(match.winner)throw new Error('Ce combat est déjà enregistré. Aucun point n’a été ajouté deux fois.');
    const winner=winnerOption==='1'?match.first:match.second;
    const loser=winnerOption==='1'?match.second:match.first;
    match.winner=winner;
    const left=countPending(s);
    const header=`🏆 **Duel #${id} validé !** ${safe(byId(s,winner))} gagne contre ${safe(byId(s,loser))}. **+1 point** pour le vainqueur.\n`;
    return header+(left?`⏳ ${left} duel(s) encore en attente sur ce tour.`:`\n🎉 **TOUR ${s.round} TERMINÉ !** Voici les résultats cumulés :`)+
      `\n\n📊 **Classement général (${s.round} tour${s.round===1?'':'s'})**\n${ranking(s)}`;
   }
   if(sub==='classement'){
    return `📊 **BRAWLHALLA · CLASSEMENT CUMULÉ**\nTour(s) tiré(s) : **${s.round}**\n\n${ranking(s)}`;
   }
   if(sub==='reset'){
    if(i.user.id!==process.env.OWNER_ID)throw new Error('Seule Esty peut réinitialiser le tournoi.');
    if(!i.options.getBoolean('confirmer',true))throw new Error('Annulé. La réinitialisation exige confirmer : vrai.');
    Object.assign(s,blank());
    return '🧹 Nouveau tournoi prêt ! Les pseudos, duels et scores de Brawlhalla ont été effacés. Les Drôles de Champions ne sont pas touchés.';
   }
   throw new Error('Sous-commande inconnue.');
  });
  const parts=chunks(response);await i.editReply({content:parts.shift(),allowedMentions:{parse:[]}});
  for(const more of parts)await i.followUp({content:more,allowedMentions:{parse:[]}});
 }catch(e){
  await i.editReply({content:`❌ ${String(e.message||'Erreur inattendue').slice(0,350)}`,allowedMentions:{parse:[]}});
 }
}
module.exports={command,init,handle,normalize,score,nextRound,blank};
