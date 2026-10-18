/** DON JUAN — module de jeu indépendant, piloté par Esty et Tropi.
 * IMPORTANT : tous les candidats et juges participent volontairement.
 * Un seul vote par juge et par manche. Identités masquées jusqu'à élimination/finale.
 */
const {
 SlashCommandBuilder,ChannelType,ActionRowBuilder,ButtonBuilder,ButtonStyle,
 ModalBuilder,TextInputBuilder,TextInputStyle,StringSelectMenuBuilder,
 GatewayIntentBits,Partials,MessageFlags
}=require('discord.js');
const store=require('./donjuan-db');
const {pool}=require('./db'); // Utilise la même connexion Neon que les autres jeux.
let bot, guild, owner;
const VOTE_EMOJI=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
const FLAG=MessageFlags.Ephemeral;
const command = new SlashCommandBuilder().setName('donjuan').setDescription('👑 Animation Don Juan du serveur (Tropi)')
 .addSubcommand(s=>s.setName('salon').setDescription('Définir le salon privé des juges').addChannelOption(o=>o.setName('salon').setDescription('Salon réservé aux juges').addChannelTypes(ChannelType.GuildText).setRequired(true)))
 .addSubcommand(s=>s.setName('admin').setDescription('Autoriser Tropi à piloter le jeu (Esty seule)').addUserOption(o=>o.setName('membre').setDescription('Animateur autorisé').setRequired(true)))
 .addSubcommand(s=>s.setName('admin-retirer').setDescription('Retirer les droits d’animateur à un prétendant (Esty seule)').addUserOption(o=>o.setName('membre').setDescription('Personne à retirer des admins').setRequired(true)))
 .addSubcommand(s=>s.setName('juge-ajouter').setDescription('Inscrire Esty comme juge même après la clôture des inscriptions').addUserOption(o=>o.setName('membre').setDescription('Sélectionne ton propre compte Esty').setRequired(true)))
 .addSubcommand(s=>s.setName('pretendant-ajouter').setDescription('Ajouter un prétendant sans changer les numéros déjà attribués (Esty seule)').addUserOption(o=>o.setName('membre').setDescription('Nouveau prétendant à inscrire').setRequired(true)))
 .addSubcommand(s=>s.setName('role').setDescription('Choisir le rôle du futur Don Juan').addRoleOption(o=>o.setName('role').setDescription('Rôle Discord à attribuer').setRequired(true)))
 .addSubcommand(s=>s.setName('role-juges').setDescription('Rôle donné automatiquement aux juges inscrites').addRoleOption(o=>o.setName('role').setDescription('Rôle Discord des juges').setRequired(true)))
 .addSubcommand(s=>s.setName('inscriptions').setDescription('Lier l’annonce existante et ouvrir les inscriptions').addStringOption(o=>o.setName('message').setDescription('Lien ou ID du message d’annonce Discord').setRequired(true)))
 .addSubcommand(s=>s.setName('inscriptions-fermer').setDescription('Clore les réactions et tirer les numéros anonymes'))
 .addSubcommand(s=>s.setName('participants').setDescription('Afficher les listes de juges et de prétendants (privé)'))
 .addSubcommand(s=>s.setName('presentations').setDescription('Envoyer le formulaire de présentation en MP'))
 .addSubcommand(s=>s.setName('presentations-publier').setDescription('Publier anonymement les présentations et ouvrir le vote'))
 .addSubcommand(s=>s.setName('questions').setDescription('Ouvrir un round de questions en MP'))
 .addSubcommand(s=>s.setName('questions-fermer').setDescription('Fermer les nouvelles questions (réponses encore acceptées)'))
 .addSubcommand(s=>s.setName('reponses-publier').setDescription('Publier les réponses reçues et ouvrir le vote'))
 .addSubcommand(s=>s.setName('vote-fermer').setDescription('Clôturer le vote, compter les voix et attribuer les points'))
 .addSubcommand(s=>s.setName('eliminer').setDescription('Éliminer le dernier du classement').addIntegerOption(o=>o.setName('numero').setDescription('En cas d’égalité, départager parmi les derniers').setMinValue(1)))
 .addSubcommand(s=>s.setName('finale').setDescription('Couronner le dernier prétendant actif'))
 .addSubcommand(s=>s.setName('rappels').setDescription('Renvoyer les formulaires en MP aux participants en attente'))
 .addSubcommand(s=>s.setName('statut').setDescription('Voir phase, participants et scores (privé)'))
 .addSubcommand(s=>s.setName('reinitialiser').setDescription('Effacer les données Don Juan pour un nouveau test').addStringOption(o=>o.setName('confirmation').setDescription('Écrire exactement EFFACER').setRequired(true)));
function rowButton(id,label){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Primary));}
function modal(id,title,fields){const m=new ModalBuilder().setCustomId(id).setTitle(title);for(const f of fields){let t=new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.long?TextInputStyle.Paragraph:TextInputStyle.Short).setMaxLength(f.max||1000).setRequired(true);m.addComponents(new ActionRowBuilder().addComponents(t));}return m;}
async function privateReply(i,txt){if(i.deferred)return i.editReply(txt);return i.reply({content:txt,flags:FLAG,allowedMentions:{parse:[]}});}
async function dmReply(i,txt){return i.reply({content:txt,allowedMentions:{parse:[]}});}
async function dmUser(userId,txt,components=[]){try{const user=await bot.users.fetch(userId);await user.send({content:txt,components,allowedMentions:{parse:[]}});return true;}catch(e){console.warn('DonJuan MP impossible',userId,e.message);return false;}}
async function judgeChannel(s){if(!s.judges_channel)throw Error('Salon des juges non défini : /donjuan salon');const ch=await bot.channels.fetch(s.judges_channel);if(!ch||typeof ch.send!=='function')throw Error('Salon des juges inaccessible au bot.');return ch;}
async function judgePost(s,txt,components=[]){let ch=await judgeChannel(s);return ch.send({content:txt,components,allowedMentions:{parse:[]}});}
async function publicPost(txt){const ch=await bot.channels.fetch(process.env.ANIMATION_CHANNEL_ID);return ch.send({content:txt,allowedMentions:{parse:[]}});}
async function admin(userId){return userId===owner || await store.isAdmin(guild,userId);}
async function judgeRole(userId,roleId,add){
 if(!roleId)return;try{const g=await bot.guilds.fetch(guild),m=await g.members.fetch(userId);
  if(add)await m.roles.add(roleId);else await m.roles.remove(roleId);
 }catch(e){console.warn('Rôle juge impossible pour',userId,e.message);}
}
async function saveReaction(userId,emoji,add){
 const s=await store.session(guild);if(s.phase!=='registrations')return;
 if(emoji!=='👑'&&emoji!=='😏')return;
 if(userId===owner||await admin(userId))return; // animateurs hors concours
 const user=await bot.users.fetch(userId).catch(()=>null);if(!user||user.bot)return;
 const kind=emoji==='👑'?'judge':'candidate';
 if(add){
  const current=await store.entry(guild,userId);
  if(current&&current.kind!==kind)return; // impossible d'être dans deux catégories
  if(!current){if(kind==='candidate'&&(await store.entries(guild,'candidate')).length>=10)return; // dix numéros emoji au maximum
    await store.upsertEntry(guild,userId,kind);}
  if(kind==='judge')await judgeRole(userId,s.judge_role,true);
 }else {await store.removeEntry(guild,userId,kind);
  if(kind==='judge')await judgeRole(userId,s.judge_role,false);
 }
}
async function reactionHandler(reaction,user,add){
 try{
  if(user.bot)return;
  if(reaction.partial)await reaction.fetch();
  const s=await store.session(guild);
  if(s.phase==='registrations'&&reaction.message.id===s.announce_message&&reaction.message.channelId===s.announce_channel){
   await saveReaction(user.id,reaction.emoji.name,add);return;
  }
  // Vote numérique par réaction : le stockage SQL est l'unique source pour compter.
  if(!['presentation_vote','round_vote'].includes(s.phase)||
     reaction.message.id!==s.vote_message||reaction.message.channelId!==s.vote_channel)return;
  const idx=VOTE_EMOJI.indexOf(reaction.emoji.name),choices=s.vote_choices||[];
  if(idx<0||idx>=choices.length)return;
  const member=await store.entry(guild,user.id);
  if(member?.kind!=='judge')return;
  const expectedKind=s.phase==='presentation_vote'?'presentation':'question';
  if(expectedKind!==s.vote_kind)return;
  const choice=choices[idx];
  if(add){
    await store.vote(guild,s.round_no,expectedKind,user.id,choice);
    // Une seule réaction visible lorsque le bot possède Gérer les messages.
    for(const other of reaction.message.reactions.cache.values()){
      if(other.emoji.name!==reaction.emoji.name&&VOTE_EMOJI.includes(other.emoji.name))
        await other.users.remove(user.id).catch(()=>{});
    }
  }else await store.unvote(guild,s.round_no,expectedKind,user.id,choice);
 }catch(e){console.error('DonJuan réaction',e);}
}
async function backfill(message){
 // Relecture fidèle des réactions, y compris celles ajoutées/retirées pendant une coupure.
 await message.fetch();
 const reacted=new Map();
 for(const [emoji,kind] of [['👑','judge'],['😏','candidate']]){
  const reaction=message.reactions.cache.find(r=>r.emoji.name===emoji);
  if(!reaction)continue;
  let after;
  while(true){
   const users=await reaction.users.fetch({limit:100,...(after?{after}:{})});
   for(const user of users.values())if(!user.bot&&!reacted.has(user.id))reacted.set(user.id,kind);
   if(users.size<100)break;
   after=users.last().id;
  }
 }
 for(const kind of ['judge','candidate']){
  for(const u of await store.entries(guild,kind)){
   // Le compte Esty peut être inscrit manuellement comme juge, sans réaction 👑.
   if(u.user_id===owner && kind==='judge')continue;
   if(reacted.get(u.user_id)!==kind){
    await store.removeEntry(guild,u.user_id,kind);
    if(kind==='judge')await judgeRole(u.user_id,(await store.session(guild)).judge_role,false);
   }
  }
 }
 for(const [userId,kind] of reacted){
  if(userId===owner||await admin(userId))continue;
  await saveReaction(userId,kind==='judge'?'👑':'😏',true);
 }
}
// Ajout tardif pendant les présentations : verrou transactionnel pour éviter
// deux numéros identiques et pour ne jamais renuméroter un candidat existant.
async function addCandidateDuringPresentations(userId){
 const conn=await pool.connect();
 try{
  await conn.query('BEGIN');
  const phaseResult=await conn.query('SELECT phase FROM dj_sessions WHERE guild_id=$1 FOR UPDATE',[guild]);
  if(phaseResult.rows[0]?.phase!=='presentations'){
   await conn.query('ROLLBACK');return {status:'phase'};
  }
  const found=await conn.query('SELECT kind,number FROM dj_users WHERE guild_id=$1 AND user_id=$2',[guild,userId]);
  if(found.rows.length){
   await conn.query('ROLLBACK');return {status:'existing',entry:found.rows[0]};
  }
  const stats=await conn.query("SELECT COUNT(*)::int AS total, COALESCE(MAX(number),0)::int AS last_number FROM dj_users WHERE guild_id=$1 AND kind='candidate'",[guild]);
  const {total,last_number}=stats.rows[0];
  if(total>=10 || last_number>=10){
   await conn.query('ROLLBACK');return {status:'limit'};
  }
  const number=last_number+1;
  await conn.query("INSERT INTO dj_users(guild_id,user_id,kind,number,active,score,presentation) VALUES($1,$2,'candidate',$3,TRUE,0,NULL)",[guild,userId,number]);
  await conn.query('COMMIT');
  return {status:'added',number};
 }catch(e){await conn.query('ROLLBACK').catch(()=>{});throw e;}
 finally{conn.release();}
}
async function sendPresentations(){
 const list=await store.entries(guild,'candidate',true);let count=0;
 for(const c of list)if(!c.presentation){if(await dmUser(c.user_id,'👑 **Don Juan du serveur**\nEnvoie ta présentation anonyme (1 200 caractères maximum). Seuls les juges verront ton texte, sous un numéro et sans ton pseudo.\nNe mets pas ton prénom, ton pseudo ni d’informations privées dans ton texte.',[rowButton('dj:present','Envoyer ma présentation')]))count++;}
 return count;
}
async function sendQuestionForms(round){let count=0;for(const j of await store.entries(guild,'judge'))if(await dmUser(j.user_id,`👑 **Don Juan — Round ${round}**\nTu peux poser UNE question à un candidat actif. Tu recevras les réponses dans le salon des juges.`,[rowButton(`dj:ask:${round}`,'Poser ma question')]))count++;return count;}
async function sendMissingAnswers(round){let count=0;for(const qu of await store.questions(guild,round))if(!qu.answer){if(await dmUser(qu.candidate_id,`📩 Question pour **Candidat #${qu.number}** :\n${qu.question}\n\nTa réponse sera publiée anonymement aux juges.`,[rowButton(`dj:answer:${qu.id}`,'Répondre')]))count++;}return count;}
async function openVote(s,kind,options,title){
 if(options.length<1||options.length>10)throw Error('Entre 1 et 10 choix sont nécessaires pour les réactions numérotées.');
 const menu=new StringSelectMenuBuilder().setCustomId(`dj:vote:${kind}:${s.round_no}`).setPlaceholder('Choisis une seule réponse').addOptions(options);
 const lines=options.map((o,j)=>`${VOTE_EMOJI[j]} ${o.label}`);
 const msg=await judgePost(s,title+'\n\n'+lines.join('\n')+'\n\n🔒 Seules les juges inscrites peuvent voter. **Un vote par juge**, modifiable avant clôture. Réagis avec un numéro ou utilise le menu ci-dessous.',[new ActionRowBuilder().addComponents(menu)]);
 await store.updateSession(guild,{vote_message:msg.id,vote_channel:msg.channelId,vote_kind:kind,vote_choices:JSON.stringify(options.map(o=>o.value))});
 for(let j=0;j<options.length;j++)await msg.react(VOTE_EMOJI[j]).catch(e=>console.warn('Ajout réaction impossible',e.message));
}
function anonScores(players){return players.slice().sort((a,b)=>b.score-a.score||a.number-b.number).map(p=>`#${p.number} — ${p.score} point(s)${p.active?'':' · éliminé'}`).join('\n');}
async function showParticipants(i){
 const c=await store.entries(guild,'candidate'),j=await store.entries(guild,'judge');
 const str=(a)=>a.map(x=>`<@${x.user_id}>${x.number?` (#${x.number})`:''}`).join('\n')||'Aucun';
 return privateReply(i,`🔒 **Prétendants (${c.length})**\n${str(c)}\n\n**Juges (${j.length})**\n${str(j)}`.slice(0,1900));
}
async function handleCommand(i){
 const sub=i.options.getSubcommand();
 if(!await admin(i.user.id))return privateReply(i,'🔒 Seuls Esty et les animateurs autorisés peuvent piloter Don Juan.');
 if(sub==='admin'){
  if(i.user.id!==owner)return privateReply(i,'🔒 Esty seule peut autoriser un animateur.');
  const user=i.options.getUser('membre',true);if(user.bot)return privateReply(i,'Pas un compte bot.');
  await store.addAdmin(guild,user.id);return privateReply(i,`✅ <@${user.id}> peut piloter /donjuan (mais pas /animation ni /probleme).`);
 }
 if(sub==='admin-retirer'){
  if(i.user.id!==owner)return privateReply(i,'🔒 Esty seule peut retirer les droits d’animation.');
  const user=i.options.getUser('membre',true);
  if(user.id===owner)return privateReply(i,'⛔ Impossible de retirer les droits du compte propriétaire Esty.');
  await store.removeAdmin(guild,user.id);
  return privateReply(i,`✅ <@${user.id}> n’a plus les droits d’animation Don Juan. Son inscription éventuelle comme prétendant, ses MP et son score sont conservés.`);
 }
 if(sub==='reinitialiser'){
  if(i.user.id!==owner)return privateReply(i,'Esty seule peut réinitialiser le jeu.');
  if(i.options.getString('confirmation')!=='EFFACER')return privateReply(i,'⛔ Rien effacé. Saisis EFFACER exactement.');
  const cfg=await store.session(guild);if(cfg.judge_role){
    for(const j of await store.entries(guild,'judge'))await judgeRole(j.user_id,cfg.judge_role,false);
  }
  await store.reset(guild);return privateReply(i,'🧹 Jeu Don Juan réinitialisé. Les dossiers des Problèmes d’Esty et les admins Don Juan restent intacts.');
 }
 let s=await store.session(guild);
 if(sub==='juge-ajouter'){
  if(i.user.id!==owner)return privateReply(i,'🔒 Seule Esty peut s’inscrire comme juge organisatrice.');
  const user=i.options.getUser('membre',true);
  if(user.id!==owner)return privateReply(i,'🔒 Cette commande est réservée à ton propre compte Esty.');
  if(!['registrations','presentations','presentation_vote'].includes(s.phase))
   return privateReply(i,'⏳ Inscription de la juge organisatrice uniquement pendant les inscriptions ou les présentations, avant la fermeture du premier vote. Aucune donnée n’a été modifiée.');
  const existing=await store.entry(guild,user.id);
  if(existing?.kind==='candidate')return privateReply(i,'⛔ Tu es déjà inscrite comme prétendante. Aucune inscription n’a été modifiée.');
  if(existing?.kind==='judge')return privateReply(i,'✅ Tu es déjà inscrite comme juge ! Vérifie les accès au salon du jury et le rôle si nécessaire.');
  await store.upsertEntry(guild,user.id,'judge');
  if(s.judge_role)await judgeRole(user.id,s.judge_role,true);
  return privateReply(i,`👑 Esty ajoutée comme juge ! Tu peux voter et poser tes questions. ${s.judge_role?'Vérifie que le rôle juge a bien été attribué et que tu vois le salon privé.':'⚠️ Aucun rôle juge configuré : utilise /donjuan role-juges pour l’accès au salon.'} Les prétendants, leurs numéros, MP et présentations restent inchangés.`);
 }
 if(sub==='pretendant-ajouter'){
  if(i.user.id!==owner)return privateReply(i,'🔒 Seule Esty peut ajouter un prétendant manuellement.');
  // Les présentations sont déjà envoyées : c'est à ce moment qu'on peut ajouter
  // un candidat avec son numéro définitif, sans changer les autres.
  if(s.phase!=='presentations')return privateReply(i,'⏳ Ajout possible uniquement pendant les présentations, avant leur publication et le premier vote. Aucune donnée modifiée.');
  const user=i.options.getUser('membre',true);
  if(user.bot)return privateReply(i,'⛔ Impossible d’inscrire un compte bot.');
  if(user.id===owner)return privateReply(i,'👑 Ton compte Esty est prévu pour être juge, pas prétendant.');
  await i.deferReply({flags:FLAG});
  const result=await addCandidateDuringPresentations(user.id);
  if(result.status==='phase')return privateReply(i,'⏳ Phase modifiée : le premier vote est peut-être déjà ouvert. Aucun participant ajouté.');
  if(result.status==='limit')return privateReply(i,'⛔ 10 prétendants maximum dans cette version. Aucun participant ajouté.');
  if(result.status==='existing')return privateReply(i,result.entry.kind==='candidate'
    ?`✅ <@${user.id}> est déjà candidat #${result.entry.number}. Son inscription, ses points et sa présentation restent inchangés.`
    :`⛔ <@${user.id}> est déjà inscrit comme juge. Aucun changement effectué.`);
  const ok=await dmUser(user.id,'👑 **Don Juan du serveur**\nTu viens d’être inscrit comme nouveau prétendant ! Envoie ta présentation anonyme (1 200 caractères maximum). Les juges la verront sous ton numéro, sans ton pseudo. Évite les indices permettant de t’identifier.',[rowButton('dj:present','Envoyer ma présentation')]);
  return privateReply(i,`✅ <@${user.id}> ajouté comme **Candidat #${result.number}**. Les autres numéros, scores, MP et présentations sont conservés. ${ok?'💌 Son formulaire de présentation vient de lui être envoyé en MP.':'⚠️ Son MP a été refusé. Demande-lui d’autoriser les MP puis utilise /donjuan rappels.'}`);
 }
 if(sub==='salon'){
  const ch=i.options.getChannel('salon',true);
  if(ch.permissionsFor(i.guild.roles.everyone)?.has('ViewChannel')) return privateReply(i,'🔒 Ce salon est visible par @everyone. Ferme d’abord l’accès aux non-juges dans les permissions Discord pour protéger l’anonymat.');
  await store.updateSession(guild,{judges_channel:ch.id});
  return privateReply(i,`✅ Salon des juges : <#${ch.id}>. ⚠️ Configure ses permissions Discord pour qu'il soit réservé aux juges inscrites.`);
 }
 if(sub==='role-juges'){
  const role=i.options.getRole('role',true);await store.updateSession(guild,{judge_role:role.id});
  let updated=0;for(const j of await store.entries(guild,'judge')){await judgeRole(j.user_id,role.id,true);updated++;}
  return privateReply(i,`👑 Rôle des juges : <@&${role.id}>. Attribution automatique lors des réactions 👑, et ${updated} membre(s) déjà inscrit(s) traité(s). Prévois la permission Gérer les rôles.`);
 }
 if(sub==='role'){
  const role=i.options.getRole('role',true);await store.updateSession(guild,{winner_role:role.id});return privateReply(i,`👑 Le rôle final sera <@&${role.id}>. Le bot doit avoir « Gérer les rôles » et son propre rôle doit être placé plus haut.`);
 }
 if(sub==='statut'){
  const c=await store.entries(guild,'candidate'),j=await store.entries(guild,'judge');
  return privateReply(i,`👑 **Don Juan** — ${s.phase}\nPrétendants : ${c.length} (${c.filter(p=>p.active).length} actifs)\nJuges : ${j.length}\nRound : ${s.round_no}\nSalon des juges : ${s.judges_channel?`<#${s.judges_channel}>`:'non défini'}\n\n**Scores privés :**\n${anonScores(c)||'En attente'}`);
 }
 if(sub==='participants')return showParticipants(i);
 if(sub==='inscriptions'){
  if(s.phase!=='draft')return privateReply(i,'Une session existe déjà. Pour un nouveau jeu, utilise /donjuan reinitialiser (Esty uniquement).');
  const value=i.options.getString('message',true).trim();
  let channel=process.env.ANNONCE_CHANNEL_ID||process.env.ANIMATION_CHANNEL_ID,msgId;
  const match=value.match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if(match){if(match[1]!==guild)return privateReply(i,'Ce lien ne vient pas du serveur LDH.');channel=match[2];msgId=match[3];}
  else if(/^\d{17,22}$/.test(value))msgId=value;
  else return privateReply(i,'Colle le lien du message Discord (ou son ID), pas le texte.');
  const ch=await bot.channels.fetch(channel),msg=await ch.messages.fetch(msgId);
  // Ajoute les réactions si l'annonce ne les comporte pas encore.
  await msg.react('👑').catch(e=>console.warn('Réaction juge non ajoutée',e.message));
  await msg.react('😏').catch(e=>console.warn('Réaction prétendant non ajoutée',e.message));
  await store.updateSession(guild,{phase:'registrations',announce_channel:channel,announce_message:msg.id,round_no:0});
  await backfill(msg);
  return privateReply(i,`✅ Inscriptions ouvertes sur le message ${msg.id}. Réactions 👑 et 😏 prises en compte, y compris celles déjà posées. /donjuan participants pour vérifier.`);
 }
 if(sub==='inscriptions-fermer'){
  if(s.phase!=='registrations')return privateReply(i,'Inscriptions non ouvertes.');
  const ch=await bot.channels.fetch(s.announce_channel),msg=await ch.messages.fetch(s.announce_message);
  // Récupérer les réactions faites pendant une éventuelle coupure du bot.
  await backfill(msg);
  const c=await store.entries(guild,'candidate'),j=await store.entries(guild,'judge');
  if(c.length<2||j.length<1)return privateReply(i,'Il faut au moins 2 prétendants et 1 juge.');
  await store.assignNumbers(guild);await store.phaseTransition(guild,'registrations','presentations');
  return privateReply(i,`🔒 Inscriptions fermées : ${c.length} prétendants anonymisés et ${j.length} juges. Lance /donjuan presentations.`);
 }
 if(sub==='presentations'){
  if(s.phase!=='presentations')return privateReply(i,'Clôture d’abord les inscriptions.');
  await i.deferReply({flags:FLAG});let n=await sendPresentations();return privateReply(i,`✉️ ${n} MP envoyés aux prétendants sans présentation. Les MP refusés sont ignorés : préviens les concernés.`);
 }
 if(sub==='presentations-publier'){
  if(s.phase!=='presentations')return privateReply(i,'Ce n’est pas la phase des présentations.');
  if(!s.judges_channel)return privateReply(i,'Configure d’abord /donjuan salon.');
  const players=await store.entries(guild,'candidate',true);const ready=players.filter(c=>c.presentation);
  if(ready.length<2)return privateReply(i,'Il faut au moins deux présentations reçues pour un vote. Utilise /donjuan rappels ou attends les réponses.');
  await i.deferReply({flags:FLAG});
  await judgePost(s,'# 👑 Don Juan — Présentations anonymes\nLes numéros ont été attribués aléatoirement. Ne cherchez pas à identifier les candidats ; jugez leurs textes.');
  for(const p of players)await judgePost(s,`**Candidat #${p.number}**\n${p.presentation||'_Présentation non reçue_'}`);
  const options=ready.map(p=>({label:`Candidat #${p.number}`,value:p.user_id}));
  await openVote(s,'presentation',options,'# 🗳️ Vote des présentations');
  await store.phaseTransition(guild,'presentations','presentation_vote');
  return privateReply(i,`✅ ${ready.length} présentation(s) publiées anonymement ; vote ouvert aux juges.`);
 }
 if(sub==='questions'){
  if(s.phase!=='between')return privateReply(i,'Clôture d’abord le vote précédent.');
  const next=s.round_no+1;await store.phaseTransition(guild,'between','questions',{round_no:next});
  await i.deferReply({flags:FLAG});const n=await sendQuestionForms(next);
  return privateReply(i,`📩 Round ${next} lancé : ${n} juges contactées en MP. Une question par juge et par round.`);
 }
 if(sub==='questions-fermer'){
  if(s.phase!=='questions')return privateReply(i,'Aucune réception de questions ouverte.');
  await store.phaseTransition(guild,'questions','answers');
  return privateReply(i,'🔒 Nouvelles questions fermées. Les candidats peuvent encore répondre. /donjuan rappels pour les relancer.');
 }
 if(sub==='reponses-publier'){
  if(!['answers','questions'].includes(s.phase))return privateReply(i,'Il faut être dans un round de questions.');
  if(!s.judges_channel)return privateReply(i,'Configure d’abord /donjuan salon.');
  const qs=(await store.questions(guild,s.round_no)).filter(x=>x.answer);
  if(qs.length<2)return privateReply(i,'Il faut au moins deux réponses pour lancer un vote. Utilise /donjuan rappels et attends les réponses.');
  if(qs.length>10)return privateReply(i,'Maximum 10 réponses par round pour le vote à réactions numérotées. Contacte Esty pour répartir les questions.');
  await i.deferReply({flags:FLAG});
  await judgePost(s,`# 👑 Don Juan — Réponses du round ${s.round_no}`);
  for(const x of qs)await judgePost(s,`**Réponse #${x.id} — Candidat #${x.number}**\n**Question :** ${x.question}\n**Réponse :** ${x.answer}`);
  const opts=qs.slice(0,10).map(x=>({label:`Réponse #${x.id} · Candidat #${x.number}`.slice(0,100),value:String(x.id)}));
  
  await openVote(s,'question',opts,`# 🗳️ Vote du round ${s.round_no} — meilleure réponse`);
  await store.phaseTransition(guild,s.phase,'round_vote');
  return privateReply(i,`✅ ${qs.length} réponses anonymisées et vote du round ${s.round_no} ouverts.`);
 }
 if(sub==='vote-fermer'){
  const kind=s.phase==='presentation_vote'?'presentation':s.phase==='round_vote'?'question':null;
  if(!kind)return privateReply(i,'Aucun vote ouvert à clôturer.');
  await i.deferReply({flags:FLAG});
  const result=await store.tally(guild,s.round_no,kind,s.phase);
  if(!result)return privateReply(i,'Vote déjà fermé ou phase modifiée.');
  if(s.vote_message&&s.vote_channel){
    try{const ch=await bot.channels.fetch(s.vote_channel),m=await ch.messages.fetch(s.vote_message);
      await m.edit({content:(m.content||'Vote')+'\n\n🔒 **Votes clos.**',components:[]});
    }catch(e){console.warn('Impossible de désactiver le vote',e.message);}
  }
  const c=await store.entries(guild,'candidate',true);
  await judgePost(s,`# 📊 Classement provisoire après ${kind==='presentation'?'les présentations':`le round ${s.round_no}`}\n👥 ${result.nb} juge(s) ont voté.\n\n${anonScores(c)}\n\n🎤 L’animateur choisit quand lancer la suite.`);
  return privateReply(i,'✅ Votes comptés, scores attribués et classement publié. /donjuan questions ou /donjuan eliminer.');
 }
 if(sub==='eliminer'){
  if(s.phase!=='between')return privateReply(i,'Clôture d’abord les votes.');
  const c=await store.entries(guild,'candidate',true);if(c.length<=1)return privateReply(i,'Il ne reste qu’un candidat : /donjuan finale.');
  const min=Math.min(...c.map(p=>p.score)),bottom=c.filter(p=>p.score===min);
  const chosen=i.options.getInteger('numero');
  if(bottom.length>1&&!chosen)return privateReply(i,`⚖️ Égalité au dernier rang entre ${bottom.map(x=>'#'+x.number).join(', ')} (${min} points). Relance /donjuan eliminer avec le numéro choisi par Tropi.`);
  const p=chosen?bottom.find(x=>x.number===chosen):bottom[0];
  if(!p)return privateReply(i,'Tu peux choisir uniquement un des candidats à égalité au dernier rang.');
  await store.eliminate(guild,p.user_id);
  await publicPost(`💔 **DON JUAN — ÉLIMINATION**\nLe **Candidat #${p.number}** quitte l’aventure avec ${p.score} points.\nSon identité : <@${p.user_id}>.\nMerci d’avoir joué ! 👑`);
  return privateReply(i,`✅ Candidat #${p.number} éliminé. ${c.length-1} prétendant(s) restent en lice.`);
 }
 if(sub==='finale'){
  if(s.phase!=='between')return privateReply(i,'Clôture d’abord le vote.');
  const c=await store.entries(guild,'candidate',true);
  if(c.length!==1)return privateReply(i,`Il reste ${c.length} prétendants. Élimine les candidats d’abord.`);
  const winner=c[0];await publicPost(`# 👑 LE DON JUAN DU SERVEUR EST…\n🥁🥁🥁\n**<@${winner.user_id}>** !\nCandidat #${winner.number}, avec **${winner.score} points** ! 🏆\nFélicitations et merci aux juges !`);
  let roleStatus='Rôle non configuré.';
  if(s.winner_role){try{const g=await bot.guilds.fetch(guild),member=await g.members.fetch(winner.user_id);await member.roles.add(s.winner_role);roleStatus='Rôle Don Juan attribué.';}catch(e){roleStatus=`Rôle non attribué : ${e.message}`;}}
  await store.updateSession(guild,{phase:'ended'});
  return privateReply(i,`🏆 Finale terminée ! ${roleStatus}`);
 }
 if(sub==='rappels'){
  await i.deferReply({flags:FLAG});
  if(s.phase==='presentations')return privateReply(i,`✅ ${await sendPresentations()} rappel(s) envoyés pour les présentations.`);
  if(['questions','answers'].includes(s.phase))return privateReply(i,`✅ ${await sendMissingAnswers(s.round_no)} question(s) renvoyées aux candidats.`);
  return privateReply(i,'Aucun rappel à envoyer pour cette phase.');
 }
}
async function handleComponent(i){
 const cid=i.customId;
 if(cid==='dj:present'&&i.isButton()){
  const s=await store.session(guild),member=await store.entry(guild,i.user.id);
  if(s.phase!=='presentations'||member?.kind!=='candidate')return dmReply(i,'Présentations fermées ou inscription introuvable.');
  return i.showModal(modal('dj:submit:present','Présentation anonyme',[{id:'text',label:'Mon texte (max 1200)',long:true,max:1200}]));
 }
 if(cid==='dj:submit:present'&&i.isModalSubmit()){
  const s=await store.session(guild);if(s.phase!=='presentations')return dmReply(i,'Présentations fermées.');
  const member=await store.entry(guild,i.user.id);if(member?.kind!=='candidate')return dmReply(i,'Inscription introuvable.');
  const txt=i.fields.getTextInputValue('text').trim();if(!txt)return dmReply(i,'Présentation vide.');
  await store.savePresentation(guild,i.user.id,txt);return dmReply(i,'✅ Présentation sauvegardée. Elle sera publiée anonymement par l’animateur.');
 }
 if(cid.startsWith('dj:ask:')&&i.isButton()){
  const round=Number(cid.split(':')[2]),s=await store.session(guild),member=await store.entry(guild,i.user.id);
  if(s.phase!=='questions'||s.round_no!==round||member?.kind!=='judge')return dmReply(i,'Questions fermées ou tu n’es pas juge inscrite.');
  return i.showModal(modal(`dj:submit:ask:${round}`,'Question anonyme',[{id:'number',label:'Numéro candidat (ex: 2)',max:2},{id:'question',label:'Ma question',long:true,max:500}]));
 }
 if(cid.startsWith('dj:submit:ask:')&&i.isModalSubmit()){
  const round=Number(cid.split(':')[3]),s=await store.session(guild),member=await store.entry(guild,i.user.id);
  if(s.phase!=='questions'||s.round_no!==round||member?.kind!=='judge')return dmReply(i,'Questions fermées.');
  const number=Number(i.fields.getTextInputValue('number')),q=i.fields.getTextInputValue('question').trim();
  const candidate=(await store.entries(guild,'candidate',true)).find(c=>c.number===number);
  if(!candidate||!q)return dmReply(i,'Numéro invalide ou question vide.');
  try{
   if((await store.questions(guild,round)).length>=10)return dmReply(i,'Maximum 10 questions pour ce round. Préviens Tropi.');
   const qu=await store.addQuestion(guild,round,i.user.id,candidate.user_id,q);
   const ok=await dmUser(candidate.user_id,`📩 **Don Juan — Question pour Candidat #${number}**\n${q}\n\nRéponds anonymement avec le bouton ci-dessous.`,[rowButton(`dj:answer:${qu.id}`,'Répondre à cette question')]);
   return dmReply(i,`✅ Question enregistrée pour Candidat #${number}.${ok?'':' ⚠️ Son MP est bloqué, Tropi pourra le relancer.'}`);
  }catch(e){if(e.code==='23505')return dmReply(i,'Tu as déjà posé une question pendant ce round.');throw e;}
 }
 if(cid.startsWith('dj:answer:')&&i.isButton()){
  const id=Number(cid.split(':')[2]),q=await store.question(guild,id),s=await store.session(guild);
  if(!q||q.candidate_id!==i.user.id||q.answer||!['questions','answers'].includes(s.phase)||q.round_no!==s.round_no)return dmReply(i,'Question indisponible ou déjà traitée.');
  return i.showModal(modal(`dj:submit:answer:${id}`,'Réponse anonyme',[{id:'answer',label:'Ma réponse (max 1200)',long:true,max:1200}]));
 }
 if(cid.startsWith('dj:submit:answer:')&&i.isModalSubmit()){
  const id=Number(cid.split(':')[3]),s=await store.session(guild);if(!['questions','answers'].includes(s.phase))return dmReply(i,'Réponses fermées.');
  const q=await store.question(guild,id);if(!q||q.candidate_id!==i.user.id||q.round_no!==s.round_no)return dmReply(i,'Question introuvable.');
  const answer=i.fields.getTextInputValue('answer').trim();if(!answer)return dmReply(i,'Réponse vide.');
  const result=await store.saveAnswer(guild,id,i.user.id,answer);
  return dmReply(i,result?'✅ Réponse enregistrée. Elle sera publiée anonymement dans le salon des juges.':'Réponse déjà enregistrée.');
 }
 if(cid.startsWith('dj:vote:')&&i.isStringSelectMenu()){
  const [,_,kind,r]=cid.split(':'),round=Number(r),s=await store.session(guild);
  if(i.guildId!==guild||!await store.entry(guild,i.user.id)|| (await store.entry(guild,i.user.id)).kind!=='judge')return privateReply(i,'🔒 Vote réservé aux juges inscrites.');
  const phase=kind==='presentation'?'presentation_vote':'round_vote';
  if(s.phase!==phase||s.round_no!==round)return privateReply(i,'⏳ Vote terminé.');
  const val=i.values[0];
  if(kind==='presentation'){
   const p=await store.entry(guild,val);if(p?.kind!=='candidate'||!p.presentation)return privateReply(i,'Choix invalide.');
  }else{
   const q=await store.question(guild,val);if(!q?.answer||q.round_no!==round)return privateReply(i,'Réponse invalide.');
  }
  await store.vote(guild,round,kind,i.user.id,val);
  return privateReply(i,'✅ Ton vote est enregistré et tu peux le modifier avant la clôture.');
 }
 return false;
}
async function handle(i){
 if(i.isChatInputCommand()&&i.commandName==='donjuan'){
  if(i.guildId!==guild)return privateReply(i,'Commande disponible uniquement sur Les Drôles d’Humains.');
  try{await handleCommand(i);}catch(e){console.error('DonJuan commande',e);await error(i,e);}return true;
 }
 if((i.isButton()||i.isModalSubmit()||i.isStringSelectMenu())&&i.customId.startsWith('dj:')){
  try{await handleComponent(i);}catch(e){console.error('DonJuan interaction',e);await error(i,e);}return true;
 }
 return false;
}
async function error(i,e){const msg=`❌ ${String(e.message).slice(0,180)}`;try{if(i.deferred||i.replied)await i.followUp({content:msg,flags:FLAG});else await i.reply({content:msg,flags:i.inGuild()?FLAG:undefined});}catch{}}
async function init(client,guildId,ownerId){bot=client;guild=guildId;owner=ownerId;await store.init();}
module.exports={command,init,handle,onReactionAdd:(reaction,user)=>reactionHandler(reaction,user,true),onReactionRemove:(reaction,user)=>reactionHandler(reaction,user,false)};
