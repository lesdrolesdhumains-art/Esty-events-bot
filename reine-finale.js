'use strict';
/** 👑 Grande finale de La Reine des Cœurs : 3 actes / 2 finalistes / notes indépendantes. */
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');
const db=require('./reine-db');
const store=require('./reine-finale-db');
const E=MessageFlags.Ephemeral;
let bot,guild;
const ACTS=[
 {name:'⚽ ACTE 1 — LE MATCH OU MOI',short:'Le match ou moi',min:5,max:20,chars:2000,
 prompt:`Ça fait des semaines que cette sortie est prévue entre vous deux. Tout est calé, tu t'es préparée, tu as hâte. Mais au dernier moment, il se rend compte que ce soir-là, il y a un match de foot très important pour lui. Il te l'annonce, un peu gêné. Comment réagis-tu ? Que lui dis-tu, que fais-tu, et comment se termine la soirée ?\n\nRÈGLES : écris ta réponse sous forme de texte libre, entre 5 et 20 lignes. Réponse : 2 000 caractères maximum. Sois sincère et naturelle : humour, compromis, fermeté ou surprise, tout est permis tant que ça te ressemble. N'utilise aucun pseudo ni indice révélant ton identité.\n\nOBJECTIF : que le jury découvre ta façon de réagir face à une déception, et ce que ta réponse dit de toi en couple.`},
 {name:'📱 ACTE 2 — L’ÉCRAN RETOURNÉ',short:'L’écran retourné',min:5,max:20,chars:2000,
 prompt:`Depuis le début de votre relation, il n'a jamais rien caché. Son téléphone traîne partout, il te montre ses messages, ses vidéos, ses conversations sans réfléchir. Mais depuis quelque temps, tu remarques un petit détail : quand il le pose, l'écran est toujours tourné contre la table. Rien d'autre n'a changé. Il est le même avec toi, aussi attentionné qu'avant. Peut-être une simple habitude. Peut-être rien. Comment réagis-tu ? En parles-tu, et si oui, comment ? Ou gardes-tu ça pour toi ?\n\nRÈGLES : écris ta réponse sous forme de texte libre, entre 5 et 20 lignes. Réponse : 2 000 caractères maximum. Sois sincère : explique ce que tu ressens, ce que tu fais, et pourquoi. Il n'y a pas de bonne ou de mauvaise réponse, seulement la tienne. N'utilise aucun pseudo ni indice révélant ton identité.\n\nOBJECTIF : que le jury découvre comment tu gères le doute et la confiance, et ce que tu es prête à faire pour protéger ton couple.`},
 {name:'🎤 ACTE 3 — POURQUOI MOI',short:'Pourquoi moi',min:10,max:30,chars:3000,
 prompt:`C'est l'ultime épreuve. Après tout ce que le jury a découvert de toi à travers tes réponses, il est temps de prendre la parole une dernière fois. Écris un discours pour convaincre que c'est toi qui mérites d'être élue Reine des cœurs. Parle de ce qui te rend unique, de ta façon d'aimer, de tes valeurs et de ce que tu apportes à ceux qui comptent pour toi. Sois toi-même : touchante, drôle, sincère ou audacieuse, c'est ton moment.\n\nRÈGLES : donne un titre à ton discours (champ séparé) ; écris entre 10 et 30 lignes. Discours : 3 000 caractères maximum ; titre : 100 caractères maximum. Reste dans le respect de l'autre finaliste : convaincs par ce que tu es, pas en rabaissant l'autre. N'utilise aucun pseudo ni indice révélant ton identité.\n\nOBJECTIF : que le jury referme ton discours avec une certitude : la couronne te revient. 👑`}
];
function button(id,label){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Primary));}
function writeButton(st,act){return button(`rc:final:write:${st}:${act}`,`✍️ Répondre à l’acte ${act}`);}
function gradeButton(st,act,number){return button(`rc:final:grade:${st}:${act}:${number}`,`⭐ Noter finaliste ${number} /10 — acte ${act}`);}
async function privateReply(i,msg){return i.editReply({content:String(msg).slice(0,1950),allowedMentions:{parse:[]}});}
async function dm(user,content,components=[]){try{const u=await bot.users.fetch(user);await u.send({content:content.slice(0,1950),components,allowedMentions:{parse:[]}});return true;}catch(e){console.warn('Finale MP non envoyé',user,e.message);return false;}}
async function judgePost(content,components=[]){const conf=await db.settings(guild);if(!conf.judge_channel)throw Error('Configure d’abord le salon du jury.');const chan=await bot.channels.fetch(conf.judge_channel);if(!chan?.isTextBased())throw Error('Salon des juges introuvable.');await chan.send({content:content.slice(0,1950),components,allowedMentions:{parse:[]}});}
async function sendAct(user,stage,act){const a=ACTS[act-1];return dm(user,`👑 **LA REINE DES CŒURS — GRANDE FINALE**\n**${a.name}**\n\n${a.prompt}\n\n💌 Clique ci-dessous pour répondre. Les trois actes sont indépendants ; tu peux modifier chacun de tes textes jusqu’à leur publication.`,[writeButton(stage,act)]);}
function lineCount(body){return body.split(/\r?\n/).filter(x=>x.trim()).length;}
function validate(act,title,body){const a=ACTS[act-1];if(!a)return 'Acte inconnu.';if(!body)return 'Ton texte ne peut pas être vide.';if(body.length>a.chars)return `Ton texte ne doit pas dépasser ${a.chars} caractères.`;
 const lines=lineCount(body);if(lines<a.min||lines>a.max)return `Il faut entre ${a.min} et ${a.max} lignes non vides. Tu en as écrit ${lines}.`;
 if(act===3&&(!title||title.length>100))return 'Le troisième acte nécessite un titre de 1 à 100 caractères.';
 return null;}
async function fullStats(stageId){return store.stats(guild,stageId);}
function gradeProgress(st){const all=st.expected.length,got=st.expected.filter(k=>st.recorded.has(k)).length;return `${got}/${all} notes · ${st.fullJudges.length}/${st.judges.length} bulletins complets`;}
function statusText(st,privateNames=true){
 const received=new Set(st.answers.map(a=>`${a.candidate_id}:${a.act}`));
 const gradeOpen=['published','closed'].includes(st.stage.status);
 return [
  `👑 **FINALE — ${st.stage.status.toUpperCase()}**`,
  `📩 Textes : ${st.answers.length}/6`,
  ...st.players.map(p=>`Finaliste ${p.final_number}${privateNames?` <@${p.candidate_id}>`:''} — ${[1,2,3].map(act=>received.has(`${p.candidate_id}:${act}`)?'✅':'⏳').join(' ')}`),
  gradeOpen?`⚖️ ${gradeProgress(st)}`:'⚖️ Notes pas encore ouvertes (publication des 3 actes à venir)',
  ...st.judges.map(j=>{
   if(!gradeOpen)return `➖ <@${j.user_id}> — notes non ouvertes`;
   const must=st.expected.filter(k=>k.startsWith(j.user_id+':'));
   const yes=must.filter(k=>st.recorded.has(k)).length;
   const flag=yes===must.length?'✅':'⏳';
   return `${flag} <@${j.user_id}> : ${yes}/${must.length} notes${st.players.some(p=>p.candidate_id===j.user_id)?' (sans son propre texte)':''}`;
  })
 ].join('\n');
}
function rankedText(st){const ranked=[...st.scores].sort((a,b)=>(b.total??-1)-(a.total??-1)||a.final_number-b.final_number);
 return [`🏆 **FINALE — CLASSEMENT CONFIDENTIEL**`,`⚖️ Bulletins complets pris en compte : ${st.fullJudges.length}/${st.judges.length}`, ...ranked.map(p=>`Finaliste ${p.final_number} (<@${p.candidate_id}>) — **${p.total===null?'non évaluée':p.total.toFixed(2)+'/30'}**\n   ⚽ ${p.perAct[0]===null?'—':p.perAct[0].toFixed(2)+'/10'} · 📱 ${p.perAct[1]===null?'—':p.perAct[1].toFixed(2)+'/10'} · 🎤 ${p.perAct[2]===null?'—':p.perAct[2].toFixed(2)+'/10'}`),`🔐 Aucun verdict ni pseudo publié avant la commande de couronnement.`].join('\n');}
async function handleCommand(i,sub){
 if(sub==='finale-preparer'){
  const st=await store.create(guild,'👑 Grande finale — 3 actes : le match, le téléphone et le discours','Deux finalistes. Trois réponses indépendantes. Six notes /10 par juge, classement final /30.');
  return privateReply(i,`✅ **La finale en trois actes est préparée** (#${st.id}). Deux finalistes anonymes ont reçu de nouveaux numéros 1 et 2 (indépendants des anciennes manches).\nCommande suivante : 0/coeur finale-lancer`.replace(/\u0006/g,'`'));
 }
 const st=await db.latest(guild);
 if(!st||st.kind!=='finale')return privateReply(i,'Prépare d’abord les trois actes avec `/coeur finale-preparer`.');
 const current=await fullStats(st.id);
 if(sub==='finale-suivi')return privateReply(i,statusText(current));
 if(sub==='finale-lancer'){
  if(st.status!=='draft')return privateReply(i,'La finale a déjà été lancée.');
  await db.setStageStatus(guild,st.id,'draft','collect');let sent=0;
  for(const p of current.players)for(let act=1;act<=3;act++)if(await sendAct(p.candidate_id,st.id,act))sent++;
  return privateReply(i,`💌 Finale lancée : ${sent}/6 messages envoyés (3 actes par finaliste). Utilise /coeur finale-rappels si besoin.`.replace(/\u0006/g,'`'));
 }
 if(sub==='finale-rappels'){
  if(st.status!=='collect')return privateReply(i,'Les réponses de la finale ne sont pas en cours de collecte.');
  const have=new Set(current.answers.map(a=>`${a.candidate_id}:${a.act}`));let count=0;
  for(const p of current.players)for(let act=1;act<=3;act++)if(!have.has(`${p.candidate_id}:${act}`)&&await sendAct(p.candidate_id,st.id,act))count++;
  return privateReply(i,`⏰ ${count} rappel(s) envoyés. ${6-current.answers.length} texte(s) manquants.`);
 }
 if(sub==='finale-publier'){
  if(st.status!=='collect')return privateReply(i,'La collecte de la finale n’est pas ouverte.');
  const missing=6-current.answers.length;
  if(missing&&!i.options.getBoolean('forcer'))return privateReply(i,`⏳ Il manque ${missing} texte(s). Utilise /coeur finale-rappels ou publie avec forcer:true.`.replace(/\u0006/g,'`'));
  const conf=await db.settings(guild);if(!conf.judge_channel)return privateReply(i,'Configure le salon du jury avant de publier.');
  await db.setStageStatus(guild,st.id,'collect','published');
  await judgePost(`👑 **LA REINE DES CŒURS — GRANDE FINALE**\nDeux finalistes anonymes, trois actes. Chaque juge doit noter chaque texte reçu sur **10** : normalement **6 notes au total**. Les numéros 1 et 2 sont NOUVEAUX et ne correspondent pas aux anciens numéros. Les anciens scores n’entrent pas dans la moyenne de la finale.`);
  for(let act=1;act<=3;act++){
   await judgePost(`**${ACTS[act-1].name}**`);
   for(const p of current.players){
    const a=current.answers.find(a=>a.candidate_id===p.candidate_id&&a.act===act);
    if(!a){await judgePost(`**Finaliste ${p.final_number} — ${ACTS[act-1].short}**\n*Pas de réponse : 0/10 automatique pour cet acte.*`);continue;}
    const body=(act===3?`**${a.title}**\n\n`: '')+a.body;
    for(let n=0;n<body.length;n+=1550)await judgePost(`**Finaliste ${p.final_number} — ${ACTS[act-1].short}**${body.length>1550?' (suite)':''}\n${body.slice(n,n+1550)}`);
    await judgePost(`⚖️ **Noter l’acte ${act} du finaliste ${p.final_number}**`,[gradeButton(st.id,act,p.final_number)]);
   }
  }
  return privateReply(i,`✅ ${current.answers.length}/6 textes publiés. Les notes sont ouvertes dans le salon privé des juges.`);
 }
 if(sub==='finale-notes-rappels'){
  if(st.status!=='published')return privateReply(i,'Les notes ne sont pas ouvertes.');let sent=0;
  for(const j of current.judges){const req=current.expected.filter(k=>k.startsWith(j.user_id+':'));const got=req.filter(k=>current.recorded.has(k)).length;
   if(got<req.length&&await dm(j.user_id,`⏰ **Finale Reine des Cœurs** : tu as noté ${got}/${req.length} textes. Retourne dans le salon du jury pour terminer.`))sent++;}
  return privateReply(i,`⏰ ${sent} juge(s) relancé(s) pour les notes manquantes.`);
 }
 if(sub==='finale-notes-fermer'){
  if(st.status!=='published')return privateReply(i,'Les notes de la finale ne sont pas ouvertes.');
  const missing=current.expected.filter(k=>!current.recorded.has(k)).length;
  if(!current.grades.length)return privateReply(i,'Aucune note reçue. Les juges doivent commencer à noter.');
  if(missing&&!i.options.getBoolean('forcer'))return privateReply(i,`⏳ Il manque ${missing} note(s). Suivi : /coeur finale-suivi. Tu peux forcer la clôture, mais les bulletins incomplets seront exclus du classement.`.replace(/\u0006/g,'`'));
  if(!current.fullJudges.length)return privateReply(i,'Aucun bulletin complet. Impossible de calculer une finale équitable ; relance les juges.');
  await db.setStageStatus(guild,st.id,'published','closed');
  return privateReply(i,`🔒 Finale clôturée. ${gradeProgress(current)}. Les bulletins incomplets sont exclus du score. Consulte /coeur finale-classement, puis choisis la gagnante avec /coeur finale-verdict.`.replace(/\u0006/g,'`'));
 }
 if(sub==='finale-classement'){
  if(st.status!=='closed')return privateReply(i,'Clôture d’abord les notes avec `/coeur finale-notes-fermer`.');return privateReply(i,rankedText(current));
 }
 if(sub==='finale-verdict'){
  if(st.status!=='closed')return privateReply(i,'Clôture d’abord la finale.');
  const confirm=i.options.getString('confirmation');if(confirm!=='VALIDER')return privateReply(i,'Aucune action effectuée. Saisis exactement VALIDER.');
  const n=i.options.getInteger('numero');const chosen=current.players.find(p=>p.final_number===n);if(!chosen)return privateReply(i,'Choisis le finaliste 1 ou 2.');
  await store.verdict(guild,st.id,n);
  return privateReply(i,`🔐 **Verdict enregistré en privé** : finaliste ${n} choisi. Aucun résultat publié. Tu peux maintenant lancer /reine finale pour couronner la gagnante publiquement.`.replace(/\u0006/g,'`'));
 }
 return privateReply(i,'Commande de finale inconnue.');
}
async function handleComponent(i){if(!(i.isButton()||i.isModalSubmit())||!i.customId.startsWith('rc:final:'))return false;
 const parts=i.customId.split(':'),kind=parts[2],stId=Number(parts[3]),act=Number(parts[4]);
 if(!Number.isSafeInteger(stId)||!ACTS[act-1])return i.reply({content:'Cette interaction est invalide.',flags:E});
 const st=await db.stage(guild,stId);if(!st||st.kind!=='finale')return i.reply({content:'Cette finale n’existe plus.',flags:E});
 const players=await store.finalists(stId);
 if(kind==='write'&&i.isButton()){
  if(st.status!=='collect'||!players.some(p=>p.candidate_id===i.user.id))return i.reply({content:'Ce formulaire est fermé ou tu ne fais pas partie des finalistes.',flags:E});
  const old=(await store.answers(stId)).find(a=>a.candidate_id===i.user.id&&a.act===act);
  const modal=new ModalBuilder().setCustomId(`rc:final:submit:${stId}:${act}`).setTitle(`Finale — Acte ${act}`);
  if(act===3){const title=new TextInputBuilder().setCustomId('titre').setLabel('Titre de ton discours (100 caractères)').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);if(old?.title)title.setValue(old.title.slice(0,100));modal.addComponents(new ActionRowBuilder().addComponents(title));}
  const body=new TextInputBuilder().setCustomId('texte').setLabel(`Ton texte (${ACTS[act-1].min} à ${ACTS[act-1].max} lignes)`).setStyle(TextInputStyle.Paragraph).setMaxLength(ACTS[act-1].chars).setRequired(true);
  if(old?.body)body.setValue(old.body.slice(0,ACTS[act-1].chars));modal.addComponents(new ActionRowBuilder().addComponents(body));
  return i.showModal(modal);
 }
 if(kind==='submit'&&i.isModalSubmit()){
  const title=act===3?i.fields.getTextInputValue('titre').trim():'',body=i.fields.getTextInputValue('texte').trim();const error=validate(act,title,body);
  if(error)return i.reply({content:`❌ ${error}`,flags:E});
  await store.saveAnswer(guild,stId,i.user.id,act,title,body);
  const count=(await store.answers(stId)).filter(a=>a.candidate_id===i.user.id).length;
  return i.reply({content:`✅ Acte ${act} enregistré (${count}/3 textes). Tu peux le modifier tant que la finale n’a pas été publiée.`,flags:E});
 }
 if(kind==='grade'&&i.isButton()){
  const num=Number(parts[5]),player=players.find(p=>p.final_number===num);
  const judge=(await db.members(guild,'judge',true)).some(p=>p.user_id===i.user.id);
  if(st.status!=='published'||!judge||!player)return i.reply({content:'Notes fermées ou accès réservé aux juges.',flags:E});
  if(player.candidate_id===i.user.id)return i.reply({content:'Tu ne peux pas noter ton propre texte.',flags:E});
  const old=(await store.grades(stId)).find(g=>g.judge_id===i.user.id&&g.candidate_id===player.candidate_id&&g.act===act);
  const modal=new ModalBuilder().setCustomId(`rc:final:rate:${stId}:${act}:${num}`).setTitle(`Finaliste ${num} — Acte ${act}`);
  const note=new TextInputBuilder().setCustomId('note').setLabel('Note entière sur 10 (0 à 10)').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true);
  const avis=new TextInputBuilder().setCustomId('avis').setLabel('Commentaire facultatif (confidentiel)').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false);
  if(old){note.setValue(String(old.grade));if(old.comment)avis.setValue(old.comment.slice(0,500));}
  modal.addComponents(new ActionRowBuilder().addComponents(note),new ActionRowBuilder().addComponents(avis));return i.showModal(modal);
 }
 if(kind==='rate'&&i.isModalSubmit()){
  const num=Number(parts[5]),player=players.find(p=>p.final_number===num);if(!player)return i.reply({content:'Finaliste introuvable.',flags:E});
  const raw=i.fields.getTextInputValue('note').trim();if(!/^(10|[0-9])$/.test(raw))return i.reply({content:'Note entière de 0 à 10 obligatoire.',flags:E});
  await store.saveGrade(guild,stId,i.user.id,player.candidate_id,act,Number(raw),i.fields.getTextInputValue('avis').trim());
  const stats=await fullStats(stId),keys=stats.expected.filter(k=>k.startsWith(i.user.id+':')),done=keys.filter(k=>stats.recorded.has(k)).length;
  return i.reply({content:`✅ Note ${raw}/10 enregistrée pour le finaliste ${num}, acte ${act}. Tu as rempli ${done}/${keys.length} notes attendues.`,flags:E});
 }
 return false;
}
async function init(client,guildId){bot=client;guild=guildId;await store.init();}
module.exports={ACTS,init,handleCommand,handleComponent,fullStats,statusText};
