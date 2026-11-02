'use strict';
require('dotenv').config();
const crypto=require('node:crypto');
const {
 Client,Events,GatewayIntentBits,ActionRowBuilder,ButtonBuilder,ButtonStyle,
 ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags,REST,Routes,EmbedBuilder
}=require('discord.js');
const commands=require('./commands');
const database=require('./champion-db');
const bank=require('./banque');
const {wordsOf,showWords,qualified,finalPoints,initialState,isStaff,canBuzz}=require('./champion-core');
const REQUIRED=['DISCORD_TOKEN','GUILD_ID','OWNER_ID','DATABASE_URL'];
const missing=REQUIRED.filter(x=>!process.env[x]||/^(COLLER_|TON_|ID_|postgresql:\/\/utilisateur)/.test(process.env[x]));
if(missing.length) { console.error('❌ Variables obligatoires absentes : '+missing.join(', '));process.exit(1); }
const GUILD=process.env.GUILD_ID,OWNER=process.env.OWNER_ID,E=MessageFlags.Ephemeral;
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const locks=new Map();
function serial(key,fn){
 const before=locks.get(key)||Promise.resolve();
 const work=before.catch(()=>{}).then(fn);
 locks.set(key,work);
 work.finally(()=>{if(locks.get(key)===work) locks.delete(key);}).catch(()=>{});
 return work;
}
const pub=(s)=>({allowedMentions:{parse:[]},...s});
const eph=(msg)=>({content:msg,flags:E,allowedMentions:{parse:[]}});
const mention=id=>`<@${id}>`;
const assert=(cond,msg)=>{if(!cond)throw new Error(msg);};
const isOwner=id=>id===OWNER;
const staff=(state,id)=>isStaff(state,id,OWNER);
async function state(){return database.get(GUILD);}
async function persist(s){await database.save(GUILD,s);}
async function room(s){
 const id=s.channelId||process.env.ANIMATION_CHANNEL_ID;
 assert(id,'Définis d’abord le salon avec /champion installer salon:…');
 const channel=await client.channels.fetch(id);
 assert(channel?.isTextBased()&&typeof channel.send==='function','Le bot ne peut pas envoyer de messages dans ce salon.');
 return channel;
}
function rankText(s,n=10){
 const scores=s.scores[String(s.round)]||{};
 const users=[...s.eligible].sort((a,b)=>(scores[b]||0)-(scores[a]||0)||a.localeCompare(b));
 return users.slice(0,n).map((id,j)=>`${j+1}. ${mention(id)} — **${scores[id]||0} pt${(scores[id]||0)>1?'s':''}**`).join('\n') || 'Aucun candidat inscrit';
}
function boardEmbed(s){
 const q=s.question;
 const em=new EmbedBuilder().setColor(q?.phase==='awaiting' || q?.phase==='judging' ? 0xe49b3b : 0x704ab8)
 .setTitle(`🏆 Les Drôles de Champions · Manche ${s.round}/3`)
 .setFooter({text:`${s.eligible.length} candidat(s) · 5 mots / 2 secondes · Validation humaine`});
 if(s.status==='ended')em.setDescription('🏁 Partie terminée !\n\n'+rankText(s,10));
 else if(!q)em.setDescription('🎤 Le plateau est prêt. L’animateur peut lancer une question.\n\n**Classement**\n'+rankText(s,10));
 else {
  const words=wordsOf(q.text);
  const partial=q.oralBlank?'🎙️ L’animateur pose la question à l’oral.':(showWords(q.text,q.shown)||'La question va commencer…');
  const label=q.phase==='revealing' ? (s.status==='paused'?'⏸️ Pause':'🔴 BUZZER OUVERT') : q.phase==='awaiting'?'⚡ Buzz verrouillé : réponse en cours' : q.phase==='judging'?'⚖️ Validation de l’animateur' : '✅ Question terminée';
  em.setDescription(`**Question ${s.questionsCount} · ${q.theme}**\n\n${partial}\n\n**${label}**`);
  if(s.round===2 && s.settings.format['2']==='serie' && s.serie?.candidate)em.addFields({name:'⏱️ 4 à la suite',value:`Candidat : ${mention(s.serie.candidate)} · Série : **${s.serie.streak}/4** · Temps restant : **${Math.ceil(s.serie.remaining/1000)} s**`});
  if(q.phase==='awaiting')em.addFields({name:'⚡ Premier buzz',value:`${mention(q.buzzUser)} a la parole et doit répondre **à l’écrit**.`});
  if(q.phase==='judging')em.addFields({name:`📝 Réponse de ${mention(q.buzzUser)}`,value:q.answerText||'(vide)'},{name:'Verdict',value:'L’animateur doit cliquer sur ✅ Bonne ou ❌ Mauvaise.'});
  if(q.phase==='closed')em.addFields({name:'Résultat',value:q.result||'Question clôturée.'});
  if(q.phase==='revealing' && words.length && q.shown>=words.length && !q.oralBlank)em.addFields({name:'Question entière',value:'Le buzzer reste disponible.'});
  em.addFields({name:'🏅 Classement provisoire',value:rankText(s,8).slice(0,1024)});
 }
 return em;
}
function boardButtons(s){
 const q=s.question;
 if(!q || q.phase==='closed' || s.status==='ended') return [];
 const open=s.status==='running' && q.phase==='revealing';
 const series=s.round===2 && s.settings.format['2']==='serie' && !!s.serie?.candidate;
 const buzz=new ButtonBuilder().setCustomId(`champ:buzz:${q.id}`).setLabel(series?'✍️ RÉPONDRE (candidat du tour)':'⚡ BUZZER !').setStyle(ButtonStyle.Danger).setDisabled(!open);
 const show=new ButtonBuilder().setCustomId(`champ:solution:${q.id}`).setLabel('🔎 Voir la solution').setStyle(ButtonStyle.Secondary).setDisabled(q.phase!=='judging');
 const good=new ButtonBuilder().setCustomId(`champ:good:${q.id}`).setLabel('✅ Bonne réponse').setStyle(ButtonStyle.Success).setDisabled(q.phase!=='judging');
 const bad=new ButtonBuilder().setCustomId(`champ:bad:${q.id}`).setLabel('❌ Mauvaise réponse').setStyle(ButtonStyle.Danger).setDisabled(q.phase!=='judging');
 const skip=new ButtonBuilder().setCustomId(`champ:skip:${q.id}`).setLabel('⏭ Passer').setStyle(ButtonStyle.Secondary);
 return [new ActionRowBuilder().addComponents(buzz),new ActionRowBuilder().addComponents(show,good,bad,skip)];
}
async function paint(s){
 const ch=await room(s);const payload=pub({embeds:[boardEmbed(s)],components:boardButtons(s)});
 if(s.boardMessageId){try{
  const m=await ch.messages.fetch(s.boardMessageId);
  await m.edit(payload);return;
 }catch(err){console.warn('Ancien plateau inaccessible, nouveau plateau :',err.message);}}
 const msg=await ch.send(payload);s.boardMessageId=msg.id;await persist(s);
}
async function notice(s,message){const ch=await room(s);await ch.send(pub({content:message.slice(0,1950)}));}
function modalRow(id,label,style=TextInputStyle.Short,value='',required=true,maxLength=900){
 const t=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(maxLength);
 if(value)t.setValue(value.slice(0,maxLength));return new ActionRowBuilder().addComponents(t);
}
function newQuestionModal(){return new ModalBuilder().setCustomId('champ:add')
 .setTitle('Ajouter une question secrète')
 .addComponents(modalRow('theme','Thème (ex : Culture)',TextInputStyle.Short,'',true,80),
 modalRow('text','Question à afficher',TextInputStyle.Paragraph,'',true,900),
 modalRow('solution','Réponse correcte (secrète)',TextInputStyle.Paragraph,'',true,400),
 modalRow('points','Points (1 à 4)',TextInputStyle.Short,'2',true,1));}
function answerModal(q){return new ModalBuilder().setCustomId(`champ:answer:${q.id}`)
 .setTitle('⚡ Tu as buzzé !')
 .addComponents(modalRow('answer','Écris ta réponse (20 secondes)',TextInputStyle.Paragraph,'',true,300));}
async function availableQuestion(s,theme){
 const customs=await database.customQuestions(GUILD);
 const all=[...bank,...customs];
 const usable=all.filter(q=>!s.used.includes(q.id) && (!theme||q.theme.toLocaleLowerCase('fr').includes(theme.toLocaleLowerCase('fr')))
  && (!q.author_id || !s.eligible.includes(q.author_id)));
 if(!usable.length)return null;
 return usable[Math.floor(Math.random()*usable.length)];
}
function createQuestion(s,q,mode){
 s.questionsCount++;
 s.used.push(q.id);
 s.question={id:crypto.randomUUID().slice(0,8),source:q.id,theme:q.theme||'À l’oral',text:q.text||'',solution:q.solution||'',points:q.points||2,
  mode,phase:'revealing',shown:0,lastReveal:Date.now(),buzzUser:null,answerText:null,deadline:null,
  result:null,banned:[],oralBlank:!q.text};
}
async function launchQuestion(s,mode,theme,text,points){
 assert(s.status==='running','La partie doit être en cours.');
 assert(!s.question || s.question.phase==='closed','Termine ou passe la question actuelle.');
 let q;
 if(mode==='automatique'){
  q=await availableQuestion(s,theme);
  assert(q,'Plus de questions inédites dans ce thème (ou créées par des candidats actifs).');
 }else{
  q={id:'oral-'+crypto.randomUUID(),theme:'Question orale',text:text||'',solution:'',points:points||2};
 }
 q.points=points||q.points||2;
 createQuestion(s,q,mode);
 await persist(s);await paint(s);
 await notice(s,`🎤 **Nouvelle question !** Manche ${s.round} · ${s.question.theme}\n⚡ Le buzzer est ouvert : les mots apparaissent progressivement.`);
}
async function closeQuestion(s,message){assert(s.question,'Aucune question en cours.');s.question.phase='closed';s.question.result=message;
 s.question.deadline=null;await persist(s);await paint(s);}
async function nextSeriesQuestion(s){
 const pick=await availableQuestion(s,null);
 assert(pick,'Banque épuisée pour le 4 à la suite. Ajoute des questions.');
 createQuestion(s,pick,'automatique');
 s.serie.lastClock=Date.now();
 await persist(s);await paint(s);
}
async function finishSeries(s){
 const sr=s.serie;assert(sr?.candidate,'Aucun candidat en tour de série.');
 const id=sr.candidate,best=sr.best;
 s.scores['2'][id]=best;
 sr.turns[id]=best;
 sr.candidate=null;
 if(s.question){s.question.phase='closed';s.question.result=`⏱️ Tour terminé : ${mention(id)} a obtenu une meilleure série de ${best}/4.`;}
 s.log.push({type:'series_finished',candidate:id,best,at:new Date().toISOString()});
 await persist(s);await paint(s);
 await notice(s,`⏱️ **Fin du 4 à la suite pour ${mention(id)} !** Meilleure série : **${best}/4**. Animateur, lance le tour du candidat suivant.`);
}
async function judgeSeries(s,good,judgeId){
 const q=s.question,sr=s.serie;
 assert(q?.phase==='judging'&&sr?.candidate,'Pas de réponse en série à valider.');
 assert(q.buzzUser===sr.candidate,'Seul le candidat de la série peut répondre.');
 if(good){sr.streak++;sr.best=Math.max(sr.best,sr.streak);}
 else sr.streak=0;
 s.log.push({type:'series_verdict',judge:judgeId,candidate:sr.candidate,question:q.source,answer:q.answerText,good,streak:sr.streak,at:new Date().toISOString()});
 await notice(s,`${good?'✅ Bonne réponse !':'❌ Mauvaise réponse !'} ${mention(sr.candidate)} · Série **${sr.streak}/4** (record ${sr.best}/4).`);
 if(sr.streak>=4 || sr.remaining<=0)await finishSeries(s);
 else await nextSeriesQuestion(s);
}
async function judge(s,good,judgeId){
 const q=s.question;assert(q && q.phase==='judging','Aucune réponse à valider.');
 const p=mention(q.buzzUser),candidate=q.buzzUser;
 const scores=s.scores[String(s.round)]||(s.scores[String(s.round)]={});
 if(good){
  const points=s.round===3 && !q.oralBlank ? finalPoints(q.shown/Math.max(1,wordsOf(q.text).length)) : q.points;
  scores[candidate]=(scores[candidate]||0)+points;
  const result=`✅ **Bonne réponse !** ${p} gagne **${points} point(s)**. Réponse attendue : **${q.solution||'Validée par l’animateur'}**.`;
  s.log.push({type:'verdict',question:q.source,judge:judgeId,candidate,answer:q.answerText,good:true,points,at:new Date().toISOString()});
  s.tieBreakIds=[];await closeQuestion(s,result);await notice(s,result);
  if(s.round===3 && scores[candidate]>=12){
   s.status='ended';await persist(s);await paint(s);
   await notice(s,`👑 **CHAMPION DE LA SOIRÉE : ${p} !** Le premier à 12 points remporte la finale ! 🏆`);
  }
 }else{
  s.log.push({type:'verdict',question:q.source,judge:judgeId,candidate,answer:q.answerText,good:false,points:0,at:new Date().toISOString()});
  q.phase='revealing';q.buzzUser=null;q.answerText=null;q.deadline=null;q.lastReveal=Date.now();
  await persist(s);await paint(s);
  await notice(s,`❌ **Mauvaise réponse de ${p} !** La question continue. ⚡ Tous les joueurs, y compris ${p}, peuvent rebuzzer tant qu’ils n’ont pas consulté la solution.`);
 }
}
function formatScores(s,round=s.round){
 const ids=round===s.round?s.eligible:s.players;
 const scores=s.scores[String(round)]||{};
 return [...ids].sort((a,b)=>(scores[b]||0)-(scores[a]||0)||a.localeCompare(b)).map((id,k)=>`${k+1}. ${mention(id)} — ${scores[id]||0} point(s)`).join('\n');
}
async function doChat(i){
 const group=i.options.getSubcommandGroup(false),sub=i.options.getSubcommand();
 if(sub==='ajouter'&&group==='question') {
  const s=await state();assert(staff(s,i.user.id),'Réservé à un animateur.');return i.showModal(newQuestionModal());
 }
 await i.deferReply({flags:E});
 return serial(GUILD,async()=>{
 const s=await state();const user=i.user.id;
 const canAdmin=staff(s,user);
 if(group==='animateur'){
  assert(isOwner(user),'Seule Esty (OWNER_ID) désigne les animateurs.');
  const target=i.options.getUser('membre');
  if(sub==='liste')return i.editReply(`👑 Principal : ${s.hostId?mention(s.hostId):'non défini'}\n🎤 Coanimateurs : ${s.cohosts.length?s.cohosts.map(mention).join(', '):'aucun'}`);
  assert(target && !target.bot,'Sélectionne un membre humain.');
  if(sub==='definir'||sub==='remplacer'){
   s.cohosts=s.cohosts.filter(id=>id!==target.id);
   s.hostId=target.id;
  }else if(sub==='ajouter'){
   assert(target.id!==s.hostId,'Cette personne est déjà animatrice principale.');
   if(!s.cohosts.includes(target.id))s.cohosts.push(target.id);
  }else if(sub==='retirer'){
   if(s.hostId===target.id)s.hostId=null;s.cohosts=s.cohosts.filter(x=>x!==target.id);
  }
  await persist(s);return i.editReply('✅ Équipe d’animation mise à jour.');
 }
 if(sub==='aide')return i.editReply('🏆 **Ordre recommandé**\n`/champion installer` → `/champion animateur definir` → `/champion joueur ajouter` → `/champion manche configurer` → `/champion partie lancer` → `/champion question lancer`\nPuis boutons BUZZER / Bonne / Mauvaise. Pour passer aux qualifiés : `/champion manche suivante`.');
 assert(canAdmin,'Commande réservée aux animateurs désignés ou à Esty.');
 if(sub==='installer'){
  const ch=i.options.getChannel('salon');assert(ch,'Salon manquant.');
  s.channelId=ch.id;s.boardMessageId=null;await persist(s);await paint(s);return i.editReply(`✅ Plateau installé dans ${ch}.`);
 }
 if(group==='joueur'){
  if(sub==='liste'){const page=i.options.getInteger('page')||1;return i.editReply(`🏆 **${s.players.length} inscrits — page ${page}/${Math.max(1,Math.ceil(s.players.length/20))}**\n${s.players.slice((page-1)*20,page*20).map((id,k)=>`${(page-1)*20+k+1}. ${mention(id)} ${s.eligible.includes(id)?'✅':''}`).join('\n')||'Aucun inscrit sur cette page.'}`);}
  if(sub==='vider'){
   assert(s.status==='idle'||s.status==='ended','Impossible de vider les joueurs pendant une partie.');
   s.players=[];s.eligible=[];await persist(s);await paint(s);return i.editReply('🧹 Inscriptions vidées.');
  }
  const target=i.options.getUser('membre');assert(target&&!target.bot,'Choisis un candidat humain.');
  if(sub==='ajouter'){
   assert(s.status==='idle'||s.status==='ended','Ajout possible avant le lancement.');
   if(!s.players.includes(target.id))s.players.push(target.id);
  }else if(sub==='retirer'){
   assert(s.status==='idle'||s.status==='ended','Retrait possible avant le lancement.');
   s.players=s.players.filter(x=>x!==target.id);
  }
  await persist(s);await paint(s);return i.editReply(`✅ ${s.players.length} candidat(s) inscrits. Aucun plafond configuré.`);
 }
 if(group==='partie'){
  if(sub==='statut')return i.editReply(`🏆 Statut : **${s.status}** · Manche **${s.round}/3** · Candidats **${s.players.length}** · Encore en jeu **${s.eligible.length}** · Question **${s.questionsCount}**\nAnimation : ${s.hostId?mention(s.hostId):'Esty'} · Plateforme : ${s.channelId?`<#${s.channelId}>`:'non installée'}`);
  if(sub==='lancer'){
   assert(s.status==='idle'||s.status==='ended','Une partie est déjà active.');
   assert(s.players.length>=2,'Inscris au moins deux candidats.');
   s.status='running';s.round=1;s.eligible=[...s.players];s.scores={'1':{},'2':{},'3':{}};s.used=[];s.questionsCount=0;s.question=null;s.serie=null;s.tieBreakIds=[];s.log=[];
   s.boardMessageId=null;await persist(s);await paint(s);await notice(s,'🎤 **Les Drôles de Champions commencent !** Les candidats ont été inscrits manuellement. Première question à venir !');
   return i.editReply('🏆 Partie lancée ! Utilise `/champion question lancer`.');
  }
  if(sub==='pause'){
   assert(s.status==='running','Aucune partie active.');s.status='paused';await persist(s);await paint(s);return i.editReply('⏸️ Partie en pause.');
  }
  if(sub==='reprendre'){
   assert(s.status==='paused','Aucune partie en pause.');s.status='running';
   if(s.question){s.question.lastReveal=Date.now();if(s.question.phase==='awaiting')s.question.deadline=Date.now()+20000;}
   if(s.serie?.candidate)s.serie.lastClock=Date.now();
   await persist(s);await paint(s);return i.editReply('▶️ Partie reprise.');
  }
  if(sub==='terminer'){
   s.status='ended';if(s.question && s.question.phase!=='closed')s.question.phase='closed';
   await persist(s);await paint(s);
   await notice(s,`🏁 **Fin des Drôles de Champions !**\n${formatScores(s).slice(0,1750)}`);
   return i.editReply('🏁 Partie terminée et scores sauvegardés.');
  }
 }
 if(group==='manche'){
  if(sub==='configurer'){
   const n=i.options.getInteger('numero'),qual=i.options.getInteger('qualifies'),fmt=i.options.getString('format')||'classement';
   assert(n===1||n===2,'Seules les manches 1 et 2 éliminent des candidats.');
   assert(fmt!=='serie'||n===2,'Le 4 à la suite est réservé à la manche 2.');
   assert(qual>=1,'Il faut au moins un qualifié.');
   const obj=i.options.getInteger('objectif')||9,limit=i.options.getInteger('questions')||30;
   s.settings.qualifiers[String(n)]=qual;s.settings.format[String(n)]=fmt;
   s.settings.objective[String(n)]=obj;s.settings.questionCap[String(n)]=limit;
   await persist(s);return i.editReply(`✅ Manche ${n} : ${qual} qualifié(s), méthode **${fmt}**${fmt==='objectif'?`, score cible ${obj}`:', classement selon les scores'} !`);
  }
  if(sub==='departager'){
   assert(s.status==='running'&&s.round<3,'Le départage nécessite une manche 1 ou 2 en cours.');
   assert(!s.question||s.question.phase==='closed','Termine la question en cours.');
   const n=s.settings.qualifiers[String(s.round)];
   assert(Number.isInteger(n),'Configure le nombre de qualifiés.');
   const r=qualified(s.eligible,s.scores[String(s.round)],n);
   assert(r.tie,'Aucune égalité à départager à la frontière des qualifications.');
   const pick=await availableQuestion(s,null);assert(pick,'Plus de questions inédites pour départager.');
   s.tieBreakIds=r.players;
   s.question=null;createQuestion(s,{...pick,points:1},'automatique');
   await persist(s);await paint(s);
   await notice(s,`⚖️ **QUESTION DE DÉPARTAGE !** Égalité à ${r.at} point(s). Candidats concernés : ${r.players.map(mention).join(', ')}. Seuls les ex æquo peuvent buzzer.`);
   return i.editReply('⚖️ Question de départage lancée.');
  }
  if(sub==='tour'){
   assert(s.round===2 && s.settings.format['2']==='serie','Active le format 4 à la suite pour la manche 2.');
   assert(s.status==='running','La partie doit être en cours.');
   assert(!s.serie?.candidate && !s.tieBreakIds?.length,'Termine d’abord le tour actif ou le départage.');
   const target=i.options.getUser('membre',true);
   assert(s.eligible.includes(target.id),'Ce membre n’est pas qualifié pour cette manche.');
   s.serie=s.serie||{candidate:null,turns:{}};
   assert(!(target.id in s.serie.turns),'Ce candidat a déjà joué son tour.');
   s.serie.candidate=target.id;s.serie.streak=0;s.serie.best=0;s.serie.remaining=40000;s.serie.lastClock=Date.now();
   s.question=null;await nextSeriesQuestion(s);
   await notice(s,`⏱️ **4 À LA SUITE : c’est au tour de ${mention(target.id)} !** Il dispose de 40 secondes de lecture active pour enchaîner 4 bonnes réponses.`);
   return i.editReply('✅ Tour lancé, réponse réservée au candidat désigné.');
  }
  if(sub==='suivante'){
   assert(s.status==='running'||s.status==='paused','Lance la partie avant de qualifier.');
   assert(s.round<3,'La troisième manche est la finale.');
   assert(!s.question||s.question.phase==='closed','Termine d’abord la question en cours.');
   if(s.round===2 && s.settings.format['2']==='serie')assert(s.serie && Object.keys(s.serie.turns).length===s.eligible.length,'Tous les candidats doivent terminer leur 4 à la suite avant les qualifications.');
   const n=s.settings.qualifiers[String(s.round)];
   assert(Number.isInteger(n),'Définis le nombre de qualifiés avec /champion manche configurer.');
   const sc=s.scores[String(s.round)]||{};
   const fmt=s.settings.format[String(s.round)];
   if(fmt==='objectif'){
    const already=s.eligible.filter(id=>(sc[id]||0)>=s.settings.objective[String(s.round)]);
    assert(already.length>=n,`Seuls ${already.length} candidat(s) ont atteint le score cible ; il en faut ${n}.`);
   }
   const result=qualified(s.eligible,sc,n);
   assert(!result.tie,`ÉGALITÉ à ${result.at} point(s) pour la qualification. Fais jouer une question de départage puis relance /champion manche suivante.`);
   s.round++;s.eligible=result.chosen;s.question=null;s.serie=null;s.tieBreakIds=[];s.questionsCount=0;s.boardMessageId=null;
   await persist(s);await paint(s);await notice(s,`🎉 **Qualifiés pour la manche ${s.round} :**\n${s.eligible.map(mention).join('\n')}`);
   return i.editReply(`✅ Manche ${s.round} ouverte avec **${s.eligible.length} candidats**.`);
  }
 }
 if(group==='question'){
  if(sub==='liste'){
   const custom=await database.customQuestions(GUILD);
   const cat=[...new Set([...bank,...custom].map(q=>q.theme))].sort();
   return i.editReply(`📚 Banque intégrée : **${bank.length} questions**. Personnalisées : **${custom.length}**.\nThèmes : ${cat.join(', ')}\nLes questions créées par un candidat actif sont exclues du tirage.`);
  }
  if(sub==='lancer'){
   const mode=i.options.getString('mode',true),theme=i.options.getString('theme'),txt=i.options.getString('texte'),points=i.options.getInteger('points');
   assert(!(s.round===2&&s.settings.format['2']==='serie'),'En 4 à la suite, utilise /champion manche tour : les questions suivent automatiquement.');
   await launchQuestion(s,mode,theme,txt,points);return i.editReply('✅ Question lancée, buzzer ouvert.');
  }
  if(sub==='passer'){
   if(s.round===2&&s.settings.format['2']==='serie'&&s.serie?.candidate){s.serie.streak=0;await nextSeriesQuestion(s);await notice(s,'⏭️ Question passée : série remise à zéro, question suivante.');return i.editReply('Question passée, série remise à zéro.');}
   assert(s.question && s.question.phase!=='closed','Aucune question active.');
   await closeQuestion(s,'⏭️ Question passée, aucun point attribué.');
   await notice(s,'⏭️ Question passée par l’animateur.');return i.editReply('Question passée.');
  }
 }
 if(group==='score'){
  if(sub==='classement'){const page=i.options.getInteger('page')||1;const scores=s.scores[String(s.round)]||{};const ranking=[...s.eligible].sort((a,b)=>(scores[b]||0)-(scores[a]||0)||a.localeCompare(b));return i.editReply(`🏅 **Manche ${s.round} · page ${page}/${Math.max(1,Math.ceil(ranking.length/20))}**\n${ranking.slice((page-1)*20,page*20).map((id,k)=>`${(page-1)*20+k+1}. ${mention(id)} — ${scores[id]||0} point(s)`).join('\n')||'Aucun score.'}`);}
  if(sub==='corriger'){
   const target=i.options.getUser('membre'),points=i.options.getInteger('points',true);
   assert(s.players.includes(target.id),'Ce membre n’est pas inscrit.');
   s.scores[String(s.round)][target.id]=points;
   s.log.push({type:'correction',by:user,candidate:target.id,points,at:new Date().toISOString()});
   await persist(s);await paint(s);await notice(s,`📝 Score corrigé par l’animation : ${mention(target.id)} = **${points} point(s)**.`);
   return i.editReply('✅ Score corrigé.');
  }
 }
 throw new Error('Commande non reconnue.');
 });
}
async function doButton(i){
 const [,action,qid]=i.customId.split(':');
 return serial(GUILD,async()=>{
  const s=await state(),q=s.question;
  assert(q && q.id===qid,'Ce bouton appartient à une ancienne question.');
  if(action==='buzz'){
   assert(canBuzz(s,i.user.id),'Buzzer fermé, ou tu ne fais pas partie des candidats autorisés.');
   // Le premier clic traité par le bot gagne ; verrou immédiatement persistant.
   q.phase='awaiting';q.buzzUser=i.user.id;q.answerText=null;q.deadline=Date.now()+20000;
   await persist(s);
   await i.showModal(answerModal(q));
   await paint(s);
   const serie=s.round===2&&s.settings.format['2']==='serie'&&!!s.serie?.candidate;
   await notice(s,serie?`✍️ **${mention(i.user.id)} répond !** La lecture est en pause. Réponse écrite en cours.`:`🚨 **BUZZ ! ${mention(i.user.id)} a buzzé en premier !**\n🔒 La lecture s’arrête. Lui seul peut saisir sa réponse dans le formulaire. Les autres attendent.`);
   return;
  }
  assert(staff(s,i.user.id),'Ce bouton est réservé à l’équipe d’animation.');
  if(action==='solution'){
   assert(q.phase==='judging','La solution reste cachée jusqu’à l’envoi d’une réponse.');
   // Un animateur qui lit la solution perd le droit de rebuzzer sur CETTE question.
   if(s.eligible.includes(i.user.id) && !q.banned.includes(i.user.id))q.banned.push(i.user.id);
   s.log.push({type:'solution_view',judge:i.user.id,question:q.source,at:new Date().toISOString()});
   await persist(s);
   return i.reply(eph(`🔎 **Solution confidentielle**\n${q.solution||'Question orale : aucune solution préenregistrée. L’animateur arbitre.'}\n\n⚠️ Si tu es candidat, tu ne peux plus buzzer sur cette question après avoir consulté la solution.`));
  }
  if(action==='good'||action==='bad'){
   assert(q.phase==='judging','Aucune réponse à arbitrer.');
   // Un animateur candidat peut arbitrer sa propre réponse ENREGISTRÉE.
   // Pour une compétition stricte, préférer la validation par un coanimateur.
   await i.deferReply({flags:E});
   if(s.round===2&&s.settings.format['2']==='serie'&&s.serie?.candidate)await judgeSeries(s,action==='good',i.user.id);
   else await judge(s,action==='good',i.user.id);
   return i.editReply(action==='good'?'✅ Bonne réponse validée et points attribués.':'❌ Mauvaise réponse validée : tout le monde peut rebuzzer.');
  }
  if(action==='skip'){
   await i.deferReply({flags:E});
   assert(q.phase!=='closed','Question déjà terminée.');
   if(s.round===2&&s.settings.format['2']==='serie'&&s.serie?.candidate){s.serie.streak=0;await nextSeriesQuestion(s);await notice(s,'⏭️ Question passée, série remise à zéro.');return i.editReply('Question passée.');}
   await closeQuestion(s,'⏭️ Question passée par l’animateur.');
   await notice(s,'⏭️ L’animateur passe la question.');return i.editReply('Question passée.');
  }
  throw new Error('Bouton inconnu.');
 });
}
async function doModal(i){
 if(i.customId==='champ:add'){
  const s=await state();assert(staff(s,i.user.id),'Seuls les animateurs peuvent ajouter des questions.');
  const theme=i.fields.getTextInputValue('theme').trim(),text=i.fields.getTextInputValue('text').trim();
  const solution=i.fields.getTextInputValue('solution').trim(),points=Number(i.fields.getTextInputValue('points').trim());
  assert(theme && text && solution,'Tous les champs sont obligatoires.');
  assert(Number.isInteger(points) && points>=1 && points<=4,'Les points doivent être un entier entre 1 et 4.');
  await i.deferReply({flags:E});
  const id=await database.addQuestion(GUILD,i.user.id,theme,text,solution,points);
  return i.editReply(`✅ Question personnelle #${id} enregistrée en privé. Elle ne sera pas tirée tant que tu fais partie des candidats actifs.`);
 }
 if(i.customId.startsWith('champ:answer:')){
  await i.deferReply({flags:E});
  const qid=i.customId.slice('champ:answer:'.length);
  return serial(GUILD,async()=>{
   const s=await state(),q=s.question;
   assert(s.status==='running' && q && q.id===qid && q.phase==='awaiting','Ce formulaire n’est plus valable.');
   assert(q.buzzUser===i.user.id,'Seul le premier à avoir buzzé peut répondre.');
   assert(Date.now()<=q.deadline,'Délai de réponse expiré. Le buzzer va rouvrir.');
   const answer=i.fields.getTextInputValue('answer').trim().replace(/\s+/gu,' ');
   assert(answer,'Ta réponse ne peut pas être vide.');
   q.answerText=answer;q.phase='judging';q.deadline=null;
   await persist(s);await paint(s);
   await notice(s,`📝 **Réponse publique de ${mention(i.user.id)} :**\n> ${answer.replace(/\n/g,' ').slice(0,350)}\n\n⚖️ **En attente du verdict de l’animateur.**`);
   return i.editReply('✅ Ta réponse a été publiée devant tous les joueurs. Attends le verdict de l’animateur.');
  });
 }
}
async function tick(){
 await serial(GUILD,async()=>{
  const s=await state();const q=s.question;
  if(s.status!=='running'||!q)return;
  if(q.phase==='awaiting' && q.deadline && Date.now()>q.deadline){
   const id=q.buzzUser;
   q.phase='revealing';q.buzzUser=null;q.deadline=null;q.lastReveal=Date.now();
   await persist(s);await paint(s);
   await notice(s,`⌛ ${mention(id)} n’a pas envoyé de réponse à temps. Les buzzers sont rouverts, il peut retenter.`);
   return;
  }
  if(s.round===2 && s.settings.format['2']==='serie' && s.serie?.candidate){
   const serie=s.serie;const now=Date.now();
   if(q.phase==='revealing'){serie.remaining=Math.max(0,serie.remaining-Math.min(2500,Math.max(0,now-serie.lastClock)));}
   serie.lastClock=now;
   if(serie.remaining===0 && q.phase==='revealing'){await finishSeries(s);return;}
   await persist(s);
  }
  if(q.phase!=='revealing' || q.oralBlank || Date.now()-q.lastReveal<1950)return;
  const all=wordsOf(q.text);
  if(q.shown>=all.length){if(s.round===2&&s.serie?.candidate)await paint(s);return;}
  q.shown=Math.min(all.length,q.shown+5);
  q.lastReveal=Date.now();
  await persist(s);
  await paint(s);
 });
}
client.on(Events.InteractionCreate,async i=>{
 try{
  if(!i.guildId||i.guildId!==GUILD)return;
  if(i.isChatInputCommand() && i.commandName==='champion')return await doChat(i);
  if(i.isButton() && i.customId.startsWith('champ:'))return await doButton(i);
  if(i.isModalSubmit() && i.customId.startsWith('champ:'))return await doModal(i);
 }catch(err){
  console.error('❌ Interaction champion :',err);
  const p=eph(`❌ ${String(err?.message||'Erreur inattendue').slice(0,350)}`);
  try{if(i.deferred)await i.editReply(p.content);else if(i.replied)await i.followUp(p);else await i.reply(p);}catch(e){console.error('Erreur lors de l’envoi de réponse',e.message);}
 }
});
client.once(Events.ClientReady,async ready=>{
 console.log('✅ Maîtresse du Jeu connectée : '+ready.user.tag);
 try{
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  // Cette synchronisation REMPLACE les anciennes commandes du serveur /roue /probleme /animation.
  await rest.put(Routes.applicationGuildCommands(ready.user.id,GUILD),{body:commands.map(c=>c.toJSON())});
  console.log('✅ /champion synchronisé ; les commandes de la Roue des problèmes sont retirées.');
 }catch(e){console.error('❌ Échec synchronisation des commandes :',e);}
 // Le minuteur ne reprend pas à l’aveugle après redémarrage : /champion partie reprendre.
 setInterval(()=>tick().catch(e=>console.error('❌ Timer champion :',e)),2000).unref();
});
(async()=>{
 try{
  await database.init();
  const s=await state();
  if(s.status==='running'){s.status='paused';await persist(s);console.log('⏸️ Partie sauvegardée mise en pause après redémarrage.');}
  await client.login(process.env.DISCORD_TOKEN);
 }catch(e){console.error('❌ Démarrage impossible :',e);process.exitCode=1;await database.close().catch(()=>{});}
})();
process.on('SIGTERM',async()=>{client.destroy();await database.close().catch(()=>{});process.exit(0);});
