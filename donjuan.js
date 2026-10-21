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
const MAX_PRETENDANTS=15; // Jusqu’à 15 candidats ; au-delà de 10 choix, vote par menu Discord.
// Discord accepte jusqu'à cinq menus de 25 choix par message.
// Chaque juge peut poser TROIS questions, indépendamment des réponses reçues.
const MAX_QUESTIONS_PAR_JUGE=3;
const MAX_REPONSES_PAR_ROUND=125;
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
 .addSubcommand(s=>s.setName('presentations-statut').setDescription('Voir qui a rendu sa présentation et qui est encore en attente (privé)'))
 .addSubcommand(s=>s.setName('suivi').setDescription('Tableau de bord privé : présentations, juges, questions et votes (Esty)'))
 .addSubcommand(s=>s.setName('identites').setDescription('Voir en privé les pseudos derrière les numéros (Esty seule)'))
 .addSubcommand(s=>s.setName('presentations').setDescription('Envoyer le formulaire de présentation en MP'))
 .addSubcommand(s=>s.setName('presentations-publier').setDescription('Publier anonymement les présentations et ouvrir le vote'))
 .addSubcommand(s=>s.setName('questions').setDescription('Ouvrir le round OU relancer les juges sans le fermer'))
 .addSubcommand(s=>s.setName('questions-fermer').setDescription('Fermer les nouvelles questions (réponses encore acceptées)'))
 .addSubcommand(s=>s.setName('reponses-publier').setDescription('Publier les réponses reçues et ouvrir le vote'))
 .addSubcommand(s=>s.setName('vote-fermer').setDescription('Clôturer le vote, compter les voix et attribuer les points'))
 .addSubcommand(s=>s.setName('eliminer').setDescription('Éliminer le dernier du classement').addIntegerOption(o=>o.setName('numero').setDescription('En cas d’égalité, départager parmi les derniers').setMinValue(1)))
 .addSubcommand(s=>s.setName('finale').setDescription('Couronner le dernier prétendant actif'))
 .addSubcommand(s=>s.setName('rappels').setDescription('Renvoyer les formulaires en MP aux participants en attente'))
 .addSubcommand(s=>s.setName('statut').setDescription('Voir phase, participants et scores (privé)'))
 .addSubcommand(s=>s.setName('reinitialiser').setDescription('Effacer les données Don Juan pour un nouveau test').addStringOption(o=>o.setName('confirmation').setDescription('Écrire exactement EFFACER').setRequired(true)))
 .addSubcommandGroup(g=>g.setName('epreuves').setDescription('👑 Sélection, défis et finale — classement indépendant')
  .addSubcommand(x=>x.setName('selection').setDescription('Préparer ou confirmer l’élimination de 3 candidats (10→7)').addStringOption(o=>o.setName('numeros').setDescription('Seulement pour départager une égalité : 2,5,8')).addStringOption(o=>o.setName('confirmation').setDescription('Écrire ELIMINER pour confirmer')))
  .addSubcommand(x=>x.setName('valider-selection').setDescription('Reconnaître 7 qualifiés après éliminations déjà faites, SANS éliminer').addStringOption(o=>o.setName('confirmation').setDescription('Écrire VALIDER après la prévisualisation')))
  .addSubcommand(x=>x.setName('lancer').setDescription('Lancer le prochain défi commun et envoyer les MP'))
  .addSubcommand(x=>x.setName('suivi').setDescription('Réponses et notes reçues (privé)'))
  .addSubcommand(x=>x.setName('rappels').setDescription('Relancer les candidats sans texte, ou rappeler les juges'))
  .addSubcommand(x=>x.setName('publier').setDescription('Publier les textes et ouvrir les notes /10').addBooleanOption(o=>o.setName('forcer').setDescription('Autoriser la publication avec des réponses manquantes')))
  .addSubcommand(x=>x.setName('fermer').setDescription('Clôturer les notes et calculer le classement de CE défi').addBooleanOption(o=>o.setName('forcer').setDescription('Finale uniquement : accepter les bulletins complets si certaines juges manquent')))
  .addSubcommand(x=>x.setName('classement').setDescription('Classement indépendant de cette épreuve (privé)'))
  .addSubcommand(x=>x.setName('eliminer').setDescription('Éliminer selon ce défi (7→4, 4→2, 2→1)').addStringOption(o=>o.setName('numeros').setDescription('En cas d’égalité : 2,5,8')).addStringOption(o=>o.setName('confirmation').setDescription('Écrire ELIMINER pour confirmer'))));
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
  if(!current){if(kind==='candidate'&&(await store.entries(guild,'candidate')).length>=MAX_PRETENDANTS)return; // Jusqu’à quinze prétendants
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
  // Pour 11 à 15 choix, le scrutin est uniquement via menu déroulant.
  if(choices.length>VOTE_EMOJI.length||idx<0||idx>=choices.length)return;
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
  if(total>=MAX_PRETENDANTS || last_number>=MAX_PRETENDANTS){
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
async function sendQuestionForms(round){
 let count=0;
 const submitted=await store.questions(guild,round);
 const used=new Map();for(const q of submitted)used.set(q.judge_id,(used.get(q.judge_id)||0)+1);
 for(const j of await store.entries(guild,'judge')){
  const n=used.get(j.user_id)||0;
  if(n>=MAX_QUESTIONS_PAR_JUGE)continue;
  if(await dmUser(j.user_id,`👑 **Don Juan — Round ${round}**\nTu peux poser **jusqu'à 3 questions** pendant ce même round (déjà envoyées : **${n}/3**). Choisis un candidat actif à chaque fois.\n\nRéutilise ce bouton pour chaque nouvelle question, jusqu'à 3 au total. Les réponses arriveront plus tard dans le salon des juges.`,[rowButton(`dj:ask:${round}`,'Poser une question')]))count++;
 }
 return count;
}
async function sendMissingAnswers(round){let count=0;for(const qu of await store.questions(guild,round))if(!qu.answer){if(await dmUser(qu.candidate_id,`📩 Question pour **Candidat #${qu.number}** :\n${qu.question}\n\nTa réponse sera publiée anonymement aux juges.`,[rowButton(`dj:answer:${qu.id}`,'Répondre')]))count++;}return count;}
async function openVote(s,kind,options,title){
 if(options.length<1||options.length>MAX_REPONSES_PAR_ROUND)throw Error('Entre 1 et 125 choix sont acceptés pour ce vote.');
 const rows=[];
 // 1 menu = 25 choix ; Discord permet 5 lignes de composants maximum.
 for(let start=0;start<options.length;start+=25){
  const slice=options.slice(start,start+25),page=1+Math.floor(start/25);
  const menu=new StringSelectMenuBuilder()
   .setCustomId(`dj:vote:${kind}:${s.round_no}:${page}`)
   .setPlaceholder(`Réponses ${start+1} à ${start+slice.length} — choisir 1`)
   .addOptions(slice);
  rows.push(new ActionRowBuilder().addComponents(menu));
 }
 const reactionsEnabled=options.length<=VOTE_EMOJI.length;
 const lines=options.length<=20
  ? options.map((o,j)=>reactionsEnabled?`${VOTE_EMOJI[j]} ${o.label}`:`${j+1}. ${o.label}`)
  : [];
 const consigne=reactionsEnabled
  ? '🗳️ Vote par réaction numérotée ou menu déroulant.'
  : `🗳️ **Vote uniquement par menu.** ${rows.length>1?'Parcours les '+rows.length+' menus si nécessaire.':''} Les réactions ne sont pas comptées.`;
 const txt=title+'\n\n'+(lines.length?lines.join('\n')+'\n\n':`${options.length} réponses au choix dans les menus ci-dessous.\n\n`)
  +'🔒 Seules les juges inscrites votent. **Un seul vote par juge**, modifiable avant clôture.\n'+consigne;
 if(txt.length>2000)throw Error('Message de vote trop long.');
 const msg=await judgePost(s,txt,rows);
 await store.updateSession(guild,{vote_message:msg.id,vote_channel:msg.channelId,vote_kind:kind,vote_choices:JSON.stringify(options.map(o=>o.value))});
 if(reactionsEnabled){for(let j=0;j<options.length;j++)await msg.react(VOTE_EMOJI[j]).catch(e=>console.warn('Ajout réaction impossible',e.message));}
}

function anonScores(players){return players.slice().sort((a,b)=>b.score-a.score||a.number-b.number).map(p=>`#${p.number} — ${p.score} point(s)${p.active?'':' · éliminé'}`).join('\n');}
async function showParticipants(i){
 const c=await store.entries(guild,'candidate'),j=await store.entries(guild,'judge');
 const str=(a)=>a.map(x=>`<@${x.user_id}>${x.number?` (#${x.number})`:''}`).join('\n')||'Aucun';
 return privateReply(i,`🔒 **Prétendants (${c.length})**\n${str(c)}\n\n**Juges (${j.length})**\n${str(j)}`.slice(0,1900));
}
// Envoie un tableau de bord en plusieurs messages privés si besoin (limite Discord 2 000 caractères).
async function privateSections(i,sections){
 const blocks=[];
 for(const section of sections){
  const lines=section.split('\n');let part='';
  for(const line of lines){
   if((part+'\n'+line).length>1800){
    if(part)blocks.push(part);
    part='';
   }
   if(line.length>1800){
    // N'arrive pas avec nos libellés courts, mais protège l'API Discord.
    if(part){blocks.push(part);part='';}
    for(let start=0;start<line.length;start+=1800)blocks.push(line.slice(start,start+1800));
   }else part+=(part?'\n':'')+line;
  }
  if(part)blocks.push(part);
 }
 await i.deferReply({flags:FLAG});
 for(let k=0;k<blocks.length;k++){
  if(k===0)await i.editReply({content:blocks[k],allowedMentions:{parse:[]}});
  else await i.followUp({content:blocks[k],flags:FLAG,allowedMentions:{parse:[]}});
 }
}
const memberLabel = p => `${p.number?'#'+p.number+' — ':''}<@${p.user_id}>`;
const present = p => typeof p.presentation==='string'&&p.presentation.trim().length>0;
async function showIdentities(i){
 const players=await store.entries(guild,'candidate');
 const text=['🔐 **DON JUAN — IDENTITÉS RÉELLES**','🔒 Visible uniquement par Esty. Ne pas montrer au jury ni aux prétendants.','',
  ...players.map(p=>`${p.number?'#'+p.number:'Sans numéro'} → <@${p.user_id}>${p.active?'':' · éliminé'}`)];
 if(!players.length)text.push('_Aucun prétendant inscrit_');
 return privateSections(i,[text.join('\n')]);
}
async function showProgress(i,s){
 const [candidates,judges] = await Promise.all([store.entries(guild,'candidate'),store.entries(guild,'judge')]);
 const phaseText={draft:'En préparation',registrations:'Inscriptions',presentations:'Présentations en cours',presentation_vote:'Vote des présentations',between:'Entre deux manches',questions:'Envoi des questions',answers:'Réponses en cours',round_vote:'Vote du round',ended:'Finale terminée',challenges:'Épreuves finales'}[s.phase]||s.phase;
 const ready=candidates.filter(present);
 const sections=[`👑 **DON JUAN — TABLEAU DE BORD D'ESTY**\n📍 ${phaseText} · Manche ${s.round_no} · **${candidates.length}/15** prétendants · **${judges.length}** juges\n🔒 Réservé à Esty (les identités sont aussi visibles ici).`,
   `💌 **PRÉSENTATIONS — ${ready.length}/${candidates.length} reçues**\n${candidates.map(p=>`${present(p)?'✅':'⏳'} ${memberLabel(p)}${p.active?'':' · éliminé'}`).join('\n')||'_Aucun candidat_'}\n${s.phase==='presentations'?'💡 /donjuan rappels relance les candidats en attente.':''}`];
 // Les juges ne rédigent pas de présentation ; on suit à la place leur vote.
 const votePresLaunched=['presentation_vote','between','questions','answers','round_vote','ended'].includes(s.phase);
 const pBallots=votePresLaunched?(await store.q("SELECT judge_id FROM dj_votes WHERE guild_id=$1 AND round_no=0 AND kind='presentation'",[guild])).rows:[];
 const pVoters=new Set(pBallots.map(x=>x.judge_id));
 const pVoteOpen=s.phase==='presentation_vote';
 const preVoteLines=judges.map(j=>`${!votePresLaunched?'➖':pVoters.has(j.user_id)?'✅':pVoteOpen?'⏳':'❌'} <@${j.user_id}>${!votePresLaunched?' · vote non ouvert':pVoters.has(j.user_id)?' · a voté':pVoteOpen?' · en attente de vote':' · n’a pas voté'}`);
 sections.push(`👑 **JUGES — VOTE DES PRÉSENTATIONS**\n${votePresLaunched?`🗳️ ${pVoters.size}/${judges.length} votes enregistrés${pVoteOpen?' · vote ouvert':' · vote clos'}`:'🕒 Vote non ouvert'}\n${preVoteLines.join('\n')||'_Aucune juge inscrite_'}`);
 if(s.round_no>0){
  const qs=await store.questions(guild,s.round_no);
  const byJudge=new Map();
  for(const q of qs){if(!byJudge.has(q.judge_id))byJudge.set(q.judge_id,[]);byJudge.get(q.judge_id).push(q);}
  const questionsOpen=s.phase==='questions';
  const questionsLaunched=['questions','answers','round_vote','between','ended'].includes(s.phase);
  const sent=judges.filter(j=>byJudge.has(j.user_id)).length;
  sections.push(`❓ **JUGES — QUESTIONS DE LA MANCHE ${s.round_no}**\n✉️ ${qs.length} question(s) envoyée(s) par ${sent}/${judges.length} juges${questionsOpen?' · envoi ouvert':questionsLaunched?' · envoi fermé':''}\n${judges.map(j=>{const items=byJudge.get(j.user_id)||[];return `${items.length===MAX_QUESTIONS_PAR_JUGE?'✅':questionsOpen?'⏳':items.length?'✅':'❌'} <@${j.user_id}> · **${items.length}/3 questions**${items.length?` → ${items.map(q=>`#${q.number} (Q${q.id})`).join(', ')}`:''}`;}).join('\n')||'_Aucune juge inscrite_'}`);
  const byCandidate=new Map();
  for(const q of qs){const a=byCandidate.get(q.candidate_id)||{total:0,answered:0};a.total++;if(q.answer)a.answered++;byCandidate.set(q.candidate_id,a);}
  const answered=qs.filter(q=>Boolean(q.answer)).length;
  sections.push(`💬 **PRÉTENDANTS — RÉPONSES DE LA MANCHE ${s.round_no}**\n📨 ${answered}/${qs.length} réponses reçues pour les questions envoyées\n${candidates.map(p=>{const n=byCandidate.get(p.user_id);return `${!n?'➖':n.answered===n.total?'✅':'⏳'} ${memberLabel(p)}${!n?' · aucune question reçue':` · ${n.answered}/${n.total} réponse(s)`}${p.active?'':' · éliminé'}`;}).join('\n')||'_Aucun candidat_'}\n${qs.length?'\n**Détail par question :**\n'+qs.map(q=>`${q.answer?'✅':'⏳'} Question #${q.id} · <@${q.judge_id}> → #${q.number} <@${q.candidate_id}>`).join('\n'):'\n_Aucune question envoyée pour cette manche_'}`);
  const rVoteLaunched=['round_vote','between','ended'].includes(s.phase);
  const rBallots=rVoteLaunched?(await store.q("SELECT judge_id FROM dj_votes WHERE guild_id=$1 AND round_no=$2 AND kind='question'",[guild,s.round_no])).rows:[];
  const rVoters=new Set(rBallots.map(x=>x.judge_id));
  sections.push(`🗳️ **JUGES — VOTE DE LA MANCHE ${s.round_no}**\n${rVoteLaunched?`${rVoters.size}/${judges.length} votes enregistrés · ${s.phase==='round_vote'?'vote ouvert':'vote clos'}`:'🕒 Vote non ouvert'}\n${judges.map(j=>`${!rVoteLaunched?'➖':rVoters.has(j.user_id)?'✅':s.phase==='round_vote'?'⏳':'❌'} <@${j.user_id}>${!rVoteLaunched?' · vote non ouvert':rVoters.has(j.user_id)?' · a voté':s.phase==='round_vote'?' · vote attendu':' · n’a pas voté'}`).join('\n')||'_Aucune juge inscrite_'}`);
 }else sections.push('❓ **QUESTIONS ET RÉPONSES**\n🕒 Aucun round de questions lancé.');
 sections.push(`🏆 **${s.phase==='challenges'?'ANCIENS SCORES (ARCHIVES, NON UTILISÉS POUR LES DÉFIS)':'SCORES ACTUELS'}**\n${anonScores(candidates)||'_Pas de scores_'}\n\n💡 Identités derrière les numéros : /donjuan identites.`);
 if(s.phase==='challenges'){
  const last=await store.latestStage(guild);
  if(last?.stage_no>=1){const stats=last.stage_no===3?await store.finaleStats(guild):await store.stageStats(guild,last.stage_no);
   sections.push(stageReportText(last.stage_no,stats));
   if(['closed','eliminated'].includes(last.state))sections.push(stageRanking(last.stage_no,stats));
  }
 }
 return privateSections(i,sections);
}

// ================= PHASE FINALE — TROIS DÉFIS DISTINCTS =================
const STAGES={
 1:{name:'🌹 Le défi du poète — Ma reine',start:7,out:3,max:3900,
   prompt:'🌹 LE DÉFI DU POÈTE — « Elle, ma reine »\nImagine une femme que tu désires profondément, qui te fascine et te trouble. Écris un poème original pour la placer sur un piédestal : fais d’elle ta muse, ta reine. Célèbre sa beauté, mais aussi son esprit, sa force et sa liberté, sans la réduire à son physique.\n\nRÈGLES : un titre obligatoire ; entre 10 et 25 vers (un vers = une ligne de texte non vide) ; style sensuel, élégant et romantique, sans vulgarité ni description sexuelle explicite. Ne révèle pas son identité.\n\nOBJECTIF : qu’en lisant ton poème, chaque juge rêve d’être cette femme. Fais-nous ressentir pourquoi elle est exceptionnelle à tes yeux.'},
 2:{name:'🌹 Le rendez-vous à 30 €',start:4,out:2,max:1200,
   prompt:'Imagine un rendez-vous romantique mémorable pour deux personnes, avec un budget TOTAL de 30 € maximum. Précise le lieu, le déroulement, les petites attentions et le prix de chaque dépense. Une proposition qui dépasse 30 € sera moins bien notée.'},
 3:{name:'👑 Finale — Les trois épreuves du Don Juan',start:2,out:1,max:1800,
   prompt:'GRANDE FINALE : 1. L’art du premier pas (aborder une lectrice dans un parc) ; 2. Entre amour et fierté (gérer un désaccord dans son couple) ; 3. Pourquoi moi, et pas lui ? (convaincre le jury de voter pour soi). Chaque acte possède son formulaire distinct (1 800 caractères maximum), et les juges donnent une note sur 10 par finaliste et par acte.'}
};
const stageLabel=n=>STAGES[n]?.name||'Sélection historique';
const stageButton=n=>rowButton(`dj:stage:write:${n}`,'Répondre à cette épreuve');
const ratingButton=n=>rowButton(`dj:stage:rate:${n}`,'Noter un candidat /10');
const FINALE_ACTS=[
 {name:'🌹 ACTE 1 — L’ART DU PREMIER PAS',short:'Premier pas',prompt:`Tu te promènes tranquillement dans un parc lorsqu’une jeune femme attire ton regard. Elle est assise seule sur un banc, plongée dans la lecture d’un livre. Tu la trouves charmante et tu aimerais faire sa connaissance. Mais elle ne t’a pas remarqué : tu ignores son prénom, si elle est célibataire, et surtout si elle souhaite être dérangée.

TA MISSION : raconte comment tu l’aborderais pour la toute première fois. Quels seraient tes premiers mots ? Comment engagerais-tu une conversation naturelle, avec humour ou originalité, et lui donnerais-tu envie de te revoir ? Fais vivre une scène crédible, avec quelques répliques et ses réactions possibles.

RÈGLES : pas de phrase de drague toute faite, pas de compliment lourd ni d’insistance. Si elle ne souhaite pas discuter, tu respectes son choix. Les juges évalueront le naturel, le charme, le respect, l’humour et l’originalité.`},
 {name:'💔 ACTE 2 — ENTRE AMOUR ET FIERTÉ',short:'Amour et fierté',prompt:`Une dispute importante éclate avec ta compagne. Vous êtes tous les deux persuadés d’avoir raison sur un sujet qui compte pour vous et aucun ne veut céder. Le désaccord est profond, la tension monte, mais vous tenez à votre couple.

TA MISSION : imagine l’objet de ce désaccord et raconte concrètement comment tu gères la situation. Comment désamorces-tu l’embrouille ? Comment écoutes-tu et comprends-tu la position de ta femme, même si tu ne la partages pas ? Comment lui fais-tu entendre la tienne ? Quelle solution proposes-tu pour avancer ensemble sans renier tes convictions ni lui imposer les tiennes ?

RÈGLES : pas de réconciliation magique, ni de simples « je t’aime » pour éviter le problème. Montre des paroles, des actes et un compromis crédibles. Les juges évalueront la maturité, l’écoute, la communication, le respect et la capacité à protéger le couple.`},
 {name:'👑 ACTE 3 — POURQUOI MOI, ET PAS LUI ?',short:'Discours final',prompt:`Tu es arrivé jusqu’à la grande finale du Don Juan des Drôles d’Humains. Face à toi, un autre prétendant au titre. Les juges ont vu tes prestations, mais il reste une dernière occasion de faire pencher leurs votes : ton discours de campagne !

TA MISSION : écris un texte pour convaincre les juges que TU mérites le titre de meilleur Don Juan du serveur. Pourquoi toi plutôt que ton adversaire ? Quelles sont tes qualités de séducteur, ton charme, tes atouts secrets ? Fais preuve de culot, de créativité et d’une bonne dose de second degré pour leur donner envie de voter pour toi.

RÈGLES : humour, arrogance pour rire, charme, provocations gentilles et mauvaise foi assumée autorisés ! Pas d’attaque personnelle contre l’autre finaliste. Termine par une phrase ou un slogan mémorable. Les juges évalueront le charisme, l’humour, l’originalité et le pouvoir de persuasion.`}
];
const finaleWriteButton=act=>rowButton(`dj:finale:write:${act}`,'Répondre à l’acte '+act);
const finaleRateButton=act=>rowButton(`dj:finale:rate:${act}`,'Noter l’acte '+act+' /10');
function finaleReportText(stats){
 const answerSet=new Set(stats.answers.map(a=>`${a.candidate_id}:${a.act_no}`));
 return [
 '👑 **GRANDE FINALE — CONFIDENTIEL ESTY**',
 `💌 Réponses : ${stats.answers.length}/6`,
 ...stats.candidates.map(p=>`Finaliste ${p.finale_number} : <@${p.user_id}> (ancien numéro #${p.number}) — ${[1,2,3].map(act=>answerSet.has(`${p.user_id}:${act}`)?'✅':'⏳').join(' ')}`),
 `🗳️ Notations (total requis : ${stats.required.size} par juge) :`,
 ...stats.judges.map(j=>`${stats.graded.get(j.user_id)?.size===stats.required.size&&stats.required.size?'✅':'⏳'} <@${j.user_id}> : ${stats.graded.get(j.user_id)?.size||0}/${stats.required.size}`),
 `✅ Bulletins complets : ${stats.validJudges.length}/${stats.judges.length}`
 ].join('\n');
}
function finaleRanking(stats){
 return ['👑 **VERDICT PRIVÉ DE LA FINALE — NE PAS PUBLIER AVANT LE COURONNEMENT**',
 `✅ Bulletins complets : ${stats.validJudges.length}/${stats.judges.length}`,
 ...stats.scores.slice().sort((a,b)=>b.points-a.points||a.finale_number-b.finale_number).map(p=>`Finaliste ${p.finale_number} : **${p.mean.toFixed(2)}/30** — premier pas ${p.perAct[0].toFixed(2)}/10, amour et fierté ${p.perAct[1].toFixed(2)}/10, discours final ${p.perAct[2].toFixed(2)}/10`)].join('\n');
}
async function sendFinaleForms(){
 const st=await store.stage(guild,3);if(st?.state!=='collect')return 0;
 const [players,answers]=await Promise.all([store.finaleCandidates(guild),store.finaleAnswers(guild)]);
 const complete=new Set(answers.map(x=>`${x.candidate_id}:${x.act_no}`));let sent=0;
 for(const p of players)for(let act=1;act<=3;act++){
  if(complete.has(`${p.user_id}:${act}`))continue;
  const a=FINALE_ACTS[act-1];
  const msg=`👑 **DON JUAN — FINALE : Finaliste ${p.finale_number}**\n**${a.name}**\n\n${a.prompt}\n\n💌 Réponds avec le bouton ci-dessous (1 800 caractères maximum). Tes 3 réponses sont indépendantes, modifiables avant publication. Aucun ancien numéro ne sera montré aux juges.`;
  if(await dmUser(p.user_id,msg,[finaleWriteButton(act)]))sent++;
 }
 return sent;
}

// Chaque ligne non vide est un vers. Les retours à la ligne vides séparent des strophes.
function countPoemVerses(poem){return poem.split(/\r?\n/).filter(line=>line.trim().length>0).length;}
function splitDiscordText(text,max=1750){
 const parts=[];let current='';
 for(const line of text.split('\n')){
  if(line.length>max){
   if(current){parts.push(current);current='';}
   for(let k=0;k<line.length;k+=max)parts.push(line.slice(k,k+max));
   continue;
  }
  const next=current?current+'\n'+line:line;
  if(next.length>max){if(current)parts.push(current);current=line;}
  else current=next;
 }
 if(current)parts.push(current);
 return parts.length?parts:[''];
}
function stageReportText(n,stats){
 if(n===3)return finaleReportText(stats);
 const counts=new Map();for(const r of stats.ratings){if(!counts.has(r.judge_id))counts.set(r.judge_id,new Set());counts.get(r.judge_id).add(r.candidate_id);}
 const ans=stats.answers.length;
 return [`👑 **ÉPREUVE ${n} — ${stageLabel(n)}**`,
   `💌 Réponses : ${ans}/${stats.candidates.length}`,
   ...stats.candidates.map(p=>`${stats.submitted.has(p.user_id)?'✅':'⏳'} Candidat #${p.number} <@${p.user_id}>${p.active?'':' (éliminé)'}`),
   '',`🗳️ Juges — notes attribuées par personne, sur ${ans} candidat(s) ayant répondu :`,
   ...stats.judges.map(j=>`${counts.get(j.user_id)?.size===ans&&ans?'✅':'⏳'} <@${j.user_id}> : ${counts.get(j.user_id)?.size||0}/${ans}`),
   '',`✅ Bulletins entièrement remplis : ${stats.validJudges.length}/${stats.judges.length}`].join('\n');
}
function stageRanking(n,stats){
 if(n===3)return finaleRanking(stats);
 return [`🏆 **CLASSEMENT ÉPREUVE ${n} — ${stageLabel(n)}**`,
  'Ce classement utilise **uniquement** les notes de cette épreuve ; les anciens points ne comptent pas.',
  `✅ ${stats.validJudges.length} juge(s) avec un bulletin complet (bulletins incomplets non comptés)`,
  ...stats.scores.slice().sort((a,b)=>b.points-a.points||a.number-b.number).map(p=>`Candidat #${p.number} — **${p.mean.toFixed(2)}/10** ${p.has_answer?'':'(aucune réponse : 0)'}`)].join('\n');
}
async function sendStageForms(n){
 if(n===3)return sendFinaleForms();
 const stage=await store.stage(guild,n);if(!stage||stage.state!=='collect')return 0;
 const participants=await store.stageCandidates(guild,n),answers=await store.stageAnswers(guild,n);
 const replied=new Set(answers.map(a=>a.candidate_id));let count=0;
 for(const p of participants)if(!replied.has(p.user_id)){
  const info=`👑 **Don Juan — Épreuve ${n} : ${stageLabel(n)}**\n\n${STAGES[n].prompt}\n\nClique sur le bouton et réponds en privé. Les juges ne verront que ton numéro #${p.number}, pas ton pseudo. ${n===1?'Poème : 10 à 25 vers, titre séparé, jusqu’à 3 900 caractères.':`${STAGES[n].max} caractères maximum.`}`;
  if(await dmUser(p.user_id,info,[stageButton(n)]))count++;
 }
 return count;
}
async function stageCurrent(){return store.latestStage(guild);}
async function handleStageCommand(i){
 // Même si une personne reste accidentellement dans la table des admins, SEULE Esty pilote les éliminations.
 if(i.user.id!==owner)return privateReply(i,'🔒 Seule Esty pilote les épreuves finales. Les juges notent par les boutons du salon privé.');
 const sub=i.options.getSubcommand(),sess=await store.session(guild);
 if(sub==='valider-selection'){
  const confirmed=i.options.getString('confirmation')==='VALIDER';
  const r=await store.adoptSelection(guild,confirmed);
  if(r.already)return privateReply(i,'✅ La sélection est déjà enregistrée. Aucun candidat modifié. Tu peux lancer `/donjuan epreuves lancer` si le défi du poète n’a pas encore commencé.');
  const status=`👑 **${r.active} candidats toujours qualifiés** ; ${r.eliminated} éliminé(s) déjà enregistrés.\nQualifiés : ${r.numbers.map(n=>'#'+n).join(', ')}.`;
  if(!confirmed)return privateReply(i,`🔒 **VÉRIFICATION SANS CHANGEMENT**\n${status}\n\nPour reconnaître cette sélection sans éliminer personne, utilise \`/donjuan epreuves valider-selection confirmation:VALIDER\`.`);
  return privateReply(i,`✅ **Sélection déjà effectuée : validée !**\n${status}\nAucune inscription, présentation, réponse ni ancien score n’a été modifié. Lance maintenant \`/donjuan epreuves lancer\` pour envoyer le défi du poète aux 7 qualifiés.`);
 }
 if(sub==='selection'){
  if(sess.phase!=='between')return privateReply(i,'⛔ Termine d’abord le vote actuel avec /donjuan vote-fermer. Rien n’a été modifié.');
  const choice=store.parseNumbers(i.options.getString('numeros'));
  const confirmed=i.options.getString('confirmation')==='ELIMINER';
  try{
   const r=await store.selection(guild,choice,confirmed);
   const selected=r.chosen.map(x=>`#${x.number} (${x.points} points historiques)`).join(', ');
   if(!confirmed)return privateReply(i,`🔒 **PRÉVISUALISATION 10 → 7**\nTrois prétendants concernés : ${selected}.\n⚠️ Aucune élimination effectuée. Pour confirmer, relance /donjuan epreuves selection avec confirmation:ELIMINER.`);
   let announcement='✅ Annonce publiée.';
   try{await publicPost(`💔 **DON JUAN — PREMIÈRE SÉLECTION**\n${r.chosen.map(p=>`Candidat #${p.number} : <@${p.user_id}>`).join('\n')}\nIls quittent l’aventure. **7 candidats** continuent ! 👑`);}
   catch(e){announcement='⚠️ Les trois éliminations sont BIEN ENREGISTRÉES, mais l’annonce publique a échoué : publie-la manuellement. Ne relance pas la sélection.';}
   return privateReply(i,`✅ Trois éliminations enregistrées en une seule opération. Les scores historiques sont conservés. ${announcement} Lance /donjuan epreuves lancer.`);
  }catch(e){if(e.code==='DJ_CUTOFF_TIE')return privateReply(i,`⚖️ **Égalité à la limite de qualification** : ${e.message}\nPrévois un départage transparent puis indique les TROIS numéros avec l’option `+'`numeros`'+'. Aucun joueur éliminé.');throw e;}
 }
 const latest=await stageCurrent();
 if(sub==='lancer'){
  const n=(latest?.stage_no||0)+1;
  if(n>3)return privateReply(i,'Les trois nouvelles épreuves sont terminées. Il est temps de couronner le gagnant !');
  if(latest?.state!=='eliminated')return privateReply(i,'Termine la dernière épreuve et ses éliminations avant de lancer la suivante.');
  const setting=STAGES[n];
  // La connexion Neon peut être lente : acquitter la commande avant la transaction.
  await i.deferReply({flags:FLAG});
  await store.startStage(guild,n,setting.prompt,setting.start);
  const sent=await sendStageForms(n);
  return privateReply(i,`✅ **${stageLabel(n)}** ouverte avec ${setting.start} candidats. ${sent} MP envoyés.\nConsigne identique à tous :\n${setting.prompt}\n\nConsulte /donjuan epreuves suivi pour voir les retardataires.`);
 }
 if(!latest||latest.stage_no<1)return privateReply(i,'Commence par la sélection 10 → 7 avec `/donjuan epreuves selection`.');
 const n=latest.stage_no;
 if(sub==='suivi'){
  const st=n===3?await store.finaleStats(guild):await store.stageStats(guild,n);
  return privateSections(i,[`🔐 État de l’épreuve : **${latest.state}**`,stageReportText(n,st)]);
 }
 if(sub==='rappels'){
  if(n===3){
   if(latest.state==='collect'){
    await i.deferReply({flags:FLAG});const sent=await sendFinaleForms();
    return privateReply(i,`💌 ${sent} message(s) envoyés pour les actes encore sans réponse. Les réponses existantes sont conservées.`);
   }
   if(latest.state==='published'){
    const stats=await store.finaleStats(guild),unfinished=stats.judges.filter(j=>(stats.graded.get(j.user_id)?.size||0)<stats.required.size);
    await i.deferReply({flags:FLAG});let sent=0;
    for(const j of unfinished)if(await dmUser(j.user_id,`👑 **Finale Don Juan — notes manquantes**\nTu as rempli ${stats.graded.get(j.user_id)?.size||0}/${stats.required.size} notes. Chaque acte de chaque finaliste doit être noté.`,FINALE_ACTS.map((_,ix)=>finaleRateButton(ix+1))))sent++;
    return privateReply(i,`✅ ${sent} MP envoyés à ${unfinished.length} juge(s) ayant des notes manquantes.`);
   }
   return privateReply(i,'La finale est déjà clôturée.');
  }
  if(latest.state==='collect'){
   await i.deferReply({flags:FLAG});const sent=await sendStageForms(n);
   return privateReply(i,`💌 ${sent} MP de rappel envoyés aux candidats sans réponse. Aucun texte existant modifié.`);
  }
  if(latest.state==='published'){
   const st=await store.stageStats(guild,n),total=st.answers.length;
   const unfinished=st.judges.filter(j=>(st.graded.get(j.user_id)?.size||0)<total);
   await i.deferReply({flags:FLAG});let sent=0;
   for(const j of unfinished)if(await dmUser(j.user_id,`🗳️ **Don Juan — Notes manquantes**\nTu as noté ${st.graded.get(j.user_id)?.size||0}/${total} candidat(s) pour ${stageLabel(n)}. Note tous ceux qui ont répondu pour que ton bulletin compte.`,[ratingButton(n)]))sent++;
   return privateReply(i,`🗳️ ${unfinished.length} juge(s) avec des notes manquantes ; ${sent} MP envoyés. ${unfinished.map(x=>`<@${x.user_id}>`).join(', ')||'Tout le monde a fini !'}`);
  }
  return privateReply(i,'Aucun rappel possible : l’épreuve est clôturée.');
 }
 if(sub==='publier'){
  if(n===3){
   if(!['collect','published'].includes(latest.state))return privateReply(i,'La finale est déjà clôturée.');
   const answers=await store.finaleAnswers(guild),players=await store.finaleCandidates(guild);
   if(answers.length<6&&!i.options.getBoolean('forcer')&&latest.state==='collect')return privateReply(i,`⏳ ${answers.length}/6 réponses. Attends les autres ou utilise forcer:true (réponses manquantes = 0).`);
   if(!answers.length)return privateReply(i,'Aucune réponse reçue.');
   await i.deferReply({flags:FLAG});const published=await store.publishFinale(guild,Boolean(i.options.getBoolean('forcer')));
   await judgePost(sess,'# 👑 DON JUAN — GRANDE FINALE : LES TROIS ÉPREUVES DU DON JUAN\n**2 finalistes. 3 actes.** Les numéros 1 et 2 sont nouveaux, tirés au sort et sans lien avec les anciennes épreuves.\nChaque juge doit noter **les deux finalistes sur /10 pour chacun des trois actes**. Soit **6 notes**, avant de pouvoir clôturer. Les anciens scores sont exclus.');
   const answersMap=new Map(answers.map(a=>[`${a.candidate_id}:${a.act_no}`,a.answer]));
   for(let act=1;act<=3;act++){
    const a=FINALE_ACTS[act-1];
    await judgePost(sess,`## ${a.name}\n${a.prompt}`);
    for(const p of players){
     const answer=answersMap.get(`${p.user_id}:${act}`);
     if(answer){
      for(const [idx,part] of splitDiscordText(answer,1650).entries())await judgePost(sess,`**Finaliste ${p.finale_number} — ${a.short}**${answer.length>1650?` (partie ${idx+1})`:''}\n${part}`);
     }else await judgePost(sess,`**Finaliste ${p.finale_number} — ${a.short}**\n_Aucune réponse reçue : 0 automatique pour cet acte._`);
    }
    await judgePost(sess,`🗳️ **NOTATION ${a.short.toUpperCase()}** : clique ci-dessous, saisis « 1 » ou « 2 », puis une note entière de 0 à 10. Note les deux finalistes.`,[finaleRateButton(act)]);
   }
   return privateReply(i,`✅ ${published.total}/6 réponses publiées. Les juges peuvent désormais attribuer leurs notes séparées. Suivi : /donjuan epreuves suivi.`);
  }
  if(!['collect','published'].includes(latest.state))return privateReply(i,'La publication de cette épreuve est déjà terminée.');
  const candidates=await store.stageCandidates(guild,n),responses=await store.stageAnswers(guild,n);
  if(responses.length<candidates.length&&!i.options.getBoolean('forcer')&&latest.state==='collect')
   return privateReply(i,`⏳ ${responses.length}/${candidates.length} textes reçus. Attends les autres ou utilise `+'`forcer:true`'+ ' (candidats sans texte notés 0).');
  if(!responses.length)return privateReply(i,'Aucune réponse reçue.');
  await i.deferReply({flags:FLAG});
  const r=await store.publishStage(guild,n,Boolean(i.options.getBoolean('forcer')));
  await judgePost(sess,`# 👑 ${stageLabel(n)} — Réponses anonymes\n**Consigne :** ${STAGES[n].prompt}\n\nÉvaluez chaque candidat ayant répondu sur **10**, avec le bouton sous ce message.\n**Pour que ton bulletin compte, tu dois noter TOUS les candidats ayant répondu.** Tu peux corriger une note avant la clôture. Aucun ancien point ne compte.`);
  const map=new Map(responses.map(x=>[x.candidate_id,x]));
  for(const p of candidates){const ans=map.get(p.user_id)?.answer;
   if(n===1 && ans){
    // Les poèmes de 25 vers peuvent dépasser les 2 000 caractères de Discord.
    // Les publier en morceaux numérotés, sans jamais révéler le pseudo du candidat.
    const chunks=splitDiscordText(ans,1750);
    for(let k=0;k<chunks.length;k++){
     const head=`**Candidat #${p.number}**${chunks.length>1?` — ${k+1}/${chunks.length}`:''}\n`;
     await judgePost(sess,head+chunks[k]);
    }
   }else await judgePost(sess,`**Candidat #${p.number}**\n${ans||'_Aucune réponse reçue — 0/10 automatique_'}`);
  }
  await judgePost(sess,'🗳️ **JURY — NOTATION /10**\nClique sur le bouton, indique le numéro du candidat puis une note entière de 0 à 10. Recommence pour chacun des candidats qui a répondu. Une même note peut être modifiée jusqu’à la fermeture.',[ratingButton(n)]);
  return privateReply(i,`✅ ${r.total}/${r.expected} textes publiés ; notation ouverte. ${r.repost?'⚠️ Publication rejouée : il peut y avoir des messages en double.':''} /donjuan epreuves suivi te montre la progression des juges.`);
 }
 if(sub==='fermer'){
  if(n===3){
   if(latest.state!=='published')return privateReply(i,'La notation de la finale doit être ouverte pour la fermer.');
   await i.deferReply({flags:FLAG});
   const result=await store.closeFinale(guild,Boolean(i.options.getBoolean('forcer')));
   await judgePost(sess,'🔒 **FINALE — NOTES CLÔTURÉES**\nMerci aux juges ! Les résultats restent secrets jusqu’au couronnement 👑');
   return privateReply(i,`✅ Finale clôturée : ${result.validJudges.length}/${result.judges.length} bulletins complets. Consulte /donjuan epreuves classement EN PRIVÉ, puis /donjuan epreuves eliminer.`);
  }
  if(latest.state!=='published')return privateReply(i,'La notation doit être ouverte pour être clôturée.');
  await i.deferReply({flags:FLAG});
  const st=await store.closeStage(guild,n);
  await judgePost(sess,stageRanking(n,st)+'\n\n🔒 **Notes closes.**');
  return privateReply(i,`✅ Notation de l’épreuve ${n} terminée, avec ${st.validJudges.length} bulletins complets. Classement indépendant enregistré. Consulte /donjuan epreuves classement, puis prépare les éliminations.`);
 }
 if(sub==='classement'){
  if(!['closed','eliminated'].includes(latest.state))return privateReply(i,'Les notes doivent être closes avant de montrer le classement final.');
  return privateSections(i,[stageRanking(n,n===3?await store.finaleStats(guild):await store.stageStats(guild,n))]);
 }
 if(sub==='eliminer'){
  if(n===3){
   if(latest.state!=='closed')return privateReply(i,'Clôture les notes de la finale avant les éliminations.');
   const numbers=store.parseNumbers(i.options.getString('numeros')),stats=await store.finaleStats(guild);
   let candidates;
   try{candidates=store.bottomCut(stats.scores,1,numbers);}
   catch(e){if(e.code==='DJ_CUTOFF_TIE')return privateReply(i,'⚖️ Les finalistes sont à égalité. Choisis une méthode de départage, puis indique avec « numeros » le NOUVEAU numéro du finaliste à éliminer. Aucun changement effectué.');throw e;}
   const loser=candidates[0];
   if(i.options.getString('confirmation')!=='ELIMINER')return privateReply(i,`🔒 **PRÉVISUALISATION PRIVÉE**\nFinaliste ${loser.finale_number} (${loser.mean.toFixed(2)}/30) serait éliminé. Aucun changement. Pour confirmer : /donjuan epreuves eliminer confirmation:ELIMINER.`);
   await store.finishFinale(guild,numbers);
   return privateReply(i,'✅ Verdict enregistré dans Neon. Aucune identité ni résultat n’a été révélé dans les salons. Lance /donjuan finale pour couronner le gagnant 👑');
  }
  if(latest.state!=='closed')return privateReply(i,'Il faut fermer la notation avant les éliminations.');
  const cfg=STAGES[n],numbers=store.parseNumbers(i.options.getString('numeros'));
  const stats=await store.stageStats(guild,n);
  let candidateList;
  try{candidateList=store.bottomCut(stats.scores,cfg.out,numbers);}
  catch(e){if(e.code==='DJ_CUTOFF_TIE')return privateReply(i,`⚖️ ÉGALITÉ à la limite : ${e.message}\nDépartage les ex æquo, puis indique les ${cfg.out} numéros à éliminer avec `+'`numeros`'+'. Rien n’a été modifié.');throw e;}
  const preview=candidateList.map(x=>`#${x.number} (${x.mean.toFixed(2)}/10)`).join(', ');
  if(i.options.getString('confirmation')!=='ELIMINER')return privateReply(i,`🔒 **PRÉVISUALISATION ${cfg.start} → ${cfg.start-cfg.out}**\nCandidats à éliminer : ${preview}.\nAucun changement effectué. Pour appliquer : /donjuan epreuves eliminer confirmation:ELIMINER.`);
  const r=await store.finishStage(guild,n,cfg.out,numbers);
  let annonce='Annonce publique envoyée.';
  try{await publicPost(`💔 **DON JUAN — ÉLIMINATIONS APRÈS ${stageLabel(n)}**\n${r.chosen.map(p=>`Candidat #${p.number} — <@${p.user_id}>`).join('\n')}\n**${cfg.start-cfg.out} prétendant(s)** qualifié(s) ! 👑`);}
  catch(e){annonce='⚠️ Éliminations bien enregistrées, mais annonce publique non envoyée : publie-la manuellement. Ne recommence pas la commande.';}
  return privateReply(i,`✅ ${r.chosen.length} candidat(s) éliminé(s) ; ${cfg.start-cfg.out} restant(s). ${annonce} ${n<3?'Lance le prochain défi avec /donjuan epreuves lancer.':'Le gagnant est prêt : /donjuan finale.'}`);
 }
 return privateReply(i,'Sous-commande épreuve inconnue.');
}
async function handleFinaleComponent(i){
 const parts=i.customId.split(':'),actName=parts[2],act=Number(parts[3]);
 if(!Number.isInteger(act)||act<1||act>3)return privateReply(i,'Acte inconnu.');
 const stage=await store.stage(guild,3),user=await store.entry(guild,i.user.id);
 if(actName==='write'&&i.isButton()){
  const candidates=await store.finaleCandidates(guild);
  if(stage?.state!=='collect'||!candidates.some(p=>p.user_id===i.user.id))return privateReply(i,'La collecte est fermée ou tu ne participes pas à la finale.');
  return i.showModal(modal(`dj:finale:submit:${act}`,`Finale — ${FINALE_ACTS[act-1].short}`,[{id:'answer',label:'Ton texte (max 1800 caractères)',max:1800,long:true}]));
 }
 if(actName==='submit'&&i.isModalSubmit()){
  const answer=i.fields.getTextInputValue('answer').trim();
  if(!answer)return dmReply(i,'Ta réponse est vide.');
  await store.saveFinaleAnswer(guild,i.user.id,act,answer);
  const answers=await store.finaleAnswers(guild),count=answers.filter(a=>a.candidate_id===i.user.id).length;
  return dmReply(i,`✅ Réponse pour **${FINALE_ACTS[act-1].short}** enregistrée (${count}/3 actes complétés). Modifiable jusqu’à la publication.`);
 }
 if(actName==='rate'&&i.isButton()){
  if(stage?.state!=='published'||user?.kind!=='judge')return privateReply(i,'Notes fermées ou réservées aux juges inscrites.');
  return i.showModal(modal(`dj:finale:grade:${act}`,`Noter ${FINALE_ACTS[act-1].short}`,[
   {id:'number',label:'Numéro du finaliste : 1 ou 2',max:1},
   {id:'grade',label:'Note entière de 0 à 10',max:2}
  ]));
 }
 if(actName==='grade'&&i.isModalSubmit()){
  const raw=i.fields.getTextInputValue('number').trim(),rawGrade=i.fields.getTextInputValue('grade').trim();
  if(!/^[12]$/.test(raw)||!/^(10|[0-9])$/.test(rawGrade))return privateReply(i,'Saisis 1 ou 2 et une note entière de 0 à 10.');
  const candidates=await store.finaleCandidates(guild),candidate=candidates.find(p=>p.finale_number===Number(raw));
  if(!candidate)return privateReply(i,'Numéro de finaliste introuvable.');
  await store.finaleRate(guild,i.user.id,candidate.user_id,act,Number(rawGrade));
  const stats=await store.finaleStats(guild),current=stats.graded.get(i.user.id)?.size||0;
  return privateReply(i,`✅ ${FINALE_ACTS[act-1].short} : Finaliste ${raw} noté **${rawGrade}/10**. Ton bulletin : **${current}/${stats.required.size} notes** complétées. Tu peux modifier tes notes jusqu’à la clôture.`);
 }
 return privateReply(i,'Action inconnue pour la finale.');
}
async function handleStageComponent(i){
 const parts=i.customId.split(':'),act=parts[2],n=Number(parts[3]);
 if(!STAGES[n]||n===3)return privateReply(i,'Utilise les nouveaux boutons individuels de la finale.');
 if(act==='write'&&i.isButton()){
  const st=await store.stage(guild,n),p=await store.entry(guild,i.user.id);
  if(st?.state!=='collect'||p?.kind!=='candidate'||!p.active)return privateReply(i,'Épreuve fermée ou tu ne participes pas.');
  if(n===1)return i.showModal(modal(`dj:stage:submit:${n}`,stageLabel(n).slice(0,40),[
   {id:'title',label:'Titre du poème (obligatoire)',max:100},
   {id:'answer',label:'Ton poème : 10 à 25 vers',long:true,max:STAGES[n].max}
  ]));
  return i.showModal(modal(`dj:stage:submit:${n}`,stageLabel(n).slice(0,40),[{id:'answer',label:'Ta réponse',long:true,max:STAGES[n].max}]));
 }
 if(act==='submit'&&i.isModalSubmit()){
  let text=i.fields.getTextInputValue('answer').trim();if(!text)return dmReply(i,'Réponse vide.');
  if(n===1){
   const title=i.fields.getTextInputValue('title').trim();
   if(!title)return dmReply(i,'Il faut donner un titre à ton poème.');
   const verses=countPoemVerses(text);
   if(verses<10||verses>25)return dmReply(i,`⛔ Ton poème compte ${verses} vers. Il doit en comporter entre 10 et 25 (une ligne non vide = un vers). Ajuste ton texte puis réutilise le bouton.`);
   text=`**${title.replace(/\*/g,'')}**\n\n${text}`;
  }
  await store.saveStageAnswer(guild,n,i.user.id,text);
  return dmReply(i,`✅ ${n===1?'Poème':'Réponse'} enregistré${n===1?'':'e'} pour l’épreuve ${n}. Tu peux ${n===1?'le':'la'} modifier avec ton bouton jusqu’à sa publication.`);
 }
 if(act==='rate'&&i.isButton()){
  const st=await store.stage(guild,n),judge=await store.entry(guild,i.user.id);
  if(st?.state!=='published'||judge?.kind!=='judge')return privateReply(i,'⛔ Notation réservée aux juges pendant le vote ouvert.');
  return i.showModal(modal(`dj:stage:grade:${n}`,'Noter un candidat sur 10',[{id:'number',label:'Numéro candidat (ex : 3)',max:2},{id:'grade',label:'Note entière de 0 à 10',max:2}]));
 }
 if(act==='grade'&&i.isModalSubmit()){
  const number=Number(i.fields.getTextInputValue('number')),grade=Number(i.fields.getTextInputValue('grade'));
  const candidates=await store.stageCandidates(guild,n),chosen=candidates.find(x=>x.number===number);
  if(!chosen||!/^\d{1,2}$/.test(i.fields.getTextInputValue('grade'))||grade<0||grade>10)return privateReply(i,'Indique un numéro présent dans cette épreuve et une note entière de 0 à 10.');
  await store.stageRate(guild,n,i.user.id,chosen.user_id,grade);
  const stats=await store.stageStats(guild,n),current=stats.graded.get(i.user.id)?.size||0;
  return privateReply(i,`✅ Note du Candidat #${number} : **${grade}/10** enregistrée. Ton bulletin : **${current}/${stats.answers.length}** candidats notés. Réutilise le bouton pour les suivants.`);
 }
 return privateReply(i,'Action indisponible.');
}

async function handleCommand(i){
 if(i.options.getSubcommandGroup(false)==='epreuves')return handleStageCommand(i);

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
  if(result.status==='limit')return privateReply(i,'⛔ 15 prétendants maximum dans cette version. Aucun participant ajouté.');
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
 if(sub==='suivi'){
  if(i.user.id!==owner)return privateReply(i,'🔒 Tableau de bord réservé à Esty.');
  return showProgress(i,s);
 }
 if(sub==='identites'){
  if(i.user.id!==owner)return privateReply(i,'🔒 Correspondance réservée à Esty.');
  return showIdentities(i);
 }
 if(sub==='statut'){
  const c=await store.entries(guild,'candidate'),j=await store.entries(guild,'judge');
  const last=s.phase==='challenges'?await store.latestStage(guild):null;
  const archive=s.phase==='challenges'?'**Anciens scores — conservés, mais non comptabilisés dans les défis**':'**Scores du jeu**';
  return privateReply(i,`👑 **Don Juan** — ${s.phase}${last?` · Épreuve ${last.stage_no} (${last.state})`:''}
Prétendants : ${c.length} (${c.filter(p=>p.active).length} actifs)
Juges : ${j.length}
Round de questions initial : ${s.round_no}
Salon des juges : ${s.judges_channel?`<#${s.judges_channel}>`:'non défini'}

${archive}:
${anonScores(c)||'En attente'}${last?'\n\nClassement du nouveau défi : `/donjuan epreuves classement` après les notes.':''}`);
 }
 if(sub==='participants')return showParticipants(i);
 if(sub==='presentations-statut'){
  const players=await store.entries(guild,'candidate');
  if(!players.length)return privateReply(i,'💌 Aucun prétendant inscrit pour le moment.');
  const ready=players.filter(p=>typeof p.presentation==='string'&&p.presentation.trim().length>0);
  const waiting=players.filter(p=>!ready.includes(p));
  const line=p=>`${p.number?`#${p.number}`:'Sans numéro'} — <@${p.user_id}>`;
  const report=[
    '🔒 **SUIVI DES PRÉSENTATIONS — DON JUAN**',
    `📊 **${ready.length}/${players.length}** présentations reçues · **${waiting.length}** en attente`,
    '',
    `✅ **Reçues (${ready.length})**`,
    ...(ready.length?ready.map(line):['_Aucune pour le moment_']),
    '',
    `⏳ **En attente (${waiting.length})**`,
    ...(waiting.length?waiting.map(line):['_Tout le monde a répondu !_']),
    '',
    s.phase==='presentations'
      ? '💌 Pour relancer seulement les retardataires : `/donjuan rappels`.'
      : 'ℹ️ La commande `/donjuan rappels` fonctionne durant la phase des présentations.'
  ].join('\n');
  return privateReply(i,report);
 }

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
  if(s.phase==='questions'){
   // Ne change PAS de manche : on renvoie seulement le bouton aux juges qui ont encore des questions à poser.
   await i.deferReply({flags:FLAG});const n=await sendQuestionForms(s.round_no);
   return privateReply(i,`📩 Round ${s.round_no} toujours ouvert et inchangé : ${n} juge(s) relancée(s) avec les questions encore disponibles (3 maximum par juge). Aucune question ni réponse perdue.`);
  }
  if(s.phase!=='between')return privateReply(i,'Clôture d’abord le vote précédent.');
  const next=s.round_no+1;
  const updated=await store.phaseTransition(guild,'between','questions',{round_no:next});
  if(!updated)return privateReply(i,'Le round a déjà changé, recommence /donjuan statut.');
  await i.deferReply({flags:FLAG});const n=await sendQuestionForms(next);
  return privateReply(i,`📩 Round ${next} lancé : ${n} juges contactées en MP. Jusqu’à 3 questions par juge pendant ce round.`);
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
  if(qs.length>MAX_REPONSES_PAR_ROUND)return privateReply(i,'Maximum 125 réponses par round pour les menus Discord.');
  await i.deferReply({flags:FLAG});
  await judgePost(s,`# 👑 Don Juan — Réponses du round ${s.round_no}`);
  for(const x of qs)await judgePost(s,`**Réponse #${x.id} — Candidat #${x.number}**\n**Question :** ${x.question}\n**Réponse :** ${x.answer}`);
  const opts=qs.map(x=>({label:`Réponse #${x.id} · Candidat #${x.number}`.slice(0,100),value:String(x.id)}));
  
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
  if(bottom.length>1&&!chosen)return privateReply(i,`⚖️ Égalité au dernier rang entre ${bottom.map(x=>'#'+x.number).join(', ')} (${min} points). Relance /donjuan eliminer avec le numéro choisi par l’animatrice.`);
  const p=chosen?bottom.find(x=>x.number===chosen):bottom[0];
  if(!p)return privateReply(i,'Tu peux choisir uniquement un des candidats à égalité au dernier rang.');
  await store.eliminate(guild,p.user_id);
  await publicPost(`💔 **DON JUAN — ÉLIMINATION**\nLe **Candidat #${p.number}** quitte l’aventure avec ${p.score} points.\nSon identité : <@${p.user_id}>.\nMerci d’avoir joué ! 👑`);
  return privateReply(i,`✅ Candidat #${p.number} éliminé. ${c.length-1} prétendant(s) restent en lice.`);
 }
 if(sub==='finale'){
  if(!['between','challenges'].includes(s.phase))return privateReply(i,'Clôture d’abord les votes.');
  if(s.phase==='challenges' && !(await store.stage(guild,3) && (await store.stage(guild,3)).state==='eliminated'))return privateReply(i,'Termine le duel et son élimination avant le couronnement.');
  const c=await store.entries(guild,'candidate',true);
  if(c.length!==1)return privateReply(i,`Il reste ${c.length} prétendants. Élimine les candidats d’abord.`);
  const winner=c[0],last=s.phase==='challenges'?await store.finaleStats(guild):null;
  const resultText=last?`**${last.scores.find(x=>x.user_id===winner.user_id)?.mean.toFixed(2)}/30** à la finale (3 actes)`:`**${winner.score} points**`;
  const label=last?`Finaliste ${last.scores.find(x=>x.user_id===winner.user_id)?.finale_number}`:`Candidat #${winner.number}`;
  await publicPost(`# 👑 LE DON JUAN DU SERVEUR EST…\n🥁🥁🥁\n**<@${winner.user_id}>** !\n${label} · ${resultText} ! 🏆\nFélicitations à nos deux finalistes et aux juges !`);
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
 if(cid.startsWith('dj:finale:'))return handleFinaleComponent(i);
 if(cid.startsWith('dj:stage:'))return handleStageComponent(i);

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
  const alreadyAsked=(await store.questions(guild,round)).filter(q=>q.judge_id===i.user.id).length;
  if(alreadyAsked>=MAX_QUESTIONS_PAR_JUGE)return dmReply(i,'✅ Tu as déjà envoyé tes 3 questions pour ce round. Merci !');
  return i.showModal(modal(`dj:submit:ask:${round}`,'Question anonyme',[{id:'number',label:'Numéro candidat (ex: 2)',max:2},{id:'question',label:'Ma question',long:true,max:500}]));
 }
 if(cid.startsWith('dj:submit:ask:')&&i.isModalSubmit()){
  const round=Number(cid.split(':')[3]),s=await store.session(guild),member=await store.entry(guild,i.user.id);
  if(s.phase!=='questions'||s.round_no!==round||member?.kind!=='judge')return dmReply(i,'Questions fermées.');
  const number=Number(i.fields.getTextInputValue('number')),q=i.fields.getTextInputValue('question').trim();
  const candidate=(await store.entries(guild,'candidate',true)).find(c=>c.number===number);
  if(!candidate||!q)return dmReply(i,'Numéro invalide ou question vide.');
  try{
   const qu=await store.addQuestion(guild,round,i.user.id,candidate.user_id,q);
   const ok=await dmUser(candidate.user_id,`📩 **Don Juan — Question pour Candidat #${number}**\n${q}\n\nRéponds anonymement avec le bouton ci-dessous.`,[rowButton(`dj:answer:${qu.id}`,'Répondre à cette question')]);
   return dmReply(i,`✅ Question **${qu.judge_question_count}/3** enregistrée pour Candidat #${number}.${ok?'':' ⚠️ Son MP est bloqué ; Esty pourra le relancer.'} Pour en poser une autre, réutilise le bouton du MP initial.`);
  }catch(e){if(e.code==='DJ_JUDGE_LIMIT')return dmReply(i,'✅ Tu as déjà posé tes 3 questions dans ce round.');if(e.code==='DJ_ROUND_LIMIT')return dmReply(i,'⛔ Capacité du vote atteinte pour ce round. Contacte Esty.');if(e.code==='DJ_PHASE_CHANGED')return dmReply(i,'⏳ Le round n’accepte plus de questions.');if(e.code==='DJ_INVALID_CANDIDATE')return dmReply(i,'⛔ Ce candidat n’est plus actif.');throw e;}
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
