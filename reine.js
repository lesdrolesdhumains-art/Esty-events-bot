'use strict';
/** 👑 LA REINE DES CŒURS — jeu autonome sur Neon (tables rc_*).
 * Esty reste propriétaire avec accès intégral aux secrets, même candidate.
 * Tropi peut être co-administrateur. Juges masculins, candidates anonymes.
 */
const {SlashCommandBuilder,ChannelType,ActionRowBuilder,ButtonBuilder,ButtonStyle,
 StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');
const db=require('./reine-db');
const E=MessageFlags.Ephemeral;
let bot,guild,owner;
const command=new SlashCommandBuilder().setName('reine').setDescription('👑 La Reine des Cœurs — candidates et jury masculin')
 .addSubcommand(s=>s.setName('admin-ajouter').setDescription('Donner les droits d’animation à Tropi ou un autre membre').addUserOption(o=>o.setName('membre').setDescription('Co-administrateur').setRequired(true)))
 .addSubcommand(s=>s.setName('admin-retirer').setDescription('Retirer un co-administrateur').addUserOption(o=>o.setName('membre').setDescription('Co-administrateur').setRequired(true)))
 .addSubcommand(s=>s.setName('salon-juges').setDescription('Réutiliser le salon privé des juges').addChannelOption(o=>o.setName('salon').setDescription('Salon privé du jury').addChannelTypes(ChannelType.GuildText).setRequired(true)))
 .addSubcommand(s=>s.setName('role-juges').setDescription('Rôle Discord pour les nouveaux juges').addRoleOption(o=>o.setName('role').setDescription('Rôle des juges').setRequired(true)))
 .addSubcommand(s=>s.setName('role-gagnante').setDescription('Rôle Discord de la gagnante').addRoleOption(o=>o.setName('role').setDescription('La Reine des Cœurs').setRequired(true)))
 .addSubcommand(s=>s.setName('juge-ajouter').setDescription('Ajouter un homme au jury').addUserOption(o=>o.setName('membre').setDescription('Juge masculin').setRequired(true)))
 .addSubcommand(s=>s.setName('juge-retirer').setDescription('Retirer un juge avant le début').addUserOption(o=>o.setName('membre').setDescription('Juge masculin').setRequired(true)))
 .addSubcommand(s=>s.setName('candidate-ajouter').setDescription('Inscrire une candidate (Esty comprise)').addUserOption(o=>o.setName('membre').setDescription('Candidate').setRequired(true)))
 .addSubcommand(s=>s.setName('candidate-retirer').setDescription('Retirer une candidate avant le début').addUserOption(o=>o.setName('membre').setDescription('Candidate').setRequired(true)))
 .addSubcommand(s=>s.setName('inscriptions-fermer').setDescription('Clore les inscriptions et tirer les numéros anonymes'))
 .addSubcommand(s=>s.setName('identites').setDescription('Voir les numéros et les vrais pseudos (Esty et admins)'))
 .addSubcommand(s=>s.setName('epreuve-creer').setDescription('Définir une nouvelle épreuve librement').addStringOption(o=>o.setName('titre').setDescription('Titre de l’épreuve').setMaxLength(100).setRequired(true)).addStringOption(o=>o.setName('consigne').setDescription('Texte envoyé aux candidates (max 1900 caractères)').setMaxLength(1900).setRequired(true)))
 .addSubcommand(s=>s.setName('epreuve-lancer').setDescription('Envoyer les consignes et formulaires en MP'))
 .addSubcommand(s=>s.setName('rappels').setDescription('Rappeler aux candidates en attente de rendre leur texte'))
 .addSubcommand(s=>s.setName('epreuve-publier').setDescription('Publier les réponses anonymes et ouvrir les notes /10').addBooleanOption(o=>o.setName('forcer').setDescription('Publier malgré des textes manquants')))
 .addSubcommand(s=>s.setName('notes-statut').setDescription('Voir qui a noté et qui n’a pas encore noté'))
 .addSubcommand(s=>s.setName('notes-fermer').setDescription('Clôturer les notes de l’épreuve').addBooleanOption(o=>o.setName('forcer').setDescription('Fermer même si des notes sont manquantes')))
 .addSubcommand(s=>s.setName('classement').setDescription('Afficher le classement privé de l’épreuve'))
 .addSubcommand(s=>s.setName('resultats-publier').setDescription('Publier les scores anonymes dans le salon des juges'))
 .addSubcommandGroup(g=>g.setName('archives').setDescription('🔐 Consultation privée par Esty et Tropi')
  .addSubcommand(s=>s.setName('participants').setDescription('Voir tous les participants (privé)'))
  .addSubcommand(s=>s.setName('secrets').setDescription('Voir le récapitulatif des réponses et notes'))
  .addSubcommand(s=>s.setName('texte').setDescription('Lire le texte intégral d’une candidate').addIntegerOption(o=>o.setName('numero').setDescription('Numéro de la candidate').setRequired(true).setMinValue(1)))
  .addSubcommand(s=>s.setName('notes-details').setDescription('Voir les notes et avis d’une candidate').addIntegerOption(o=>o.setName('numero').setDescription('Numéro de la candidate').setRequired(true).setMinValue(1))))
 .addSubcommand(s=>s.setName('eliminer').setDescription('Éliminer une candidate après la clôture des notes').addIntegerOption(o=>o.setName('numero').setDescription('Numéro anonyme de la candidate').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('confirmation').setDescription('Écrire ELIMINER').setRequired(true)))
 .addSubcommand(s=>s.setName('finale').setDescription('Couronner la dernière candidate en lice'))
 .addSubcommand(s=>s.setName('statut').setDescription('Résumé privé du jeu et des étapes'))
 .addSubcommand(s=>s.setName('aide').setDescription('Guide rapide des commandes'))
 .addSubcommand(s=>s.setName('reinitialiser').setDescription('Remettre à zéro UNIQUEMENT La Reine des Cœurs').addStringOption(o=>o.setName('confirmation').setDescription('Écrire EFFACER REINE').setRequired(true)));
function textField(id,label,style,maxLen,required=true){return new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(maxLen).setRequired(required));}
function answerButton(id){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rc:answer:${id}`).setLabel('✍️ Envoyer ou modifier mon texte').setStyle(ButtonStyle.Primary));}
function gradeMenu(stage,subs){return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
 .setCustomId(`rc:choose:${stage.id}`).setPlaceholder('Choisir une candidate à noter sur 10')
 .addOptions(subs.map(s=>({label:`Candidate n°${s.number}`,value:s.candidate_id,description:'Attribuer ou modifier sa note /10'}))));}
const trim=(s,n=1850)=>String(s||'').slice(0,n);
async function privateReply(i,msg){return i.editReply(trim(msg,1950));}
async function sendJudge(content){const cfg=await db.settings(guild);if(!cfg.judge_channel)throw Error('Configure d’abord `/reine salon-juges`.');const c=await bot.channels.fetch(cfg.judge_channel);if(!c?.isTextBased())throw Error('Salon des juges inaccessible.');return c.send({content:trim(content,1950),allowedMentions:{parse:[]}});}
async function sendAnimation(content){const c=await bot.channels.fetch(process.env.ANIMATION_CHANNEL_ID);if(!c?.isTextBased())throw Error('Salon animation inaccessible.');return c.send({content:trim(content,1950),allowedMentions:{parse:[]}});}
async function dm(user,content,components=[]){try{const u=await bot.users.fetch(user);await u.send({content:trim(content,1950),components,allowedMentions:{parse:[]}});return true;}catch(e){console.warn('MP non envoyé',user,e.message);return false;}}
async function judgeRole(user,add){const cfg=await db.settings(guild);if(!cfg.judge_role)return;try{const g=await bot.guilds.fetch(guild);const m=await g.members.fetch(user);if(add)await m.roles.add(cfg.judge_role);else await m.roles.remove(cfg.judge_role);}catch(e){console.warn('Impossible de modifier le rôle juge',user,e.message);}}
function rankText(rows,includeNames=false){return rows.map((r,k)=>`${k+1}. **N°${r.number}**${includeNames?` (<@${r.user_id}>)`:''} — ${r.moyenne===null?'aucune note':`${r.moyenne}/10 (${r.notes} notes)`}${r.active?'':' · éliminée'}`).join('\n')||'Aucune note.';}
async function admin(i){return i.user.id===owner||await db.isAdmin(guild,i.user.id);}
async function handle(i){
 if(i.isChatInputCommand()&&i.commandName==='reine'){
  if(i.guildId!==guild)return i.reply({content:'Commande réservée au serveur LDH.',flags:E});
  if(!await admin(i))return i.reply({content:'🔒 Seuls Esty et ses administrateurs peuvent utiliser ces commandes.',flags:E});
  const sub=i.options.getSubcommand();
  await i.deferReply({flags:E});
  if(sub==='admin-ajouter'||sub==='admin-retirer'){
   if(i.user.id!==owner)return privateReply(i,'🔒 Seule Esty peut nommer ou retirer des co-administrateurs.');
   const u=i.options.getUser('membre');if(sub==='admin-ajouter'){await db.addAdmin(guild,u.id);return privateReply(i,`✅ ${u.username} peut maintenant administrer **La Reine des Cœurs**.`);}if(u.id===owner)return privateReply(i,'Esty reste toujours propriétaire.');await db.removeAdmin(guild,u.id);return privateReply(i,`✅ ${u.username} n’est plus co-administrateur.`);
  }
  if(sub==='salon-juges'){const ch=i.options.getChannel('salon');await db.setSetting(guild,'judge_channel',ch.id);return privateReply(i,`✅ Salon du jury : <#${ch.id}>. Vérifie les permissions Discord de ce salon.`);}
  if(sub==='role-juges'||sub==='role-gagnante'){const r=i.options.getRole('role');const key=sub==='role-juges'?'judge_role':'winner_role';await db.setSetting(guild,key,r.id);if(key==='judge_role'){for(const j of await db.members(guild,'judge'))await judgeRole(j.user_id,true);}return privateReply(i,`✅ Rôle enregistré : <@&${r.id}>.`);}
  if(['juge-ajouter','juge-retirer','candidate-ajouter','candidate-retirer'].includes(sub)){
   const u=i.options.getUser('membre');if(u.bot)return privateReply(i,'Un compte bot ne peut pas participer.');const kind=sub.startsWith('juge')?'judge':'candidate';
   if(sub.endsWith('ajouter')){
    if(kind==='candidate'&&(await db.members(guild,'candidate')).length>=15)return privateReply(i,'Maximum 15 candidates.');
    await db.addMember(guild,u.id,kind);if(kind==='judge')await judgeRole(u.id,true);
    return privateReply(i,`✅ ${u.username} ajouté${kind==='candidate'?'e comme candidate':' au jury'}.`);
   }
   const removed=await db.removeMember(guild,u.id,kind);if(kind==='judge'&&removed)await judgeRole(u.id,false);
   return privateReply(i,removed?`✅ ${u.username} retiré${kind==='candidate'?'e':''}.`:'Cette personne n’était pas inscrite dans cette catégorie.');
  }
  if(sub==='inscriptions-fermer'){const n=await db.closeRegistrations(guild);return privateReply(i,`🔒 Inscriptions clôturées ! ${n} candidates ont reçu un numéro aléatoire secret. Consulte \`/reine identites\`.`);}
  if(sub==='participants'||sub==='identites'){
   const candidates=await db.members(guild,'candidate'),judges=await db.members(guild,'judge');
   const cs=candidates.map(x=>`${x.number?'#'+x.number:'•'} <@${x.user_id}>${x.active?'':' (éliminée)'}`).join('\n')||'Aucune';
   return privateReply(i,`👑 **Candidates (${candidates.length})**\n${cs}\n\n⚖️ **Juges (${judges.length})**\n${judges.map(x=>`• <@${x.user_id}>`).join('\n')||'Aucun'}`);
  }
  if(sub==='epreuve-creer'){const title=i.options.getString('titre').trim(),prompt=i.options.getString('consigne').trim();if(!title||!prompt)throw Error('Titre et consigne requis.');const s=await db.createStage(guild,title,prompt);return privateReply(i,`✅ Épreuve #${s.id} **${title}** créée en brouillon. Tropi peut lancer avec \`/reine epreuve-lancer\`.`);}
  const stage=await db.latest(guild);
  if(sub==='statut'){
   const cfg=await db.settings(guild),c=await db.members(guild,'candidate'),j=await db.members(guild,'judge');return privateReply(i,`👑 **La Reine des Cœurs**\nCandidates : ${c.filter(x=>x.active).length}/${c.length} actives · Juges : ${j.length}\nInscriptions : ${cfg.registrations_closed?'fermées':'ouvertes'}\nSalon juges : ${cfg.judge_channel?`<#${cfg.judge_channel}>`:'à configurer'}\nDernière épreuve : ${stage?`${stage.title} (${stage.status})`:'aucune'}`);
  }
  if(sub==='aide')return privateReply(i,'👑 **Commandes principales**\nConfiguration : `/reine admin-ajouter`, `salon-juges`, `role-juges`, `role-gagnante`\nInscriptions : `juge-ajouter`, `candidate-ajouter`, les commandes `-retirer`, `inscriptions-fermer`\nÉpreuves : `epreuve-creer`, `epreuve-lancer`, `rappels`, `epreuve-publier`, `notes-statut`, `notes-fermer`\nRésultats : `classement`, `resultats-publier`, `eliminer`, `finale`\nSecrets : `identites`, `/reine archives participants`, `/reine archives secrets`, `/reine archives texte`, `/reine archives notes-details`, `statut`\nRéinitialisation : `reinitialiser`');
  if(sub==='reinitialiser'){
   if(i.user.id!==owner)return privateReply(i,'🔒 Seule Esty peut remettre à zéro la compétition.');if(i.options.getString('confirmation')!=='EFFACER REINE')return privateReply(i,'❌ Annulé. Saisis exactement **EFFACER REINE**.');await db.reset(guild);return privateReply(i,'✅ Épreuves, réponses, notes et inscriptions Reine effacées. Configuration et admins conservés. Aucun dossier Problèmes ou Don Juan touché.');
  }
  if(!stage&&['epreuve-lancer','rappels','epreuve-publier','notes-statut','notes-fermer','classement','resultats-publier','secrets','eliminer','finale'].includes(sub) && !['finale','eliminer'].includes(sub))return privateReply(i,'Crée d’abord une épreuve avec `/reine epreuve-creer`.');
  if(sub==='epreuve-lancer'){
   if(stage.status!=='draft')return privateReply(i,'Cette épreuve a déjà été lancée.');const active=await db.members(guild,'candidate',true);if(!active.length)throw Error('Aucune candidate.');
   await db.setStageStatus(guild,stage.id,'draft','collect');let ok=0;
   for(const p of active){
    const first=await dm(p.user_id,`👑 **LA REINE DES CŒURS — ${stage.title}**\n\n${stage.prompt.slice(0,1550)}`);
    const remainder=stage.prompt.slice(1550);
    if(first&&await dm(p.user_id,`${remainder?remainder+'\n\n':''}Appuie sur le bouton pour envoyer ton texte (3 500 caractères max). Tu peux le modifier tant que Tropi n’a pas publié les réponses.`,[answerButton(stage.id)]))ok++;
   }
   return privateReply(i,`📩 Épreuve lancée. ${ok}/${active.length} MP envoyés. Les personnes avec MP fermés doivent les ouvrir.`);
  }
  if(sub==='rappels'){
   if(stage.status!=='collect')return privateReply(i,'Les textes ne sont pas en cours de collecte.');const active=await db.members(guild,'candidate',true),submitted=new Set((await db.submissions(stage.id)).map(x=>x.candidate_id));let sent=0;for(const a of active)if(!submitted.has(a.user_id)&&await dm(a.user_id,`🔔 **Rappel — ${stage.title}**\nTu n’as pas encore envoyé ton texte.`,[answerButton(stage.id)]))sent++;
   return privateReply(i,`📨 ${sent} rappel(s) envoyés ; ${active.length-submitted.size} candidate(s) sans texte.`);
  }
  if(sub==='epreuve-publier'){
   if(stage.status!=='collect')return privateReply(i,'Seules les épreuves en collecte peuvent être publiées.');const cfg=await db.settings(guild);if(!cfg.judge_channel)return privateReply(i,'Configure d’abord le salon des juges.');
   const active=await db.members(guild,'candidate',true),subs=(await db.submissions(stage.id)).filter(x=>x.active);const missing=active.filter(a=>!subs.some(s=>s.candidate_id===a.user_id));
   if(!subs.length)return privateReply(i,'Aucune réponse à publier.');if(missing.length&&!i.options.getBoolean('forcer'))return privateReply(i,`⚠️ Il manque ${missing.length} texte(s). Utilise \`/reine rappels\` ou \`/reine epreuve-publier forcer:true\`.`);
   await db.setStageStatus(guild,stage.id,'collect','published');await sendJudge(`👑 **LA REINE DES CŒURS — ${stage.title}**\n${subs.length} texte(s) anonymes. Chaque juge note CHAQUE texte sur **10** via le menu ci-dessous. Les notes sont secrètes jusqu’à clôture.`);
   for(const subm of subs){const pieces=subm.answer.match(/[\s\S]{1,1650}/g)||[];for(let k=0;k<pieces.length;k++)await sendJudge(`💌 **CANDIDATE N°${subm.number}**${pieces.length>1?` — partie ${k+1}/${pieces.length}`:''}\n${pieces[k]}`);}
   const cfgChannel=await bot.channels.fetch(cfg.judge_channel);await cfgChannel.send({content:'⚖️ **JUGES — choisissez une candidate et attribuez-lui une note de 0 à 10.**\nRecommencez pour chaque texte ; vous pouvez modifier une note tant que le vote est ouvert.',components:[gradeMenu(stage,subs)],allowedMentions:{parse:[]}});
   return privateReply(i,`✅ ${subs.length} texte(s) publiés anonymement. Notes ouvertes dans <#${cfg.judge_channel}>.`);
  }
  if(sub==='notes-statut'){
   const subs=await db.submissions(stage.id),judges=await db.members(guild,'judge'),grades=await db.grades(stage.id);return privateReply(i,`⚖️ **Notes de ${stage.title}** (${stage.status})\n${judges.map(j=>`<@${j.user_id}> : ${grades.filter(x=>x.judge_id===j.user_id).length}/${subs.length} notes`).join('\n')||'Aucun juge inscrit.'}`);
  }
  if(sub==='notes-fermer'){
   if(stage.status!=='published')return privateReply(i,'Les notes ne sont pas ouvertes.');const subs=await db.submissions(stage.id),judges=await db.members(guild,'judge'),grades=await db.grades(stage.id);const missing=judges.reduce((n,j)=>n+subs.filter(s=>!grades.some(x=>x.judge_id===j.user_id&&x.candidate_id===s.candidate_id)).length,0);
   if(missing&&!i.options.getBoolean('forcer'))return privateReply(i,`⏳ Il reste **${missing} notes** manquantes. Utilise \`/reine notes-fermer forcer:true\` seulement si tu assumes une clôture incomplète.`);
   await db.setStageStatus(guild,stage.id,'published','closed');return privateReply(i,`🔒 Notes clôturées. ${grades.length} note(s) reçues, ${missing} manquante(s). Consulte \`/reine classement\`.`);
  }
  if(sub==='classement'||sub==='resultats-publier'){
   if(stage.status!=='closed')return privateReply(i,'Clôture d’abord les notes.');const ranked=await db.ranking(guild,stage.id);const content=`🏆 **${stage.title} — Classement**\n${rankText(ranked,sub==='classement')}`;
   if(sub==='classement')return privateReply(i,content);await sendJudge(content);return privateReply(i,'✅ Classement anonyme publié dans le salon des juges.');
  }
  if(sub==='secrets'){
   const subs=await db.submissions(stage.id),grades=await db.grades(stage.id);const m=await db.members(guild,'candidate');const nums=new Map(m.map(x=>[x.user_id,x.number]));
   const lines=grades.map(g=>`#${nums.get(g.candidate_id)} • <@${g.judge_id}> : ${g.grade}/10${g.comment?` — « ${trim(g.comment,100)} »`:''}`);
   return privateReply(i,`🔐 **Secrets — ${stage.title}**\n${subs.map(s=>`#${s.number} : <@${s.candidate_id}> — ${trim(s.answer.replace(/\s+/g,' '),130)}`).join('\n')||'Aucun texte.'}\n\n**Notes nominatives :**\n${lines.join('\n')||'Aucune note.'}\n\n*Texte intégral : /reine archives texte ; notes détaillées : /reine archives notes-details.*`);
  }
  if(sub==='texte'||sub==='notes-details'){
   if(!stage)return privateReply(i,'Crée d’abord une épreuve.');const n=i.options.getInteger('numero'),entries=await db.members(guild,'candidate');const candidate=entries.find(x=>x.number===n);if(!candidate)return privateReply(i,'Candidate introuvable.');
   const subs=await db.submissions(stage.id),answer=subs.find(x=>x.candidate_id===candidate.user_id);
   if(sub==='texte'){if(!answer)return privateReply(i,`N°${n} : aucun texte reçu pour cette épreuve.`);await privateReply(i,`🔐 **Texte intégral — n°${n} (<@${candidate.user_id}>)** — ${stage.title}`);for(const part of (answer.answer.match(/[\s\S]{1,1750}/g)||[]))await i.followUp({content:part,flags:E});return true;}
   const ratings=(await db.grades(stage.id)).filter(x=>x.candidate_id===candidate.user_id),lines=ratings.map(x=>`<@${x.judge_id}> : **${x.grade}/10**${x.comment?` — ${x.comment}`:''}`);await privateReply(i,`🔐 **Toutes les notes et avis — n°${n}** (${stage.title})`);for(const part of (lines.join('\n').match(/[\s\S]{1,1750}/g)||['Aucune note.']))await i.followUp({content:part,flags:E});return true;
  }
  if(sub==='eliminer'){
   if(!stage||stage.status!=='closed')return privateReply(i,'Clôture les notes avant toute élimination.');if(i.options.getString('confirmation')!=='ELIMINER')return privateReply(i,'❌ Annulé : il faut écrire **ELIMINER**.');
   const active=await db.members(guild,'candidate',true);if(active.length<=1)return privateReply(i,'Il ne reste qu’une candidate ; utilise `/reine finale`.');const n=i.options.getInteger('numero');const victim=active.find(x=>x.number===n);if(!victim)return privateReply(i,'Numéro introuvable parmi les candidates actives.');
   await db.eliminate(guild,n);await sendAnimation(`💔 **LA REINE DES CŒURS — ÉLIMINATION**\nLa candidate **n°${n}** quitte la compétition : <@${victim.user_id}>.\nMerci pour sa participation ! ❤️`);return privateReply(i,`✅ Candidate n°${n} éliminée. Elle a été annoncée dans le salon des animations.`);
  }
  if(sub==='finale'){
   const active=await db.members(guild,'candidate',true);if(active.length!==1)return privateReply(i,`Il faut exactement une candidate encore active (actuellement ${active.length}).`);if(!stage||stage.status!=='closed')return privateReply(i,'Clôture la dernière épreuve avant de couronner la gagnante.');
   const winner=active[0],cfg=await db.settings(guild);if(cfg.winner_role){try{const g=await bot.guilds.fetch(guild),member=await g.members.fetch(winner.user_id);await member.roles.add(cfg.winner_role);}catch(e){console.warn('Rôle gagnante non attribué',e.message);}}
   await sendAnimation(`👑❤️ **LA REINE DES CŒURS EST COURONNÉE !**\nFélicitations à <@${winner.user_id}> — candidate n°${winner.number} ! 🥂`);return privateReply(i,'👑 Gagnante annoncée ! Vérifie son rôle Discord si un rôle était configuré.');
  }
  return privateReply(i,'Commande non reconnue.');
 }
 // Interactions de candidatures et de notes : acceptées aussi en MP (sans guildId).
 if(i.isButton()&&/^rc:answer:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]),st=await db.stage(guild,id),person=await db.member(guild,i.user.id);
  if(!st||st.status!=='collect'||!person||person.kind!=='candidate'||!person.active)return i.reply({content:'Ce formulaire est fermé ou tu ne participes pas à cette épreuve.',flags:E});
  const old=(await db.submissions(id)).find(x=>x.candidate_id===i.user.id);
  const modal=new ModalBuilder().setCustomId(`rc:submit:${id}`).setTitle('👑 '+trim(st.title,39)).addComponents(textField('texte','Ton texte (3 500 caractères max)',TextInputStyle.Paragraph,3500));
  if(old){modal.components[0].components[0].setValue(old.answer.slice(0,3500));}
  await i.showModal(modal);return true;
 }
 if(i.isModalSubmit()&&/^rc:submit:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]);await db.saveSubmission(guild,id,i.user.id,i.fields.getTextInputValue('texte').trim());await i.reply({content:'✅ Ton texte a été enregistré anonymement ! Tu peux encore le modifier avant sa publication.',flags:E});return true;
 }
 if(i.isStringSelectMenu()&&/^rc:choose:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]),st=await db.stage(guild,id),j=await db.member(guild,i.user.id);
  if(!st||st.status!=='published'||!j||j.kind!=='judge')return i.reply({content:'🔒 Notes fermées ou accès réservé aux juges.',flags:E});
  const target=i.values[0],entry=await db.member(guild,target),subs=await db.submissions(id);
  if(!entry||!subs.some(s=>s.candidate_id===target))return i.reply({content:'Candidate non disponible.',flags:E});
  const modal=new ModalBuilder().setCustomId(`rc:grade:${id}:${target}`).setTitle(`Note — candidate n°${entry.number}`)
   .addComponents(textField('note','Note sur 10 (0 à 10)',TextInputStyle.Short,2),textField('avis','Avis facultatif (secret)',TextInputStyle.Paragraph,500,false));
  const old=(await db.grades(id)).find(g=>g.judge_id===i.user.id&&g.candidate_id===target);if(old){modal.components[0].components[0].setValue(String(old.grade));if(old.comment)modal.components[1].components[0].setValue(old.comment);}
  await i.showModal(modal);return true;
 }
 if(i.isModalSubmit()&&/^rc:grade:\d+:\d+$/.test(i.customId)){
  const [, , id, target]=i.customId.split(':'),raw=i.fields.getTextInputValue('note').trim();if(!/^(10|[0-9])$/.test(raw))return i.reply({content:'❌ La note doit être un entier de 0 à 10.',flags:E});
  const comment=i.fields.getTextInputValue('avis').trim();await db.setGrade(guild,Number(id),i.user.id,target,Number(raw),comment);await i.reply({content:`✅ Note **${raw}/10** enregistrée ! Choisis une autre candidate dans le menu pour continuer.`,flags:E});return true;
 }
 return false;
}
async function init(client,guildId,ownerId){bot=client;guild=guildId;owner=ownerId;await db.init();await db.settings(guild);}
module.exports={command,init,handle};
