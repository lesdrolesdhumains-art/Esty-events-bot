require('dotenv').config();
const {
  Client, Events, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, REST, Routes
} = require('discord.js');
const commands = require('./commands');
const db = require('./db');
const game = require('./index');
const reine = require('./reine');
// 🎡 Nouvelle roue animée des Problèmes d'Esty.
const roue = require('./roue');
const ENV = ['DISCORD_TOKEN','GUILD_ID','OWNER_ID','ANIMATION_CHANNEL_ID','DATABASE_URL'];
const missing = ENV.filter(k => !process.env[k] || process.env[k].startsWith('COLLER_') ||
  process.env[k].startsWith('ID_') || process.env[k].startsWith('TON_') ||
  process.env[k].startsWith('postgresql://utilisateur:'));
if (missing.length) {
  console.error('Variables manquantes/à compléter :', missing.join(', '));
  process.exit(1);
}
const guildId = process.env.GUILD_ID;
const ownerId = process.env.OWNER_ID;
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});
const E = MessageFlags.Ephemeral;
const CHOICES = ['🇦','🇧','🇨','🇩'];
function modalField(id, label, style, required = true, value = '', maxLength = 1000) {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style)
    .setRequired(required).setMaxLength(maxLength);
  if (value) input.setValue(value.slice(0,maxLength));
  return new ActionRowBuilder().addComponents(input);
}
function problemModal(id, existing) {
  const isEdit = Boolean(existing);
  return new ModalBuilder()
    .setCustomId(isEdit ? `problem:edit:${id}` : 'problem:add')
    .setTitle(isEdit ? `Modifier le dossier #${id}` : 'Ajouter un dossier secret')
    .addComponents(
      modalField('question','Question / dossier',TextInputStyle.Paragraph,true,existing?.question || '',1000),
      modalField('target','Personne visée (facultatif)',TextInputStyle.Short,false,existing?.target || '',100),
      modalField('sender','Envoyé par (facultatif)',TextInputStyle.Short,false,existing?.sender || '',100)
    );
}
function qcmModal() {
  return new ModalBuilder().setCustomId('animation:qcm').setTitle('Créer un QCM')
    .addComponents(
      modalField('question','Question',TextInputStyle.Paragraph,true,'',300),
      modalField('a','Réponse A',TextInputStyle.Short,true,'',80),
      modalField('b','Réponse B',TextInputStyle.Short,true,'',80),
      modalField('c','Réponse C (facultative)',TextInputStyle.Short,false,'',80),
      modalField('d','Réponse D (facultative)',TextInputStyle.Short,false,'',80)
    );
}
function messageModal() {
  return new ModalBuilder().setCustomId('animation:message').setTitle('Message d’Esty')
    .addComponents(modalField('message','Message à publier',TextInputStyle.Paragraph,true,'',1800));
}
async function channelFor(type='animation') {
  const id = (type==='annonce' ? process.env.ANNONCE_CHANNEL_ID : '') || process.env.ANIMATION_CHANNEL_ID;
  const channel = await client.channels.fetch(id);
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function')
    throw new Error(`Salon ${type} introuvable ou non accessible : vérifie son ID et les permissions du bot.`);
  return channel;
}
async function sendPublic(channel, content, extra={}) {
  return channel.send({ content, allowedMentions: { parse: [] }, ...extra });
}
async function handleProblem(i, sub) {
  if (sub==='ajouter') return i.showModal(problemModal());
  if (sub==='modifier') {
    const id = i.options.getInteger('id');
    const p = await db.problemById(guildId, id);
    if (!p) return i.reply({content:'❌ Dossier introuvable.',flags:E});
    return i.showModal(problemModal(id,p));
  }
  await i.deferReply({flags:E});
  if (sub==='liste') {
    const {rows,total} = await db.listProblems(guildId);
    if (!total) return i.editReply('💌 Aucun dossier pour le moment. Utilise `/probleme ajouter`.');
    const lines = rows.slice(0,15).map(p =>
      `**#${p.id}** ${p.state==='pending'?'🗃️ À tirer':p.state==='selected'?'🎯 Tiré':'✅ Révélé'} — ${p.question.replace(/\s+/g,' ').slice(0,74)}${p.question.length>74?'…':''}`);
    return i.editReply(`🔒 **Dossiers enregistrés : ${total}** (15 plus récents)\n${lines.join('\n')}\nVoir le texte complet : \`/probleme voir\`.`);
  }
  if (sub==='voir') {
    const p = await db.problemById(guildId, i.options.getInteger('id'));
    return i.editReply(p ? `🔒 **Dossier #${p.id}** (${p.state})\n🎯 Vise : ${p.target||'Non précisé'}\n✉️ Envoyé par : ${p.sender||'Anonyme'}\n📝 ${p.question}` : '❌ Dossier introuvable.');
  }
  if (sub==='supprimer') {
    const p = await db.deleteProblem(guildId,i.options.getInteger('id'));
    return i.editReply(p ? `🗑️ Dossier #${p.id} supprimé définitivement.` : '❌ Dossier introuvable.');
  }
  if (sub==='tirer') {
    const p = await db.drawProblem(guildId);
    return i.editReply(p ? `🎲 **Dossier #${p.id} tiré, gardé secret !**\n🎯 ${p.target||'Libre'}\n📝 ${p.question}\n\nPour le publier : \`/probleme reveler\`. Pour l'annuler : \`/probleme remettre\`.` : '📭 Plus aucun dossier inédit disponible.');
  }
  if (sub==='remettre') {
    const p = await db.returnProblem(guildId);
    return i.editReply(p ? `↩️ Dossier #${p.id} remis dans la pioche.` : 'Aucun dossier sélectionné.');
  }
  if (sub==='reveler') {
    const p = await db.getSelectedProblem(guildId);
    if (!p) return i.editReply('🎲 Aucun dossier sélectionné. Utilise `/probleme tirer`.');
    const channel = await channelFor();
    const target = p.target ? `🎯 **Dossier visant :** ${p.target}\n` : '';
    await sendPublic(channel, `# 🔥 AYO LES PROBLÈÈÈMES !\n${target}💌 **Dossier #${p.id}**\n${p.question}\n\n🎤 **À toi de répondre... ou de passer !**`);
    await db.revealProblem(guildId,p.id);
    return i.editReply(`✅ Dossier #${p.id} révélé dans <#${channel.id}>.`);
  }
}
function pollButtons(poll,disabled=false) {
  return [new ActionRowBuilder().addComponents(poll.options.map((option,j) =>
    new ButtonBuilder().setCustomId(`vote:${poll.id}:${j}`)
      .setLabel(`${'ABCD'[j]} · ${option}`.slice(0,80))
      .setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  ))];
}
async function publishPoll(channel, question, options) {
  if (await db.getOpenPoll(guildId)) throw new Error('Il y a déjà un QCM ouvert. Termine-le avec /animation resultats.');
  const poll = await db.openPoll(guildId,question,options);
  try {
    const msg = await sendPublic(channel,`# 🗳️ QCM D’ESTY\n**${question}**\n\n${options.map((x,k)=>`${CHOICES[k]} ${x}`).join('\n')}\n\nClique sur un bouton pour voter. Un seul vote par personne ; tu peux changer d'avis.`,
      {components:pollButtons(poll)});
    await db.attachPollMessage(poll.id,msg);
  } catch(e) {
    await db.closePoll(guildId);
    throw e;
  }
}
async function closeAndPublish() {
  const p = await db.closePoll(guildId);
  if (!p) return null;
  const countByIndex = Object.fromEntries(p.counts.map(c=>[c.option_index,c.n]));
  const total = p.counts.reduce((sum,c)=>sum+c.n,0);
  const results = p.options.map((opt,j)=> {
    const count = countByIndex[j]||0;
    const percentage = total ? Math.round(100*count/total) : 0;
    return `${CHOICES[j]} **${opt}** — ${count} vote(s) (${percentage} %)`;
  }).join('\n');
  if (p.message_id && p.channel_id) {
    try {
      const channel = await client.channels.fetch(p.channel_id);
      const message = await channel.messages.fetch(p.message_id);
      await message.edit({components:pollButtons(p,true),allowedMentions:{parse:[]}});
    } catch(e) { console.warn('Boutons non désactivés :',e.message); }
  }
  const channel = p.channel_id ? await client.channels.fetch(p.channel_id) : await channelFor();
  await sendPublic(channel,`# 📊 RÉSULTATS DU QCM\n**${p.question}**\n\n${results}\n\n👥 **${total} participant(s)**`);
  return p;
}
async function handleAnimation(i,sub) {
  if (sub==='qcm') return i.showModal(qcmModal());
  if (sub==='message') return i.showModal(messageModal());
  await i.deferReply({flags:E});
  const state = await db.getSession(guildId);
  if (sub==='statut') {
    const poll = await db.getOpenPoll(guildId);
    return i.editReply(`👑 **${game.title}**\nStatut : **${state.status}**\nÉtape suivante : **${state.next_step+1}/${game.steps.length}**\nQCM ouvert : **${poll?'oui':'non'}**`);
  }
  if (sub==='annonce') {
    const channel = await channelFor('annonce');
    await sendPublic(channel,game.announcement);
    return i.editReply(`📢 Annonce envoyée dans <#${channel.id}>.`);
  }
  if (sub==='lancer') {
    if (state.status==='running' || state.status==='paused')
      return i.editReply('⚠️ Une session est déjà active. Termine-la avant d’en lancer une autre.');
    if (await db.getOpenPoll(guildId)) return i.editReply('⚠️ Termine d’abord le QCM en cours.');
    const channel = await channelFor();
    await sendPublic(channel,game.intro);
    await db.startSession(guildId);
    return i.editReply(`🎬 ${game.title} lancée ! Utilise \`/animation suivant\` pour avancer.`);
  }
  if (sub==='pause') {
    if (state.status!=='running') return i.editReply('ℹ️ Aucune session en cours à mettre en pause.');
    await db.setSessionStatus(guildId,'paused');
    return i.editReply('⏸️ Animation en pause.');
  }
  if (sub==='reprendre') {
    if (state.status!=='paused') return i.editReply('ℹ️ Aucune session en pause.');
    await db.setSessionStatus(guildId,'running');
    return i.editReply('▶️ Animation reprise.');
  }
  if (sub==='suivant') {
    if (state.status!=='running') return i.editReply('⚠️ Lance ou reprends d’abord l’animation.');
    if (await db.getOpenPoll(guildId)) return i.editReply('🗳️ Termine le QCM en cours avec `/animation resultats`.');
    const step = game.steps[state.next_step];
    if (!step) return i.editReply('🏁 Toutes les étapes de cet index sont terminées. Utilise `/animation terminer`.');
    const channel = await channelFor();
    if (step.type==='message') await sendPublic(channel,step.content);
    else if (step.type==='qcm') await publishPoll(channel,step.question,step.options);
    else return i.editReply(`❌ Étape ${state.next_step+1} : type inconnu (${step.type}).`);
    await db.advanceSession(guildId,state.next_step);
    return i.editReply(`✅ Étape ${state.next_step+1}/${game.steps.length} publiée dans <#${channel.id}>.`);
  }
  if (sub==='resultats') {
    const p = await closeAndPublish();
    return i.editReply(p ? '📊 QCM clôturé et résultats publiés !' : 'Aucun QCM en cours.');
  }
  if (sub==='terminer') {
    if (state.status==='idle' || state.status==='ended') return i.editReply('ℹ️ Aucune animation à terminer.');
    if (await db.getOpenPoll(guildId)) await closeAndPublish();
    const channel = await channelFor();
    await sendPublic(channel,game.outro);
    await db.setSessionStatus(guildId,'ended');
    return i.editReply('🏁 Animation terminée. Les dossiers non révélés restent sauvegardés.');
  }
}
async function handleModal(i) {
  if (i.customId==='problem:add' || i.customId.startsWith('problem:edit:')) {
    const question = i.fields.getTextInputValue('question').trim();
    const target = i.fields.getTextInputValue('target').trim();
    const sender = i.fields.getTextInputValue('sender').trim();
    if (!question) return i.reply({content:'La question est vide.',flags:E});
    await i.deferReply({flags:E});
    if (i.customId==='problem:add') {
      const p = await db.addProblem(guildId,question,target,sender);
      return i.editReply(`🔒 Dossier **#${p.id}** enregistré ! Il restera secret jusqu’à /probleme reveler.`);
    }
    const id = Number(i.customId.split(':')[2]);
    const p = await db.updateProblem(guildId,id,question,target,sender);
    return i.editReply(p ? `✅ Dossier #${id} modifié et sauvegardé.` : '❌ Dossier introuvable.');
  }
  if (i.customId==='animation:message') {
    await i.deferReply({flags:E});
    const channel = await channelFor();
    await sendPublic(channel,i.fields.getTextInputValue('message').trim());
    return i.editReply(`✅ Message publié dans <#${channel.id}>.`);
  }
  if (i.customId==='animation:qcm') {
    const state = await db.getSession(guildId);
    if (state.status!=='running') return i.reply({content:'⚠️ Lance d’abord la session avec /animation lancer.',flags:E});
    const question = i.fields.getTextInputValue('question').trim();
    const options = ['a','b','c','d'].map(x=>i.fields.getTextInputValue(x).trim()).filter(Boolean);
    if (!question || options.length<2) return i.reply({content:'❌ Il faut une question et au moins deux réponses.',flags:E});
    await i.deferReply({flags:E});
    const channel = await channelFor();
    await publishPoll(channel,question,options);
    return i.editReply('✅ QCM publié ! Utilise `/animation resultats` pour fermer les votes.');
  }
}
client.on(Events.InteractionCreate,async i=>{
  try {
    // La roue traite ses propres boutons et commandes sans gêner la Reine.
    if (await roue.handle(i,{guildId,ownerId,client})) return;
    if (await reine.handle(i)) return;
    if (i.isButton() && i.customId.startsWith('vote:')) {
      if (i.guildId!==guildId) return i.reply({content:'Vote indisponible ici.',flags:E});
      const [,id,k] = i.customId.split(':');
      const status = await db.vote(Number(id),i.user.id,Number(k));
      return i.reply({content:status==='ok'?`✅ Ton vote **${CHOICES[Number(k)]}** a été enregistré ! Tu peux encore changer d’avis.`:'🔒 Ce QCM est fermé ou invalide.',flags:E});
    }
    if (!i.isChatInputCommand() && !i.isModalSubmit()) return;
    if (i.guildId!==guildId) return i.reply({content:'Cette commande fonctionne uniquement sur le serveur LDH.',flags:E});
    if (i.user.id!==ownerId) return i.reply({content:'🔒 Réservé à Esty, la maîtresse de cérémonie.',flags:E});
    if (i.isModalSubmit()) return handleModal(i);
    if (i.commandName==='probleme') return handleProblem(i,i.options.getSubcommand());
    if (i.commandName==='animation') return handleAnimation(i,i.options.getSubcommand());
  } catch(err) {
    console.error('Erreur interaction :',err);
    const payload = {content:`❌ Une erreur est survenue : ${String(err.message||'Erreur inconnue').slice(0,220)}`,flags:E};
    try {
      if (i.deferred) await i.editReply({content:payload.content});
      else if (i.replied) await i.followUp(payload);
      else await i.reply(payload);
    } catch(e) { console.error('Réponse erreur impossible :',e.message); }
  }
});


client.once(Events.ClientReady,async ready=>{
  console.log(`✅ Esty Events connecté : ${ready.user.tag}`);
  try {
    const rest = new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(ready.user.id,guildId),{body:[...commands,reine.command,reine.extraCommand,roue.command].map(c=>c.toJSON())});
    console.log('✅ Commandes /probleme, /animation, /reine, /coeur et /roue synchronisées sur LDH.');
  } catch(e) { console.error('❌ Enregistrement des commandes :',e); }
});
(async()=>{
  try {
    await db.initDb();
    await reine.init(client,guildId,ownerId);
    console.log('✅ Bases PostgreSQL (Problèmes et Reine des Cœurs) prêtes.');
    await client.login(process.env.DISCORD_TOKEN);
  } catch(e) {
    console.error('❌ Impossible de démarrer Esty Events :',e);
    process.exitCode=1;
    await db.pool.end().catch(()=>{});
  }
})();
process.on('SIGTERM',async()=>{
  client.destroy();
  await db.pool.end().catch(()=>{});
  process.exit(0);
});
