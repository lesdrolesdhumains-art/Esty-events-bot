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
 .addSubcommand(s=>s.setName('suivi').setDescription('Tableau complet privé : réponses, questions et votes ✅ ⏳'))
 .addSubcommand(s=>s.setName('aide').setDescription('Aide et commandes de La Reine des Cœurs'))
 .addSubcommand(s=>s.setName('reinitialiser').setDescription('Remettre à zéro UNIQUEMENT La Reine des Cœurs').addStringOption(o=>o.setName('confirmation').setDescription('Écrire EFFACER REINE').setRequired(true)));
// Extensions sans changer les 25 entrées /reine existantes (limite de Discord).
const extraCommand=new SlashCommandBuilder().setName('coeur').setDescription('👑 Présentation, questions et homme infiltré')
 .addSubcommand(sc=>sc.setName('presentation-preparer').setDescription('Préparer la première épreuve validée'))
 .addSubcommand(sc=>sc.setName('poeme-preparer').setDescription('Préparer « Lui, mon roi » : poème titré de 10 à 25 vers'))
 .addSubcommand(sc=>sc.setName('numeros-melanger').setDescription('Remélanger les numéros actifs après élimination et avant la manche suivante').addStringOption(o=>o.setName('confirmation').setDescription('Écrire MELANGER').setRequired(true)))
 .addSubcommand(sc=>sc.setName('infiltre-ajouter').setDescription('Inscrire un homme comme candidat ET juge').addUserOption(o=>o.setName('membre').setDescription('Homme infiltré').setRequired(true)))
 .addSubcommand(sc=>sc.setName('infiltre-retirer').setDescription('Retirer le double rôle (conserve sa candidature)').addUserOption(o=>o.setName('membre').setDescription('Infiltré').setRequired(true)))
 .addSubcommand(sc=>sc.setName('questions-preparer').setDescription('Préparer la manche de 3 questions par juge'))
 .addSubcommand(sc=>sc.setName('questions-lancer').setDescription('Inviter les juges à poser leurs questions en MP'))
 .addSubcommand(sc=>sc.setName('questions-rappels').setDescription('Relancer les juges et candidates en attente'))
 .addSubcommand(sc=>sc.setName('questions-fermer').setDescription('Fermer la collecte des questions, laisser répondre'))
 .addSubcommand(sc=>sc.setName('questions-publier').setDescription('Publier les réponses anonymes et ouvrir les notes /10').addBooleanOption(o=>o.setName('forcer').setDescription('Publier avec des réponses manquantes')))
 .addSubcommand(sc=>sc.setName('questions-notes-rappels').setDescription('Relancer en MP les juges qui n’ont pas tout noté'))
 .addSubcommand(sc=>sc.setName('questions-notes-fermer').setDescription('Fermer les notes de la manche des questions').addBooleanOption(o=>o.setName('forcer').setDescription('Clôturer même s’il manque des notes')))
 .addSubcommand(sc=>sc.setName('questions-classement').setDescription('Moyenne /10 par candidate pour les réponses aux questions'))
 .addSubcommand(sc=>sc.setName('questions-resultats-publier').setDescription('Publier le classement anonyme de la manche des questions'))
 .addSubcommand(sc=>sc.setName('questions-secrets').setDescription('Voir toutes les questions/réponses et leurs identités en privé'))
 .addSubcommand(sc=>sc.setName('classement-precedent').setDescription('Retrouver le classement de la dernière épreuve notée'));
function askButton(id){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rc:qask:${id}`).setLabel('💌 Poser une question (3 maximum)').setStyle(ButtonStyle.Primary));}
function questionReplyButton(id){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rc:qreply:${id}`).setLabel('✍️ Répondre à cette question').setStyle(ButtonStyle.Primary));}
function questionGradeButton(id){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rc:qrate:${id}`).setLabel('⭐ Noter cette réponse /10').setStyle(ButtonStyle.Primary));}
function questionRankText(rows,names=false){return rows.map((r,i)=>`${i+1}. **N°${r.number}**${names?` (<@${r.user_id}>)`:''} — ${r.moyenne===null?'non évaluée (aucune note)':`${r.moyenne}/10 (${r.questions} réponse(s), ${r.notes} note(s))`}${r.active?'':' · éliminée'}`).join('\n')||'Aucune candidate.';}
function expectedQuestionGrades(judges,answered){return judges.map(j=>({judge:j,questions:answered.filter(q=>q.candidate_id!==j.user_id)}));}
const PRESENTATION_TITLE='👑 Qui se cache derrière la couronne ?';
const PRESENTATION_PROMPT='Présente-toi anonymement au jury : ta personnalité, tes qualités, tes petits défauts, tes contradictions, ta vision de l’amour et ce qui te rend différente. Sois naturelle, sincère, drôle ou mystérieuse selon ton caractère. Longueur conseillée : 150 à 300 mots. Ne donne pas ton pseudo ni d’indices permettant de deviner ton identité.';
// Reprise fidèle du défi « Elle, ma reine » de Don Juan, inversé pour les candidates.
// Kind « poem » évite de confondre le suivi des présentations et celui des poèmes.
const POEM_TITLE='🌹 Le défi du poète — Lui, mon roi';
const POEM_PROMPT=`🌹 LE DÉFI DU POÈTE — « Lui, mon roi »

Imagine un homme que tu désires profondément, que tu admires et qui te fascine. Écris un poème original pour le placer sur un piédestal : fais de lui ta muse, ton roi. Célèbre son charme, mais aussi son esprit, sa force, sa sensibilité et sa liberté, sans le réduire à son physique.

RÈGLES : donne un titre à ton poème (champ séparé) ; écris entre 10 et 25 vers (chaque ligne non vide = 1 vers). Poème : 3 900 caractères maximum ; titre : 100 caractères maximum. Le style doit être sensuel, élégant et romantique, sans vulgarité ni description sexuelle explicite. N'utilise aucun pseudo ni indice révélant ton identité.

OBJECTIF : que le jury sente pourquoi cet homme est unique à tes yeux et pourquoi il mériterait d'être ton roi.`;
function poemVerses(body){return String(body).split(/\r?\n/).filter(line=>line.trim().length>0).length;}
function poemCheck(title,body){
 if(!title||title.length>100)return '⛔ Donne un titre à ton poème (100 caractères maximum).';
 if(!body||body.length>3900)return '⛔ Ton poème doit contenir au maximum 3 900 caractères.';
 const n=poemVerses(body);
 if(n<10||n>25)return `⛔ Ton poème compte **${n} vers**. Il doit en comporter **10 à 25** (chaque ligne non vide compte pour un vers). Modifie-le puis renvoie-le.`;
 return null;
}
function decodePoem(saved){
 const match=String(saved||'').match(/^\*\*(.+?)\*\*\n\n([\s\S]*)$/);
 return match?{title:match[1],body:match[2]}:{title:'',body:''};
}

function textField(id,label,style,maxLen,required=true){return new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(maxLen).setRequired(required));}
function answerButton(id){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rc:answer:${id}`).setLabel('✍️ Envoyer ou modifier mon texte').setStyle(ButtonStyle.Primary));}
function gradeMenu(stage,subs){return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
 .setCustomId(`rc:choose:${stage.id}`).setPlaceholder('Choisir une candidate à noter sur 10')
 .addOptions(subs.map(s=>({label:`Candidate n°${s.number}`,value:s.candidate_id,description:'Attribuer ou modifier sa note /10'}))));}
const trim=(s,n=1850)=>String(s||'').slice(0,n);
async function privateReply(i,msg){return i.editReply(trim(msg,1950));}

// Envoyer autant de messages éphémères que nécessaire pour voir tout le suivi,
// sans jamais publier les identités, réponses ou notes nominatives dans un salon.
async function privateSuivi(i,sections){
 const blocks=[];
 for(const section of sections){
  let chunk='';
  for(const line of String(section).split('\n')){
   if(line.length>1700){
    if(chunk){blocks.push(chunk);chunk='';}
    for(let offset=0;offset<line.length;offset+=1700)blocks.push(line.slice(offset,offset+1700));
    continue;
   }
   if(chunk && chunk.length+line.length+1>1750){blocks.push(chunk);chunk='';}
   chunk+=(chunk?'\n':'')+line;
  }
  if(chunk)blocks.push(chunk);
 }
 if(!blocks.length)blocks.push('Aucune information pour le moment.');
 await i.editReply({content:blocks[0],allowedMentions:{parse:[]}});
 for(const content of blocks.slice(1))await i.followUp({content,flags:E,allowedMentions:{parse:[]}});
 return true;
}
function suiviEtat(st){
 if(!st)return 'pas encore créée';
 if(st.status==='draft')return '🕒 préparée (pas lancée)';
 if(st.kind==='questions' && st.status==='published' && !st.questions_posted)return '📨 questions fermées · réponses en attente';
 if(st.status==='collect')return st.kind==='questions'?'✉️ questions et réponses en cours':'✍️ réponses en cours';
 if(st.status==='published')return '⭐ notes ouvertes';
 return st.status==='closed'?'🔒 terminée':st.status;
}
function suiviNom(p,numero=p.number){return `${numero?`N°${numero}`:'Sans n°'} — <@${p.user_id}>${p.active?'':' · éliminée'}`;}
// Lecture seule. Aucune table créée, aucune inscription ou note modifiée.
async function afficherSuivi(i){
 const [candidates,judges,allStages]=await Promise.all([
  db.members(guild,'candidate'),db.members(guild,'judge'),
  db.q("SELECT id,title,status,kind,questions_posted FROM rc_stages WHERE guild_id=$1 ORDER BY id",[guild])
 ]);
 const stages=allStages.rows,latest=stages[stages.length-1],
  presentation=[...stages].reverse().find(s=>s.kind==='text'),
  questionsStage=[...stages].reverse().find(s=>s.kind==='questions');
 const sections=[`👑 **LA REINE DES CŒURS — SUIVI COMPLET**\n🔐 Privé : visible seulement par Esty et les co-administrateurs.\n📍 Étape actuelle : **${latest?latest.title:'Inscriptions / préparation'}** — ${suiviEtat(latest)}\n👩 **${candidates.filter(c=>c.active).length}/${candidates.length}** candidates encore en jeu · ⚖️ **${judges.length}** juges (infiltré compris)\n✅ Terminé · ⏳ En attente · ➖ Pas concerné / pas encore ouvert · ❌ Manquant après clôture`];
 if(!presentation){
  sections.push('💌 **1. PRÉSENTATIONS**\n🕒 Aucune épreuve de présentation créée.\n' +
   (candidates.map(c=>`➖ ${suiviNom(c)}`).join('\n')||'_Aucune candidate inscrite._'));
 }else{
  const [submissions,ratings,historicNums]=await Promise.all([db.submissions(presentation.id),db.grades(presentation.id),db.stageNumberMap(presentation.id)]);
  const received=new Set(submissions.map(x=>x.candidate_id));
  const total=candidates.filter(c=>received.has(c.user_id)).length;
  const candidatelist=candidates.map(c=>{
   const done=received.has(c.user_id),icon=done?'✅':presentation.status==='draft'?'➖':['published','closed'].includes(presentation.status)?'❌':'⏳';
   return `${icon} ${suiviNom(c,historicNums.get(c.user_id)??c.number)} · ${done?'texte reçu':'texte non reçu'}`;
  }).join('\n')||'_Aucune candidate._';
  sections.push(`💌 **1. PRÉSENTATIONS — ${presentation.title}**\n${suiviEtat(presentation)} · **${total}/${candidates.length}** textes reçus\n${candidatelist}\n${presentation.status==='collect'?'💡 Relances : `/reine rappels`':''}`);
  let bulletins=0,doneNotes=0,expectedNotes=0;
  const judgeslines=judges.map(j=>{
   const expected=submissions.filter(x=>x.candidate_id!==j.user_id);
   const graded=expected.filter(x=>ratings.some(g=>g.judge_id===j.user_id&&g.candidate_id===x.candidate_id)).length;
   expectedNotes+=expected.length;doneNotes+=graded;
   if(expected.length&&graded===expected.length)bulletins++;
   const icon=['draft','collect'].includes(presentation.status)||!expected.length?'➖':graded===expected.length?'✅':presentation.status==='closed'?'❌':'⏳';
   return `${icon} <@${j.user_id}> — **${graded}/${expected.length} notes**${expected.some(x=>x.candidate_id===j.user_id)?' (auto-note interdite)':''}`;
  });
  sections.push(`⭐ **VOTES — PRÉSENTATIONS**\n${suiviEtat(presentation)} · **${doneNotes}/${expectedNotes}** notes enregistrées · **${bulletins}/${judges.length}** juges ayant tout noté\n${judgeslines.join('\n')||'_Aucun juge inscrit._'}\n${presentation.status==='published'?'💡 Notes en cours, utiliser `/reine suivi` pour actualiser.':''}`);
 }
 if(!questionsStage){
  sections.push('💌 **2. QUESTIONS / RÉPONSES / VOTES**\n🕒 Manche non créée. Elle apparaîtra ici après `/coeur questions-preparer`.');
 }else{
  const [questions,grades,historicNums]=await Promise.all([db.questions(questionsStage.id),db.questionGrades(questionsStage.id),db.stageNumberMap(questionsStage.id)]);
  const answered=questions.filter(x=>x.answer!==null);
  const published=Boolean(questionsStage.questions_posted);
  const current=questionsStage.status;
  const askedJudges=judges.map(j=>{
   const asked=questions.filter(q=>q.judge_id===j.user_id).length;
   // Le quota de 3 est un maximum, pas une obligation.
   const icon=current==='draft'?'➖':current==='collect'?(asked===3?'✅':'⏳'):asked?'✅':'➖';
   return `${icon} <@${j.user_id}> — **${asked}/3 questions**${current!=='collect'?' (envoi terminé)':''}`;
  });
  sections.push(`❓ **2. QUESTIONS POSÉES**\n${suiviEtat(questionsStage)} · **${questions.length}/${judges.length*3}** questions possibles\n${askedJudges.join('\n')||'_Aucun juge._'}\n*Chaque juge peut poser jusqu’à 3 questions, sans obligation d’utiliser tout son quota.*`);
  const ansLines=candidates.map(c=>{
   const qs=questions.filter(q=>q.candidate_id===c.user_id),done=qs.filter(q=>q.answer!==null).length;
   const icon=!qs.length?'➖':done===qs.length?'✅':published||current==='closed'?'❌':'⏳';
   return `${icon} ${suiviNom(c,historicNums.get(c.user_id)??c.number)} — **${done}/${qs.length} réponses**${!qs.length?' (aucune question reçue)':''}`;
  });
  sections.push(`💬 **RÉPONSES DES CANDIDATES**\n**${answered.length}/${questions.length}** réponses rendues\n${ansLines.join('\n')||'_Aucune candidate._'}\n${!published&&questions.length?'💡 Relances : `/coeur questions-rappels`':''}`);
  const notesJudges=judges.map(j=>{
   const possible=answered.filter(q=>q.candidate_id!==j.user_id),done=possible.filter(q=>grades.some(g=>g.judge_id===j.user_id&&Number(g.question_id)===Number(q.id))).length;
   const icon=!published||!possible.length?'➖':done===possible.length?'✅':current==='closed'?'❌':'⏳';
   return {line:`${icon} <@${j.user_id}> — **${done}/${possible.length} notes**${answered.some(q=>q.candidate_id===j.user_id)?' (auto-note interdite)':''}`,done,expected:possible.length};
  });
  const voteDone=notesJudges.reduce((n,x)=>n+x.done,0),voteTotal=notesJudges.reduce((n,x)=>n+x.expected,0),
   complete=notesJudges.filter(x=>x.expected>0&&x.done===x.expected).length;
  sections.push(`⭐ **VOTES — RÉPONSES AUX QUESTIONS**\n${published?suiviEtat(questionsStage):'🕒 notation pas encore ouverte'} · **${voteDone}/${voteTotal}** notes enregistrées · **${complete}/${judges.length}** juges ayant tout noté\n${notesJudges.map(x=>x.line).join('\n')||'_Aucun juge._'}\n${published&&current==='published'?'💡 Relances : `/coeur questions-notes-rappels`':''}`);
  if(questions.length){
   sections.push(`🔎 **DÉTAIL DES QUESTIONS (${questions.length})**\n${questions.map(q=>`${q.answer!==null?'✅':'⏳'} Question ${q.id} · <@${q.judge_id}> → ${q.candidate_number?'N°'+q.candidate_number:'candidate'} <@${q.candidate_id}>`).join('\n')}`);
  }
 }
  const poem=[...stages].reverse().find(s=>s.kind==='poem');
  if(poem){
   const [poems,grades,historicNums]=await Promise.all([db.submissions(poem.id),db.grades(poem.id),db.stageNumberMap(poem.id)]);
   const submitted=new Set(poems.map(p=>p.candidate_id));
   const who=candidates.filter(c=>c.active||submitted.has(c.user_id)).map(c=>{
    const has=submitted.has(c.user_id);
    const mark=has?'✅':poem.status==='draft'?'➖':poem.status==='collect'?'⏳':'❌';
    return `${mark} ${suiviNom(c,historicNums.get(c.user_id)??c.number)} — ${has?'poème reçu':'en attente du poème'}`;
   });
   sections.push(`🌹 **3. LUI, MON ROI — POÈMES**\n${suiviEtat(poem)} · ${poems.length} poème(s) reçu(s)\n${who.join('\n')||'_Aucune candidate._'}`);
   const judgeLines=judges.map(j=>{
    const expected=poems.filter(p=>p.candidate_id!==j.user_id);
    const received=expected.filter(p=>grades.some(g=>g.judge_id===j.user_id&&g.candidate_id===p.candidate_id)).length;
    const flag=['draft','collect'].includes(poem.status)||!expected.length?'➖':received===expected.length?'✅':poem.status==='closed'?'❌':'⏳';
    return `${flag} <@${j.user_id}> — ${received}/${expected.length} notes${poems.some(p=>p.candidate_id===j.user_id)?' (sans auto-notation)':''}`;
   });
   sections.push(`⭐ **VOTES — LUI, MON ROI**\n${poem.status==='published'? 'Notes ouvertes':suiviEtat(poem)}\n${judgeLines.join('\n')||'_Aucun juge._'}`);
  }
  sections.push('🔐 **Rappel :** ce suivi affiche les pseudos pour Esty et Tropi uniquement.\nLes notes ne sont pas publiées automatiquement et les éliminations restent manuelles.');
 return privateSuivi(i,sections);
}

async function sendJudge(content){const cfg=await db.settings(guild);if(!cfg.judge_channel)throw Error('Configure d’abord `/reine salon-juges`.');const c=await bot.channels.fetch(cfg.judge_channel);if(!c?.isTextBased())throw Error('Salon des juges inaccessible.');return c.send({content:trim(content,1950),allowedMentions:{parse:[]}});}
async function sendAnimation(content){const c=await bot.channels.fetch(process.env.ANIMATION_CHANNEL_ID);if(!c?.isTextBased())throw Error('Salon animation inaccessible.');return c.send({content:trim(content,1950),allowedMentions:{parse:[]}});}
async function dm(user,content,components=[]){try{const u=await bot.users.fetch(user);await u.send({content:trim(content,1950),components,allowedMentions:{parse:[]}});return true;}catch(e){console.warn('MP non envoyé',user,e.message);return false;}}
async function judgeRole(user,add){const cfg=await db.settings(guild);if(!cfg.judge_role)return;try{const g=await bot.guilds.fetch(guild);const m=await g.members.fetch(user);if(add)await m.roles.add(cfg.judge_role);else await m.roles.remove(cfg.judge_role);}catch(e){console.warn('Impossible de modifier le rôle juge',user,e.message);}}
function rankText(rows,includeNames=false){return rows.map((r,k)=>`${k+1}. **N°${r.number}**${includeNames?` (<@${r.user_id}>)`:''} — ${r.moyenne===null?'aucune note':`${r.moyenne}/10 (${r.notes} notes)`}${r.active?'':' · éliminée'}`).join('\n')||'Aucune note.';}
async function admin(i){return i.user.id===owner||await db.isAdmin(guild,i.user.id);}
async function handle(i){
 if(i.isChatInputCommand() && i.commandName==='coeur')return handleExtra(i);
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
   const wasDual=await db.isDualJudge(guild,u.id);const removed=await db.removeMember(guild,u.id,kind);if(removed&&(kind==='judge'||(kind==='candidate'&&wasDual)))await judgeRole(u.id,false);
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
  if(sub==='suivi')return afficherSuivi(i);
   if(sub==='aide')return privateReply(i,'👑 **Aide — La Reine des Cœurs**\nSuivi complet : `/reine suivi`\nPrésentations : `/coeur presentation-preparer`, puis `/reine epreuve-lancer`, `/reine rappels`, `/reine epreuve-publier`, `/reine notes-fermer`\nQuestions : `/coeur questions-preparer`, `/coeur questions-lancer`, `/coeur questions-rappels`, `/coeur questions-fermer`, `/coeur questions-publier`, `/coeur questions-notes-rappels`, `/coeur questions-notes-fermer`\nPoèmes « Lui, mon roi » : `/coeur poeme-preparer`, `/reine epreuve-lancer`, `/reine rappels`, `/reine epreuve-publier`, `/reine notes-fermer`, `/reine classement`\nÉliminations : `/reine eliminer` (nombre au choix de Tropi).\nRemélange des numéros actifs : `/coeur numeros-melanger confirmation:MELANGER` uniquement entre deux manches.');
  if(sub==='reinitialiser'){
   if(i.user.id!==owner)return privateReply(i,'🔒 Seule Esty peut remettre à zéro la compétition.');if(i.options.getString('confirmation')!=='EFFACER REINE')return privateReply(i,'❌ Annulé. Saisis exactement **EFFACER REINE**.');await db.reset(guild);return privateReply(i,'✅ Épreuves, réponses, notes et inscriptions Reine effacées. Configuration et admins conservés. Aucun dossier Problèmes ou Don Juan touché.');
  }
  if(!stage&&['epreuve-lancer','rappels','epreuve-publier','notes-fermer','classement','resultats-publier','secrets','eliminer','finale'].includes(sub) && !['finale','eliminer'].includes(sub))return privateReply(i,'Crée d’abord une épreuve avec `/reine epreuve-creer`.');
  if(stage?.kind==='questions' && ['epreuve-lancer','rappels','epreuve-publier','notes-fermer','classement','resultats-publier','secrets','texte','notes-details'].includes(sub))return privateReply(i,'Cette manche est celle des questions : utilise les commandes `/coeur questions-...`.');
  if(sub==='epreuve-lancer'){
   if(stage.status!=='draft')return privateReply(i,'Cette épreuve a déjà été lancée.');const active=await db.members(guild,'candidate',true);if(!active.length)throw Error('Aucune candidate.');
   await db.setStageStatus(guild,stage.id,'draft','collect');let ok=0;
   for(const p of active){
    const first=await dm(p.user_id,`👑 **LA REINE DES CŒURS — ${stage.title}**\n\n${stage.prompt.slice(0,1550)}`);
    const remainder=stage.prompt.slice(1550);
    if(first&&await dm(p.user_id,`${remainder?remainder+'\n\n':''}${stage.kind==='poem'?'Appuie sur le bouton pour envoyer ton poème : titre obligatoire, 10 à 25 vers et 3 900 caractères maximum.':'Appuie sur le bouton pour envoyer ton texte (3 500 caractères max).'} Tu peux le modifier tant que Tropi n’a pas publié les réponses.`,[answerButton(stage.id)]))ok++;
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
  if(sub==='notes-fermer'){
   if(stage.status!=='published')return privateReply(i,'Les notes ne sont pas ouvertes.');const subs=await db.submissions(stage.id),judges=await db.members(guild,'judge'),grades=await db.grades(stage.id);const missing=judges.reduce((n,j)=>n+subs.filter(s=>s.candidate_id!==j.user_id&&!grades.some(x=>x.judge_id===j.user_id&&x.candidate_id===s.candidate_id)).length,0);
   if(missing&&!i.options.getBoolean('forcer'))return privateReply(i,`⏳ Il reste **${missing} notes** manquantes. Utilise \`/reine notes-fermer forcer:true\` seulement si tu assumes une clôture incomplète.`);
   await db.setStageStatus(guild,stage.id,'published','closed');return privateReply(i,`🔒 Notes clôturées. ${grades.length} note(s) reçues, ${missing} manquante(s). Consulte \`/reine classement\`.`);
  }
  if(sub==='classement'||sub==='resultats-publier'){
   if(stage.status!=='closed')return privateReply(i,'Clôture d’abord les notes.');const ranked=await db.ranking(guild,stage.id);const content=`🏆 **${stage.title} — Classement**\n${rankText(ranked,sub==='classement')}`;
   if(sub==='classement')return privateReply(i,content);await sendJudge(content);return privateReply(i,'✅ Classement anonyme publié dans le salon des juges.');
  }
  if(sub==='secrets'){
   const subs=await db.submissions(stage.id),grades=await db.grades(stage.id);const nums=new Map(subs.map(x=>[x.candidate_id,x.number]));
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
  const modal=new ModalBuilder().setCustomId(`rc:submit:${id}`).setTitle('👑 '+trim(st.title,39));
  if(st.kind==='poem'){
   modal.addComponents(textField('titre','Titre de ton poème (100 caractères)',TextInputStyle.Short,100),
                       textField('poeme','Ton poème (10 à 25 vers)',TextInputStyle.Paragraph,3900));
   if(old){const previous=decodePoem(old.answer);if(previous.title)modal.components[0].components[0].setValue(previous.title.slice(0,100));if(previous.body)modal.components[1].components[0].setValue(previous.body.slice(0,3900));}
  }else{
   modal.addComponents(textField('texte','Ton texte (3 500 caractères max)',TextInputStyle.Paragraph,3500));
   if(old)modal.components[0].components[0].setValue(old.answer.slice(0,3500));
  }
  await i.showModal(modal);return true;
 }
 if(i.isModalSubmit()&&/^rc:submit:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]),st=await db.stage(guild,id);
  if(!st)return i.reply({content:'Cette épreuve n’existe plus.',flags:E});
  if(st.kind==='poem'){
   const title=i.fields.getTextInputValue('titre').trim(),body=i.fields.getTextInputValue('poeme').trim();
   const error=poemCheck(title,body);
   if(error)return i.reply({content:error,flags:E});
   await db.saveSubmission(guild,id,i.user.id,`**${title}**\n\n${body}`);
   return i.reply({content:`✅ Poème **« ${title} »** enregistré anonymement (${poemVerses(body)} vers). Tu peux le modifier jusqu'à sa publication.`,flags:E});
  }
  await db.saveSubmission(guild,id,i.user.id,i.fields.getTextInputValue('texte').trim());
  await i.reply({content:'✅ Ton texte a été enregistré anonymement ! Tu peux encore le modifier avant sa publication.',flags:E});return true;
 }
 if(i.isStringSelectMenu()&&/^rc:choose:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]),st=await db.stage(guild,id),j=await db.member(guild,i.user.id);
  if(!st||st.status!=='published'||!j||(j.kind!=='judge'&&!await db.isDualJudge(guild,i.user.id)))return i.reply({content:'🔒 Notes fermées ou accès réservé aux juges.',flags:E});
  const target=i.values[0],entry=await db.member(guild,target),subs=await db.submissions(id);
  if(target===i.user.id)return i.reply({content:'👑 Tu ne peux pas noter ton propre texte, mais tu peux noter toutes les autres candidates.',flags:E});
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
 if(i.isButton()&&/^rc:qrate:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]),row=await db.question(guild,id),member=await db.member(guild,i.user.id);
  if(!row||row.kind!=='questions'||row.status!=='published'||!row.answer)return i.reply({content:'Cette réponse n’est pas ouverte à la notation.',flags:E});
  const st=await db.stage(guild,row.stage_id);
  if(!st.questions_posted||!member|| (member.kind!=='judge' && !await db.isDualJudge(guild,i.user.id)))return i.reply({content:'Notes non ouvertes ou accès réservé au jury.',flags:E});
  if(row.candidate_id===i.user.id)return i.reply({content:'🕵️ Tu ne peux pas noter ta propre réponse.',flags:E});
  const modal=new ModalBuilder().setCustomId(`rc:qscore:${id}`).setTitle(`Note — réponse n°${id}`)
   .addComponents(textField('note','Note sur 10 (0 à 10)',TextInputStyle.Short,2),textField('avis','Avis facultatif (secret)',TextInputStyle.Paragraph,500,false));
  const previous=(await db.questionGrades(row.stage_id)).find(g=>Number(g.question_id)===id && g.judge_id===i.user.id);
  if(previous){modal.components[0].components[0].setValue(String(previous.grade));if(previous.comment)modal.components[1].components[0].setValue(previous.comment);}
  await i.showModal(modal);return true;
 }
 if(i.isModalSubmit()&&/^rc:qscore:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]),raw=i.fields.getTextInputValue('note').trim();
  if(!/^(10|[0-9])$/.test(raw))return i.reply({content:'La note doit être un nombre entier de 0 à 10.',flags:E});
  await db.gradeQuestion(guild,id,i.user.id,Number(raw),i.fields.getTextInputValue('avis').trim());
  return i.reply({content:`✅ Note **${raw}/10** enregistrée pour cette réponse. Tu peux la modifier tant que les notes sont ouvertes.`,flags:E});
 }
 if(i.isButton()&&/^rc:qask:\d+$/.test(i.customId)){
  const st=await db.stage(guild,Number(i.customId.split(':')[2]));
  if(!st||st.kind!=='questions'||st.status!=='collect'||!(await db.members(guild,'judge',true)).some(j=>j.user_id===i.user.id))return i.reply({content:'Questions fermées ou accès réservé au jury.',flags:E});
  const count=(await db.questions(st.id)).filter(q=>q.judge_id===i.user.id).length;
  if(count>=3)return i.reply({content:'Tu as déjà posé tes trois questions.',flags:E});
  const modal=new ModalBuilder().setCustomId(`rc:qnew:${st.id}`).setTitle('Question '+(count+1)+'/3').addComponents(
   textField('numero','Numéro de la candidate (1 à 15)',TextInputStyle.Short,2),
   textField('question','Ta question (800 caractères max)',TextInputStyle.Paragraph,800));
  await i.showModal(modal);return true;
 }
 if(i.isModalSubmit()&&/^rc:qnew:\d+$/.test(i.customId)){
  const stageId=Number(i.customId.split(':')[2]),raw=i.fields.getTextInputValue('numero').trim();
  if(!/^(?:[1-9]|1[0-5])$/.test(raw))return i.reply({content:'Numéro invalide (1 à 15).',flags:E});
  const candidate=(await db.members(guild,'candidate',true)).find(x=>x.number===Number(raw));
  if(!candidate)return i.reply({content:'Aucune candidate active ne porte ce numéro.',flags:E});
  const questionText=i.fields.getTextInputValue('question').trim();
  if(!questionText)return i.reply({content:'La question est vide.',flags:E});
  const row=await db.createQuestion(guild,stageId,i.user.id,candidate.user_id,questionText);
  const ok=await dm(candidate.user_id,`💌 **Question du jury — n°${candidate.number}**\n\n${questionText}\n\nRéponds avec le bouton ci-dessous. Ton pseudo restera caché dans le salon des juges.`,[questionReplyButton(row.id)]);
  return i.reply({content:`✅ Question ${ (await db.questions(stageId)).filter(x=>x.judge_id===i.user.id).length }/3 enregistrée pour la candidate n°${candidate.number}. ${ok?'Elle a reçu un MP.':'⚠️ Son MP est fermé : Tropi pourra la relancer.'}`,flags:E});
 }
 if(i.isButton()&&/^rc:qreply:\d+$/.test(i.customId)){
  const row=await db.question(guild,Number(i.customId.split(':')[2]));
  const stage= row && await db.stage(guild,row.stage_id);
  if(!row||!['collect','published'].includes(row.status)||stage?.questions_posted||row.candidate_id!==i.user.id)return i.reply({content:'Cette question est fermée ou ne t’est pas adressée.',flags:E});
  const modal=new ModalBuilder().setCustomId(`rc:qanswer:${row.id}`).setTitle('Ta réponse — candidate n°'+row.candidate_number).addComponents(
   textField('reponse','Ta réponse (1800 caractères max)',TextInputStyle.Paragraph,1800));
  if(row.answer)modal.components[0].components[0].setValue(row.answer.slice(0,1800));
  await i.showModal(modal);return true;
 }
 if(i.isModalSubmit()&&/^rc:qanswer:\d+$/.test(i.customId)){
  const id=Number(i.customId.split(':')[2]),answer=i.fields.getTextInputValue('reponse').trim();
  if(!answer)return i.reply({content:'Ta réponse est vide.',flags:E});
  await db.saveQuestionAnswer(guild,id,i.user.id,answer);
  const row=await db.question(guild,id);
  const header=`💌 **Réponse à ta question — candidate n°${row.candidate_number}**\n**Question :** ${row.question}`;
  const ok=(await dm(row.judge_id,header)) && (await dm(row.judge_id,`**Réponse :**\n${answer}`));
  return i.reply({content:`✅ Réponse enregistrée ! ${ok?'Le juge concerné vient de la recevoir en MP.':'La réponse est conservée ; le juge pourra la consulter lors de la publication.'}`,flags:E});
 }
 return false;
}
async function handleExtra(i){
 if(i.guildId!==guild)return i.reply({content:'Cette commande est réservée au serveur LDH.',flags:E});
 if(!await admin(i))return i.reply({content:'🔒 Esty et Tropi uniquement. Les juges utilisent leurs boutons en MP.',flags:E});
 const sub=i.options.getSubcommand();
 await i.deferReply({flags:E});
 if(sub==='infiltre-ajouter'){
  const u=i.options.getUser('membre');if(u.bot)return privateReply(i,'Un compte bot ne peut pas être infiltré.');
  await db.addInfiltrator(guild,u.id);await judgeRole(u.id,true);
  return privateReply(i,`🕵️ <@${u.id}> participe désormais **en candidate et au jury**. Il ne pourra ni se questionner ni se noter lui-même. Les autres membres ne sont pas avertis.`);
 }
 if(sub==='infiltre-retirer'){
  const u=i.options.getUser('membre'),ret=await db.removeInfiltrator(guild,u.id);
  if(ret)await judgeRole(u.id,false);
  return privateReply(i,ret?'✅ Double rôle retiré ; la candidature reste inscrite.':'Cette personne n’avait pas le double rôle.');
 }
  if(sub==='numeros-melanger'){
   if(i.options.getString('confirmation')!=='MELANGER')return privateReply(i,'❌ Opération annulée : écris exactement **MELANGER**.');
   const changelog=await db.melangerNumeros(guild);
   const n=changelog.length;
   return privateReply(i,`🔀 **NOUVEAU TIRAGE EFFECTUÉ** : ${n} candidates encore en jeu ont toutes reçu un numéro différent. Les éliminées, les questions, les notes et les archives restent intactes.
⚠️ Les anciens numéros ne sont plus valables pour la prochaine épreuve.
🔐 Liste confidentielle des NOUVEAUX numéros : \`/reine identites\`.
Prépare maintenant « Lui, mon roi » avec \`/coeur poeme-preparer\`.
Ne publie pas cette réponse privée au jury.`);
  }
  if(sub==='poeme-preparer'){
   const st=await db.createStage(guild,POEM_TITLE,POEM_PROMPT,'poem');
   return privateReply(i,`✅ **Épreuve « Lui, mon roi » prête** (brouillon #${st.id}).\nTitre obligatoire, 10 à 25 vers, texte de 3 900 caractères maximum.\nPour envoyer l'épreuve aux candidates : \`/reine epreuve-lancer\`. Aucun compte, texte, note ou résultat précédent n'a été supprimé.`);
  }
 if(sub==='presentation-preparer'){
  const stage=await db.createStage(guild,PRESENTATION_TITLE,PRESENTATION_PROMPT,'text');
  return privateReply(i,`✅ **Première épreuve préparée :** ${stage.title} (brouillon #${stage.id}).\nLance-la avec \`/reine epreuve-lancer\`. Aucun inscrit n’a été effacé.`);
 }
 if(sub==='classement-precedent'){
  const previous=await db.lastTextStage(guild);if(!previous)return privateReply(i,'Aucune épreuve précédente notée et clôturée.');
  return privateReply(i,`🏆 **Classement secret — ${previous.title}**\n${rankText(await db.ranking(guild,previous.id),true)}`);
 }
 if(sub==='questions-preparer'){
  const stage=await db.createStage(guild,'💌 Derrière les apparences — 3 questions par juge','Chaque juge dispose de trois questions au total, à adresser aux candidates de son choix. Les réponses sont privées, publiées sans pseudonyme, puis notées sur 10 par le jury.','questions');
  return privateReply(i,`✅ **Manche des questions préparée** (#${stage.id}). Démarre avec \`/coeur questions-lancer\`.`);
 }
 const st=await db.latest(guild);
 if(!st||st.kind!=='questions')return privateReply(i,'Prépare d’abord la manche des questions avec `/coeur questions-preparer`.');
 if(sub==='questions-lancer'){
  if(st.status!=='draft')return privateReply(i,'La phase des questions a déjà démarré.');
  await db.setStageStatus(guild,st.id,'draft','collect');
  const judges=await db.members(guild,'judge',true);let ok=0;
  for(const j of judges)if(await dm(j.user_id,`👑 **La Reine des Cœurs — 3 questions par juge**\nTu peux adresser jusqu’à **trois questions au total** aux candidates de ton choix, en indiquant leur numéro anonyme. Clique à nouveau sur le bouton pour chaque question. Impossible de te questionner toi-même si tu es infiltré.`,[askButton(st.id)]))ok++;
  return privateReply(i,`✅ Questions ouvertes. ${ok}/${judges.length} MP envoyés aux juges.`);
 }
 if(sub==='questions-rappels'){
  if(!['collect','published'].includes(st.status)||st.questions_posted)return privateReply(i,'La collecte des questions et des réponses est terminée.');
  const qs=await db.questions(st.id);let judges=0,candidates=0;
  if(st.status==='collect')for(const j of await db.members(guild,'judge',true)){
   const sent=qs.filter(q=>q.judge_id===j.user_id).length;
   if(sent<3&&await dm(j.user_id,`⏰ Il te reste ${3-sent} question(s) possibles à poser pour La Reine des Cœurs.`,[askButton(st.id)]))judges++;
  }
  for(const q of qs)if(q.answer===null&&await dm(q.candidate_id,`🔔 **Rappel : question du jury, candidate n°${q.candidate_number}**\n${q.question}`, [questionReplyButton(q.id)]))candidates++;
  return privateReply(i,`📨 ${judges} rappel(s) de juges et ${candidates} rappel(s) de réponses envoyés.`);
 }
 if(sub==='questions-fermer'){
  if(st.status!=='collect')return privateReply(i,'La collecte des questions n’est pas ouverte.');
  await db.setStageStatus(guild,st.id,'collect','published');
  return privateReply(i,'🔒 Les juges ne peuvent plus poser de nouvelles questions. Les candidates peuvent encore répondre ; utilise `/coeur questions-rappels`.');
 }
 if(sub==='questions-publier'){
  if(st.status!=='published')return privateReply(i,'Ferme d’abord les questions avec `/coeur questions-fermer`.');
  if(st.questions_posted)return privateReply(i,'Les réponses ont déjà été publiées ; la notation est ouverte.');
  const qs=await db.questions(st.id),missing=qs.filter(q=>q.answer===null);
  if(!qs.length)return privateReply(i,'Aucune question à publier.');
  const cfg=await db.settings(guild);if(!cfg.judge_channel)return privateReply(i,'Configure d’abord le salon des juges.');
  if(missing.length&&!i.options.getBoolean('forcer'))return privateReply(i,`⏳ ${missing.length} réponse(s) manquante(s). Utilise \`/coeur questions-rappels\` ou \`/coeur questions-publier forcer:true\`.`);
  await sendJudge(`💌 **LA REINE DES CŒURS — DERRIÈRE LES APPARENCES**\n${qs.length} question(s) posées, ${qs.length-missing.length} réponse(s). Chaque juge peut noter sur **10 chacune des réponses reçues**. Les moyennes par candidate seront calculées sans attribuer de zéro à celles qui n’ont reçu aucune question. Notes confidentielles avant clôture.`);
  const channelConfig=await db.settings(guild);
  const channel=await bot.channels.fetch(channelConfig.judge_channel);
  for(const q of qs){
   const header=`💌 **Candidate n°${q.candidate_number} — question ${q.id}**\n**Question :** ${q.question}`;
   await sendJudge(header);
   if(q.answer){
    for(const part of (q.answer.match(/[\s\S]{1,1700}/g)||[]))await sendJudge(`**Réponse :**\n${part}`);
    await channel.send({content:`⭐ **Noter la réponse n°${q.id} de la candidate n°${q.candidate_number}**`,components:[questionGradeButton(q.id)],allowedMentions:{parse:[]}});
   }else await sendJudge('*Sans réponse : aucune note possible pour cette question.*');
  }
  await db.markQuestionsPosted(guild,st.id);
  return privateReply(i,`✅ ${qs.length} question(s) publiées, ${qs.length-missing.length} réponse(s) ouvertes à la notation sur 10. Suivi : \`/reine suivi\`.`);
 }
 if(sub==='questions-notes-rappels'){
  if(st.status!=='published'||!st.questions_posted)return privateReply(i,'Les notes des questions ne sont pas ouvertes.');
  const qs=(await db.questions(st.id)).filter(q=>q.answer!==null),judges=await db.members(guild,'judge',true),grades=await db.questionGrades(st.id);
  const cfg=await db.settings(guild);let sent=0;
  for(const {judge,questions} of expectedQuestionGrades(judges,qs)){
   const done=grades.filter(g=>g.judge_id===judge.user_id).length,missing=questions.length-done;
   if(missing>0&&await dm(judge.user_id,`⏰ **La Reine des Cœurs** : il te reste **${missing} réponse(s)** à noter sur 10. Retrouve les boutons de notation dans <#${cfg.judge_channel}>.`))sent++;
  }
  return privateReply(i,`📨 ${sent} juge(s) relancé(s) pour terminer la notation des réponses.`);
 }
 if(sub==='questions-notes-fermer'){
  if(st.status!=='published'||!st.questions_posted)return privateReply(i,'Publie d’abord les réponses et ouvre les notes.');
  const qs=(await db.questions(st.id)).filter(q=>q.answer!==null),judges=await db.members(guild,'judge',true),grades=await db.questionGrades(st.id);
  const exp=expectedQuestionGrades(judges,qs);
  const missing=exp.reduce((n,{judge,questions})=>n+questions.filter(q=>!grades.some(g=>g.judge_id===judge.user_id&&Number(g.question_id)===Number(q.id))).length,0);
  if(!grades.length)return privateReply(i,'Aucune note reçue. Fais noter les réponses avant de clôturer.');
  if(missing&&!i.options.getBoolean('forcer'))return privateReply(i,`⏳ Il reste ${missing} note(s) manquante(s). Utilise \`/coeur questions-notes-fermer forcer:true\` si tu souhaites clôturer sans attendre.`);
  await db.setStageStatus(guild,st.id,'published','closed');
  return privateReply(i,`🔒 Notes de la manche des questions clôturées : ${grades.length} reçues, ${missing} manquante(s). Consulte \`/coeur questions-classement\`, puis choisis librement les éliminations avec \`/reine eliminer\`.`);
 }
 if(sub==='questions-classement'||sub==='questions-resultats-publier'){
  if(st.status!=='closed')return privateReply(i,'Clôture les notes avec `/coeur questions-notes-fermer`.');
  const rows=await db.questionRanking(guild,st.id),msg=`🏆 **${st.title} — Classement des réponses**\n${questionRankText(rows,sub==='questions-classement')}\n\n*Une candidate sans question ou sans note est « non évaluée », pas notée zéro. Les éliminations restent manuelles.*`;
  if(sub==='questions-classement')return privateReply(i,msg);
  await sendJudge(msg);return privateReply(i,'✅ Classement anonyme publié dans le salon des juges.');
 }
 if(sub==='questions-secrets'){
  const qs=await db.questions(st.id),ratings=await db.questionGrades(st.id);await privateReply(i,`🔐 **Archives secrètes — ${st.title}** (${qs.length} questions)\nAuteurs, candidates, réponses et notes individuelles :`);
  for(const q of qs){
   const rated=ratings.filter(g=>Number(g.question_id)===Number(q.id));
   const msg=`**Question ${q.id}** de <@${q.judge_id}> à <@${q.candidate_id}> (n°${q.candidate_number})\n**Q :** ${q.question}\n**R :** ${q.answer||'En attente'}\n**Notes :** ${rated.map(g=>`<@${g.judge_id}> ${g.grade}/10${g.comment?` (« ${g.comment} »)`:''}`).join(', ')||'Aucune'}`;
   for(const part of (msg.match(/[\s\S]{1,1850}/g)||[]))await i.followUp({content:part,flags:E});
  }
  return true;
 }
 return privateReply(i,'Commande inconnue.');
}
async function init(client,guildId,ownerId){bot=client;guild=guildId;owner=ownerId;await db.init();await db.settings(guild);}
module.exports={command,extraCommand,init,handle};
