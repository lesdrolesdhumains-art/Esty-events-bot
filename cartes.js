'use strict';
/** Les Drôles de Cartes — module autonome, intégré à bot.js sans nouveau client Discord. */
const crypto=require('node:crypto');
const {
 SlashCommandBuilder,ChannelType,MessageFlags,AttachmentBuilder,
 ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle
}=require('discord.js');
const {TIERS,BASE_TIERS,normalize,safe,dayParis,chooseTier,parseItems,formatCode}=require('./cartes-utils');
const {prepareImage,cutPlanche,panel}=require('./cartes-render');
const EP=MessageFlags.Ephemeral;
let pool=null,botClient=null;
const imports=new Map(),albums=new Map(),testResets=new Map();
const owner=id=>id===process.env.OWNER_ID;
const validName=s=>typeof s==='string'&&s.trim().length>=2&&s.trim().length<=50;
const relative=code=>code?.toUpperCase().trim();
const sortTier=new Map(TIERS.map((t,i)=>[t.key,i]));
const humanTier=key=>TIERS.find(t=>t.key===key)?.label||key;
const noMentions={allowedMentions:{parse:[]}};
const privateText=content=>({content,flags:EP,...noMentions});
const nano=()=>crypto.randomBytes(8).toString('hex');
const maxFile=8*1024*1024;
function err(c){throw Error(c);}
function usePool(){if(!pool)err('Module cartes pas encore connecté à la base de données.');return pool;}
function formatLine(item){return `${item.code} ×${item.qty}${item.title?` — ${safe(item.title)}`:''}`;}
function rowButtons(buttons){return new ActionRowBuilder().addComponents(buttons.map(b=>new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(b.style||ButtonStyle.Secondary).setDisabled(Boolean(b.disabled))));}
function decorateTitle(key){return TIERS.find(t=>t.key===key)?.label||key;}
const base=cmd=>cmd.setDMPermission(false);
const admin=base(new SlashCommandBuilder().setName('cartes').setDescription('🎴 Administration et catalogue des cartes'));
admin.addSubcommand(s=>s.setName('configurer-salon').setDescription('Salon des boosters partagés')
 .addChannelOption(o=>o.setName('salon').setDescription('Salon #drôles-de-cartes').addChannelTypes(ChannelType.GuildText).setRequired(true)));
admin.addSubcommand(s=>s.setName('configurer-echanges').setDescription('Salon des échanges publics')
 .addChannelOption(o=>o.setName('salon').setDescription('Salon #echanges-de-cartes').addChannelTypes(ChannelType.GuildText).setRequired(true)));
admin.addSubcommand(s=>s.setName('ajouter-joueur').setDescription('Importer cinq images individuelles pour un personnage')
 .addStringOption(o=>o.setName('nom').setDescription('Nom du personnage').setMinLength(2).setMaxLength(50).setRequired(true))
 .addAttachmentOption(o=>o.setName('commune').setDescription('Carte commune').setRequired(true))
 .addAttachmentOption(o=>o.setName('peu_commune').setDescription('Carte peu commune').setRequired(true))
 .addAttachmentOption(o=>o.setName('rare').setDescription('Carte rare').setRequired(true))
 .addAttachmentOption(o=>o.setName('epique').setDescription('Carte épique').setRequired(true))
 .addAttachmentOption(o=>o.setName('legendaire').setDescription('Carte légendaire').setRequired(true)));
admin.addSubcommand(s=>s.setName('importer-planche').setDescription('Importer une planche de 5 cartes dans l’ordre des raretés')
 .addStringOption(o=>o.setName('nom').setDescription('Nom du personnage').setMinLength(2).setMaxLength(50).setRequired(true))
 .addAttachmentOption(o=>o.setName('planche').setDescription('Image de la planche').setRequired(true))
 .addStringOption(o=>o.setName('disposition').setDescription('Disposition sans bordures externes').setRequired(true)
  .addChoices({name:'5 cartes côte à côte',value:'horizontale'},{name:'5 cartes les unes sous les autres',value:'verticale'})));
admin.addSubcommand(s=>s.setName('ajouter-prestige').setDescription('Ajouter une Légende des Légendaires')
 .addStringOption(o=>o.setName('titre').setDescription('Titre de la carte spéciale').setMinLength(3).setMaxLength(100).setRequired(true))
 .addAttachmentOption(o=>o.setName('image').setDescription('Image de la carte Prestige').setRequired(true)));
admin.addSubcommand(s=>s.setName('catalogue').setDescription('Consulter toutes les cartes et leur code')
 .addStringOption(o=>o.setName('personnage').setDescription('Filtrer par personnage (facultatif)').setMaxLength(50))
 .addIntegerOption(o=>o.setName('page').setDescription('Page').setMinValue(1)));
admin.addSubcommand(s=>s.setName('voir').setDescription('Afficher une carte officielle en image')
 .addStringOption(o=>o.setName('code').setDescription('Ex. C-00001').setRequired(true)));
admin.addSubcommand(s=>s.setName('retirer').setDescription('Désactiver un tirage, sans détruire les collections')
 .addStringOption(o=>o.setName('code').setDescription('Code à retirer des boosters').setRequired(true)));
admin.addSubcommand(s=>s.setName('reactiver').setDescription('Réactiver les tirages d’une carte')
 .addStringOption(o=>o.setName('code').setDescription('Code à réactiver').setRequired(true)));
admin.addSubcommand(s=>s.setName('donner').setDescription('Donner une carte à un membre, pour test ou récompense')
 .addUserOption(o=>o.setName('membre').setDescription('Destinataire').setRequired(true))
 .addStringOption(o=>o.setName('code').setDescription('Code de la carte').setRequired(true))
 .addIntegerOption(o=>o.setName('quantite').setDescription('Nombre').setMinValue(1).setMaxValue(20)));
admin.addSubcommand(s=>s.setName('statut').setDescription('État du catalogue et des salons'));
admin.addSubcommand(s=>s.setName('test-activer').setDescription('Activer le mode test exclusivement pour toi et un membre')
 .addUserOption(o=>o.setName('partenaire').setDescription('Choisis Tropi pour les essais').setRequired(true)));
admin.addSubcommand(s=>s.setName('test-recharger').setDescription('Autoriser un nouveau booster test sans attendre minuit')
 .addUserOption(o=>o.setName('membre').setDescription('Esty ou le partenaire de test (par défaut : toi)')));
admin.addSubcommand(s=>s.setName('test-terminer').setDescription('Effacer TOUS les progrès test et ouvrir le jeu au serveur'));
admin.addSubcommand(s=>s.setName('test-statut').setDescription('Voir si le jeu est verrouillé, en test ou public'));
admin.addSubcommand(s=>s.setName('admin-ajouter').setDescription('Autoriser un membre à gérer les cartes')
 .addUserOption(o=>o.setName('membre').setDescription('Personne à autoriser, par exemple Tropi').setRequired(true)));
admin.addSubcommand(s=>s.setName('admin-retirer').setDescription('Retirer le droit de gérer les cartes')
 .addUserOption(o=>o.setName('membre').setDescription('Personne à retirer').setRequired(true)));
admin.addSubcommand(s=>s.setName('admin-liste').setDescription('Voir les administrateurs des cartes'));
admin.addSubcommand(s=>s.setName('aide').setDescription('Résumé des commandes'));
const booster=base(new SlashCommandBuilder().setName('booster').setDescription('🎁 Booster individuel de 5 cartes'))
 .addSubcommand(s=>s.setName('ouvrir').setDescription('Ouvrir le booster du jour, en privé'))
 .addSubcommand(s=>s.setName('dernier').setDescription('Revoir ses cartes du dernier booster'))
 .addSubcommand(s=>s.setName('statut').setDescription('Savoir si le booster du jour est disponible'));
const collection=base(new SlashCommandBuilder().setName('collection').setDescription('📚 Consulter un album public (réponse privée)'))
 .addUserOption(o=>o.setName('joueur').setDescription('Album d’un autre joueur'))
 .addStringOption(o=>o.setName('album').setDescription('Classique ou Prestige').addChoices({name:'Classique',value:'classique'},{name:'Prestige',value:'prestige'}))
 .addStringOption(o=>o.setName('personnage').setDescription('Nom du personnage, pour filtrer les cartes classiques').setMaxLength(50))
 .addIntegerOption(o=>o.setName('page').setDescription('Page').setMinValue(1));
const echange=base(new SlashCommandBuilder().setName('echange').setDescription('🤝 Échanges de cartes entre joueurs'))
 .addSubcommand(s=>s.setName('proposer').setDescription('Proposer une à cinq cartes contre d’autres')
  .addUserOption(o=>o.setName('membre').setDescription('Destinataire').setRequired(true)))
 .addSubcommand(s=>s.setName('historique').setDescription('Consulter les échanges récents'))
 .addSubcommand(s=>s.setName('annuler').setDescription('Annuler une proposition envoyée')
  .addIntegerOption(o=>o.setName('numero').setDescription('Numéro de la proposition').setRequired(true).setMinValue(1)));
const recherche=base(new SlashCommandBuilder().setName('carte').setDescription('🔎 Trouver qui possède une carte'))
 .addSubcommand(s=>s.setName('rechercher').setDescription('Chercher les propriétaires d’une carte')
  .addStringOption(o=>o.setName('code').setDescription('Code de la carte').setRequired(true)));
const classement=base(new SlashCommandBuilder().setName('classement-cartes').setDescription('🏆 Classement des collections'));
const commands=[admin,booster,collection,echange,recherche,classement];
async function init(db,client){pool=db;botClient=client;await usePool().query(`
 CREATE TABLE IF NOT EXISTS ldh_config(
 guild_id TEXT PRIMARY KEY,share_channel TEXT,trade_channel TEXT,
 game_mode TEXT NOT NULL DEFAULT 'preparation',test_partner TEXT);
 CREATE TABLE IF NOT EXISTS ldh_card_admins(
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,added_by TEXT NOT NULL,
 added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,user_id));
 CREATE TABLE IF NOT EXISTS ldh_cards(
 id BIGSERIAL PRIMARY KEY,guild_id TEXT NOT NULL,code TEXT UNIQUE,character_key TEXT NOT NULL,
 character_name TEXT NOT NULL,title TEXT NOT NULL,tier TEXT NOT NULL,image BYTEA NOT NULL,
 active BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS ldh_cards_guild_idx ON ldh_cards(guild_id,tier,active);
 CREATE TABLE IF NOT EXISTS ldh_inventory(
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,card_id BIGINT NOT NULL REFERENCES ldh_cards(id),
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,user_id,card_id));
 CREATE INDEX IF NOT EXISTS ldh_inventory_user_idx ON ldh_inventory(guild_id,user_id);
 CREATE TABLE IF NOT EXISTS ldh_boosters(
 id BIGSERIAL PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,paris_day TEXT NOT NULL,
 card_ids JSONB NOT NULL,opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),shared_at TIMESTAMPTZ,
 UNIQUE(guild_id,user_id,paris_day));
 CREATE TABLE IF NOT EXISTS ldh_trades(
 id BIGSERIAL PRIMARY KEY,guild_id TEXT NOT NULL,from_user TEXT NOT NULL,to_user TEXT NOT NULL,
 offer JSONB NOT NULL,request JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'draft',
 channel_id TEXT,message_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '24 hours'),closed_at TIMESTAMPTZ);
 CREATE INDEX IF NOT EXISTS ldh_trades_guild_idx ON ldh_trades(guild_id,status);
 ALTER TABLE ldh_config ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'preparation';
 ALTER TABLE ldh_config ADD COLUMN IF NOT EXISTS test_partner TEXT;
 `);console.log('✅ Les Drôles de Cartes : tables prêtes.');}
async function canManage(guild,user){
 if(owner(user))return true;
 const {rows}=await usePool().query('SELECT 1 FROM ldh_card_admins WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 return rows.length>0;
}
async function manageAdmins(i,sub){
 if(!owner(i.user.id))err('Seule Esty (OWNER_ID) peut attribuer ou retirer les accès administrateur.');
 await i.deferReply({flags:EP});
 if(sub==='admin-liste'){
  const {rows}=await usePool().query('SELECT user_id FROM ldh_card_admins WHERE guild_id=$1 ORDER BY added_at',[i.guildId]);
  return i.editReply(`👑 **Propriétaire :** <@${process.env.OWNER_ID}>\n🛡️ **Administrateurs des cartes :**\n${rows.map(r=>`• <@${r.user_id}>`).join('\n')||'Aucun autre membre autorisé.'}`);
 }
 const user=i.options.getUser('membre',true);
 if(user.bot||user.id===process.env.OWNER_ID)err('Choisis un membre humain autre que le propriétaire.');
 if(sub==='admin-ajouter'){
  await usePool().query(`INSERT INTO ldh_card_admins(guild_id,user_id,added_by) VALUES($1,$2,$3)
   ON CONFLICT(guild_id,user_id) DO NOTHING`,[i.guildId,user.id,i.user.id]);
  return i.editReply(`✅ <@${user.id}> peut maintenant gérer **Les Drôles de Cartes** : importations, salon, cadeaux, activation/désactivation des tirages.\n🔐 Les accès des autres jeux ne changent pas. Le reset officiel et la gestion des administrateurs restent réservés à Esty.`);
 }
 await usePool().query('DELETE FROM ldh_card_admins WHERE guild_id=$1 AND user_id=$2',[i.guildId,user.id]);
 return i.editReply(`✅ Accès à la gestion des Drôles de Cartes retiré à <@${user.id}>. Ses cartes personnelles restent intactes.`);
}
async function transaction(fn){
 const db=await usePool().connect();
 try{await db.query('BEGIN');const v=await fn(db);await db.query('COMMIT');return v;}
 catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
async function lock(db,guild){await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`ldh-cards:${guild}`]);}
/** Sans configuration, aucune ouverture publique : il faut activer le test, puis le lancer officiellement. */
async function getMode(guild,db=usePool()){
 const {rows}=await db.query('SELECT game_mode,test_partner FROM ldh_config WHERE guild_id=$1',[guild]);
 return {mode:rows[0]?.game_mode||'preparation',partner:rows[0]?.test_partner||null};
}
function mayPlay(mode,userId,ownerId=process.env.OWNER_ID){
 if(mode.mode==='public')return true;
 if(mode.mode==='test')return userId===ownerId||userId===mode.partner;
 return false;
}
async function testActivate(i){
 if(!owner(i.user.id))err('Seule Esty peut activer le mode test.');
 const partner=i.options.getUser('partenaire',true);
 if(partner.bot||partner.id===i.user.id)err('Choisis le compte Discord de Tropi, différent du tien, et non un bot.');
 await i.deferReply({flags:EP});
 await transaction(async db=>{
  await lock(db,i.guildId);
  const cur=await getMode(i.guildId,db);
  if(cur.mode==='public')err('Le jeu est déjà officiellement lancé. Impossible de réactiver un mode test qui pourrait supprimer des données réelles.');
  if(cur.mode==='test')err('Test déjà activé. Termine d’abord cette session, ou conserve le partenaire indiqué.');
  const stats=await db.query(`SELECT
    (SELECT COUNT(*) FROM ldh_inventory WHERE guild_id=$1)::int AS inventaires,
    (SELECT COUNT(*) FROM ldh_boosters WHERE guild_id=$1)::int AS boosters,
    (SELECT COUNT(*) FROM ldh_trades WHERE guild_id=$1)::int AS echanges`,[i.guildId]);
  const a=stats.rows[0]||{};
  if(Number(a.inventaires)||Number(a.boosters)||Number(a.echanges))err('Des données de collection existent déjà. Par sécurité, ce mode test refuse de les réinitialiser : vérifie ton installation avant de continuer.');
  await db.query(`INSERT INTO ldh_config(guild_id,game_mode,test_partner) VALUES($1,'test',$2)
    ON CONFLICT(guild_id) DO UPDATE SET game_mode='test',test_partner=EXCLUDED.test_partner`,[i.guildId,partner.id]);
 });
 await i.editReply(`🧪 **MODE TEST ACTIVÉ** pour <@${i.user.id}> et <@${partner.id}> uniquement.
Les autres membres ne peuvent pas ouvrir de booster, consulter les albums ou échanger.
🎴 Ajoute tes cartes, puis teste \`/booster ouvrir\`. \`/cartes test-recharger\` permet de refaire un tirage sans attendre minuit.
⚠️ Quand tout sera prêt, \`/cartes test-terminer\` effacera les PROGRÈS du test, mais conservera toutes les images et les salons.`);
}
async function testRecharge(i){
 if(!owner(i.user.id))err('La recharge des essais est réservée à Esty.');
 const u=i.options.getUser('membre')||i.user;
 await i.deferReply({flags:EP});
 const n=await transaction(async db=>{
  await lock(db,i.guildId);
  const mode=await getMode(i.guildId,db);
  if(mode.mode!=='test')err('Cette commande fonctionne uniquement pendant le mode test.');
  if(u.id!==i.user.id&&u.id!==mode.partner)err('Seuls Esty et le partenaire de test peuvent recevoir une recharge.');
  const r=await db.query('DELETE FROM ldh_boosters WHERE guild_id=$1 AND user_id=$2 AND paris_day=$3 RETURNING id',[i.guildId,u.id,dayParis()]);
  return r.rowCount;
 });
 await i.editReply(`🧪 **${safe(u.username)}** peut ouvrir un nouveau booster aujourd’hui. ${n?'Son dernier booster du jour a été déverrouillé.':'Aucune ouverture du jour à supprimer.'}
Les cartes déjà obtenues restent dans sa collection TEST, qui sera entièrement vidée au lancement officiel.`);
}
async function prepareTestFinish(i){
 if(!owner(i.user.id))err('Seule Esty peut lancer la remise à zéro.');
 await i.deferReply({flags:EP});
 const mode=await getMode(i.guildId);
 if(mode.mode!=='test')err('Fin de test indisponible : le jeu n’est pas en mode test. Aucune donnée supprimée.');
 const token=nano();testResets.set(token,{guild:i.guildId,owner:i.user.id,created:Date.now()});
 await i.editReply({content:`⚠️ **FIN DU MODE TEST — REMISE À ZÉRO IRRÉVERSIBLE**

Seront supprimés pour **Les Drôles de Cartes seulement** : **toutes les collections et leurs découvertes, tous les boosters (y compris le quota quotidien), toutes les propositions et tous les historiques d’échange** de ce serveur.

✅ Seront **conservés** : les cartes, les images Esty/Tropi et autres personnages, les cartes Prestige, les salons configurés et les autres jeux.

Après la confirmation, le jeu passera en **mode public**, et tout le monde repartira de zéro. Les messages de test déjà publiés sur Discord devront être supprimés manuellement si tu le souhaites.

Clique pour ouvrir la confirmation par phrase. Le bouton expire après 5 minutes.`,components:[rowButtons([{id:`ldh:test:finish:${token}`,label:'⚠️ Vérifier puis confirmer la remise à zéro',style:ButtonStyle.Danger}])]});
}
async function showResetModal(i,token){
 const r=testResets.get(token);
 if(!owner(i.user.id)||!r||r.guild!==i.guildId||r.owner!==i.user.id||Date.now()-r.created>300000)err('Confirmation expirée ou non autorisée. Relance /cartes test-terminer.');
 const mode=await getMode(i.guildId);if(mode.mode!=='test')err('Le jeu n’est plus en mode test.');
 const modal=new ModalBuilder().setCustomId(`ldh:test:submit:${token}`).setTitle('Lancement officiel — remise à zéro');
 modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('phrase').setLabel('Écris exactement : LANCEMENT OFFICIEL').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(18).setMaxLength(40)));
 await i.showModal(modal);
}
async function finishTest(i,token){
 const r=testResets.get(token);
 if(!owner(i.user.id)||!r||r.guild!==i.guildId||r.owner!==i.user.id||Date.now()-r.created>300000)err('Confirmation expirée. Rien n’a été effacé.');
 if(i.fields.getTextInputValue('phrase').trim()!=='LANCEMENT OFFICIEL')err('Phrase incorrecte. Rien n’a été effacé. Écris exactement : LANCEMENT OFFICIEL');
 await i.deferReply({flags:EP});
 const counts=await transaction(async db=>{
  await lock(db,i.guildId);
  const mode=await getMode(i.guildId,db);
  if(mode.mode!=='test')err('Le mode test est déjà terminé : remise à zéro refusée.');
  const trades=await db.query('DELETE FROM ldh_trades WHERE guild_id=$1 RETURNING id',[i.guildId]);
  const boosters=await db.query('DELETE FROM ldh_boosters WHERE guild_id=$1 RETURNING id',[i.guildId]);
  const inv=await db.query('DELETE FROM ldh_inventory WHERE guild_id=$1 RETURNING card_id',[i.guildId]);
  await db.query(`UPDATE ldh_config SET game_mode='public',test_partner=NULL WHERE guild_id=$1`,[i.guildId]);
  return {trades:trades.rowCount,boosters:boosters.rowCount,inv:inv.rowCount};
 });
 testResets.delete(token);albums.clear();
 await i.editReply(`🎉 **LES DRÔLES DE CARTES SONT OUVERTES OFFICIELLEMENT !**
Collections réinitialisées (${counts.inv} lignes), boosters remis à zéro (${counts.boosters}), échanges de test effacés (${counts.trades}).
✅ **Toutes les cartes et images importées sont intactes**, comme la configuration des salons et les autres jeux.
🎁 Chaque membre, y compris toi et Tropi, peut désormais ouvrir son booster du jour.`);
}
async function getCard(guild,code,withImage=false,db=usePool()){ 
 const {rows}=await db.query(`SELECT id,code,character_key,character_name,title,tier,active${withImage?',image':''} FROM ldh_cards WHERE guild_id=$1 AND code=$2`,[guild,relative(code)]);
 return rows[0];
}
async function fetchAttachment(a){
 if(!a||!a.url)err('Image Discord manquante.');
 if(a.size>maxFile)err('Image trop lourde (maximum 8 Mo).');
 const url=new URL(a.url);
 if(!/(^|\.)discord(app)?\.(com|net)$/.test(url.hostname)&&!url.hostname.endsWith('.discordapp.net'))err('Ce fichier doit provenir directement de Discord.');
 const res=await fetch(a.url,{signal:AbortSignal.timeout(20000)});
 if(!res.ok)err(`Impossible de récupérer l’image (${res.status}). Renvoie-la depuis ton téléphone.`);
 const len=Number(res.headers.get('content-length')||0);
 if(len>maxFile)err('Image trop volumineuse.');
 const chunks=[];let size=0;
 for await (const chunk of res.body){size+=chunk.length;if(size>maxFile)err('Image trop volumineuse.');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
async function getImages(guild,ids,db=usePool()){
 const {rows}=await db.query('SELECT id,code,title,character_name,tier,image FROM ldh_cards WHERE guild_id=$1 AND id=ANY($2::bigint[])',[guild,ids.map(Number)]);
 const by=new Map(rows.map(c=>[String(c.id),c]));
 return ids.map(id=>{const c=by.get(String(id));if(!c)err('Une carte du booster est introuvable.');return c;});
}
async function addInventory(db,guild,user,cardId,quantity=1){
 await db.query(`INSERT INTO ldh_inventory(guild_id,user_id,card_id,quantity) VALUES($1,$2,$3,$4)
 ON CONFLICT(guild_id,user_id,card_id) DO UPDATE SET quantity=ldh_inventory.quantity+excluded.quantity`,[guild,user,cardId,quantity]);
}
function expirePending(){
 const now=Date.now();for(const [k,v] of imports)if(now-v.created>600000)imports.delete(k);
 for(const [k,v] of albums)if(now-v.created>900000)albums.delete(k);
}
async function stageImport(i,kind){
 if(!(await canManage(i.guildId,i.user.id)))err('Gestion des cartes réservée à Esty et aux administrateurs autorisés.');
 await i.deferReply({flags:EP});
 expirePending();
 let name,images,mode='classique';
 if(kind==='prestige'){
  name=i.options.getString('titre',true).trim();
  images=[await prepareImage(await fetchAttachment(i.options.getAttachment('image',true)))];mode='prestige';
 }else{
  name=i.options.getString('nom',true).trim();
  if(!validName(name))err('Nom du personnage invalide (2 à 50 caractères).');
  const key=normalize(name);if(!key)err('Choisis un nom contenant des lettres ou chiffres.');
  const {rows}=await usePool().query('SELECT 1 FROM ldh_cards WHERE guild_id=$1 AND character_key=$2 AND tier<>$3 LIMIT 1',[i.guildId,key,'prestige']);
  if(rows.length)err(`Ce personnage existe déjà : ${name}. L'import complet refuse d'écraser les cartes existantes.`);
  if(kind==='planche')images=await cutPlanche(await fetchAttachment(i.options.getAttachment('planche',true)),i.options.getString('disposition',true));
  else images=await Promise.all(BASE_TIERS.map(async tier=>prepareImage(await fetchAttachment(i.options.getAttachment(tier.key,true)))));
 }
 const key=nano();imports.set(key,{guild:i.guildId,author:i.user.id,mode,name,images,created:Date.now()});
 const preview=await panel(images.map((image,j)=>({image,tier:mode==='prestige'?'prestige':BASE_TIERS[j].key,title:mode==='prestige'?name:`${name} · ${BASE_TIERS[j].label}`})),
  {title:`Aperçu : ${name}`,subtitle:'Vérifie bien les images et leur ordre avant de confirmer.',columns:images.length});
 await i.editReply({content:`🖼️ **Aperçu de ${safe(name)}**\n${mode==='prestige'?'Album Prestige':'Ordre : Commune → Peu commune → Rare → Épique → Légendaire'}\n**Aucune carte n’est encore enregistrée.**`,files:[new AttachmentBuilder(preview,{name:'apercu-cartes.png'})],components:[rowButtons([{id:`ldh:import:ok:${key}`,label:'✅ Confirmer l’import',style:ButtonStyle.Success},{id:`ldh:import:no:${key}`,label:'Annuler',style:ButtonStyle.Danger}])]});
}
async function commitImport(i,action,token){
 if(!(await canManage(i.guildId,i.user.id)))err('Tu ne disposes plus des droits nécessaires pour confirmer cette importation.');
 const p=imports.get(token);if(!p||p.guild!==i.guildId||p.author!==i.user.id||Date.now()-p.created>600000)err('Aperçu expiré. Relance la commande pour ajouter tes cartes.');
 if(action==='no'){imports.delete(token);return i.update({content:'❎ Importation annulée. Aucune carte ajoutée.',components:[],attachments:[]});}
 await i.deferUpdate();
 let created;
 try{created=await transaction(async db=>{
  await lock(db,i.guildId);
  const key=normalize(p.name);
  if(p.mode==='classique'){
   const check=await db.query('SELECT 1 FROM ldh_cards WHERE guild_id=$1 AND character_key=$2 AND tier<>$3 LIMIT 1',[i.guildId,key,'prestige']);
   if(check.rowCount)err('Ce personnage a été ajouté entre-temps. Aucune image écrasée.');
  }
  const added=[];
  for(let k=0;k<p.images.length;k++){
   const tier=p.mode==='prestige'?'prestige':BASE_TIERS[k].key;
   const title=p.mode==='prestige'?p.name:p.name;
   const insert=await db.query('INSERT INTO ldh_cards(guild_id,character_key,character_name,title,tier,image) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[i.guildId,p.mode==='prestige'?'prestige':key,p.mode==='prestige'?'Album Prestige':p.name,title,tier,p.images[k]]);
   const id=insert.rows[0].id;const code=formatCode(id,p.mode==='prestige');
   await db.query('UPDATE ldh_cards SET code=$1 WHERE id=$2',[code,id]);added.push(`${code} : ${humanTier(tier)}`);
  }
  return added;
 });imports.delete(token);}catch(e){throw e;}
 await i.editReply({content:`✅ **${safe(p.name)} ajouté${p.mode==='prestige'?'e':''} au catalogue !**\n${created.map(x=>'• '+x).join('\n')}\nLes cartes sont maintenant disponibles dans les boosters.`,components:[],attachments:[]});
}
async function config(i,sub){
 if(!(await canManage(i.guildId,i.user.id)))err('Gestion des cartes réservée à Esty et aux administrateurs autorisés.');
 const ch=i.options.getChannel('salon',true);
 if(!ch.isTextBased()||typeof ch.send!=='function')err('Choisis un salon textuel accessible au bot.');
 const field=sub==='configurer-salon'?'share_channel':'trade_channel';
 await usePool().query(`INSERT INTO ldh_config(guild_id,${field}) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET ${field}=EXCLUDED.${field}`,[i.guildId,ch.id]);
 await i.reply(privateText(`✅ ${sub==='configurer-salon'?'Partages de boosters':'Échanges'} configurés dans ${ch}.`));
}
async function cardCommand(i,sub){
 if(['admin-ajouter','admin-retirer','admin-liste'].includes(sub))return manageAdmins(i,sub);
 if(sub==='configurer-salon'||sub==='configurer-echanges')return config(i,sub);
 if(sub==='test-activer')return testActivate(i);
 if(sub==='test-recharger')return testRecharge(i);
 if(sub==='test-terminer')return prepareTestFinish(i);
 if(['ajouter-joueur','importer-planche','ajouter-prestige'].includes(sub))return stageImport(i,sub==='ajouter-joueur'?'individuel':sub==='importer-planche'?'planche':'prestige');
 await i.deferReply({flags:EP});
 if(sub==='aide')return i.editReply('👑 **Accès admin :** `/cartes admin-ajouter membre:@Tropi`, `/cartes admin-retirer`, `/cartes admin-liste` (Esty uniquement).\n🧪 **Essais :** `/cartes test-activer partenaire:@Tropi`, `/cartes test-statut`, `/cartes test-recharger`, `/cartes test-terminer`. Le dernier efface UNIQUEMENT la progression des cartes après double confirmation.\n🎴 **Administration :** `/cartes ajouter-joueur`, `/cartes importer-planche`, `/cartes ajouter-prestige`, `/cartes configurer-salon`, `/cartes configurer-echanges`, `/cartes catalogue`, `/cartes voir`, `/cartes retirer`, `/cartes reactiver`, `/cartes donner`.\n**Joueurs :** `/booster ouvrir`, `/booster dernier`, `/collection`, `/echange proposer`, `/echange historique`, `/carte rechercher`, `/classement-cartes`.');
 if(sub==='test-statut'){
  const st=await getMode(i.guildId);
  const label=st.mode==='test'?`🧪 Test privé : Esty et <@${st.partner}>`:st.mode==='public'?'🎉 Public : ouvert à tous':'🔒 Préparation : aucun booster encore accessible';
  return i.editReply(`🎴 **Mode actuel :** ${label}\n🛡️ La remise à zéro n’est disponible qu’en mode test, et uniquement pour Esty.`);
 }
 if(sub==='statut'){
  const a=await usePool().query('SELECT tier,count(*)::int AS n FROM ldh_cards WHERE guild_id=$1 AND active=true GROUP BY tier',[i.guildId]);
  const b=await usePool().query('SELECT share_channel,trade_channel FROM ldh_config WHERE guild_id=$1',[i.guildId]);
  const s=Object.fromEntries(a.rows.map(x=>[x.tier,x.n]));
  const currentMode=await getMode(i.guildId);
  return i.editReply(`🎴 **Catalogue actuel : ${Object.values(s).reduce((x,y)=>x+y,0)} cartes actives**\n🔐 Mode : **${currentMode.mode}**\n${TIERS.map(t=>`${t.label} : **${s[t.key]||0}**`).join('\n')}\n📣 Partage : ${b.rows[0]?.share_channel?`<#${b.rows[0].share_channel}>`:'non configuré'}\n🤝 Échanges : ${b.rows[0]?.trade_channel?`<#${b.rows[0].trade_channel}>`:'salon de la commande'}`);
 }
 if(sub==='catalogue'){
  const p=i.options.getInteger('page')||1;const character=normalize(i.options.getString('personnage')||'');
  const {rows}=await usePool().query('SELECT code,character_name,title,tier,active FROM ldh_cards WHERE guild_id=$1 AND ($2=$3 OR character_key=$2) ORDER BY id LIMIT 25 OFFSET $4',[i.guildId,character,'',(p-1)*25]);
  return i.editReply(`📖 **Catalogue — page ${p}**\n${rows.map(c=>`${c.active?'✅':'🚫'} **${c.code}** · ${safe(c.title)} · ${decorateTitle(c.tier)}`).join('\n')||'Aucune carte sur cette page.'}`);
 }
 if(sub==='voir'){
  const card=await getCard(i.guildId,i.options.getString('code',true),true);
  if(!card)err('Carte introuvable. Consulte /cartes catalogue.');
  const view=await panel([card],{title:card.code,subtitle:card.tier==='prestige'?'Album Prestige':card.character_name,columns:1});
  return i.editReply({content:`🎴 **${safe(card.title)}** · ${decorateTitle(card.tier)} · ${card.code}`,files:[new AttachmentBuilder(view,{name:'carte.png'})]});
 }
 if(!(await canManage(i.guildId,i.user.id)))err('Gestion des cartes réservée à Esty et aux administrateurs autorisés.');
 if(sub==='retirer'||sub==='reactiver'){
  const code=relative(i.options.getString('code',true));
  const result=await usePool().query('UPDATE ldh_cards SET active=$1 WHERE guild_id=$2 AND code=$3 RETURNING title',[sub==='reactiver',i.guildId,code]);
  if(!result.rowCount)err('Carte introuvable.');
  return i.editReply(`✅ Carte **${code}** ${sub==='retirer'?'retirée des futurs boosters (sans toucher aux collections)':'réactivée pour les futurs boosters'}.`);
 }
 if(sub==='donner'){
  const user=i.options.getUser('membre',true),code=i.options.getString('code',true),qty=i.options.getInteger('quantite')||1;
  if(user.bot)err('Impossible de donner des cartes à un bot.');
  await transaction(async db=>{await lock(db,i.guildId);const c=await getCard(i.guildId,code,false,db);if(!c)err('Carte introuvable.');await addInventory(db,i.guildId,user.id,c.id,qty);});
  return i.editReply(`🎁 **${qty} × ${safe(relative(code))}** offert${qty>1?'s':''} à ${safe(user.username)}.`);
 }
 err('Commande inconnue.');
}
async function claimBooster(guild,user){
 const date=dayParis();
 return transaction(async db=>{
  await lock(db,guild);
  const prev=await db.query('SELECT id FROM ldh_boosters WHERE guild_id=$1 AND user_id=$2 AND paris_day=$3',[guild,user,date]);
  if(prev.rowCount)err('Tu as déjà ouvert ton booster aujourd’hui ! Il sera à nouveau disponible à minuit (heure de Paris). Utilise /booster dernier.');
  const {rows}=await db.query('SELECT id,tier FROM ldh_cards WHERE guild_id=$1 AND active=true',[guild]);
  const by={};for(const c of rows)(by[c.tier]??=[]).push(c.id);
  const picks=[];
  for(let i=0;i<5;i++){const tier=chooseTier(by);const cards=by[tier];picks.push(cards[crypto.randomInt(cards.length)]);}
  const {rows:created}=await db.query('INSERT INTO ldh_boosters(guild_id,user_id,paris_day,card_ids) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[guild,user,date,JSON.stringify(picks)]);
  for(const id of picks)await addInventory(db,guild,user,id,1);
  return {id:created[0].id,ids:picks,shared:false,date};
 });
}
async function lastBooster(guild,user){
 const {rows}=await usePool().query('SELECT id,paris_day,card_ids,shared_at FROM ldh_boosters WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 1',[guild,user]);
 if(!rows.length)err('Tu n’as encore ouvert aucun booster. Essaie /booster ouvrir !');
 return {...rows[0],ids:rows[0].card_ids,shared:Boolean(rows[0].shared_at)};
}
async function boosterReply(i,boost,newly){
 const cards=await getImages(i.guildId,boost.ids);
 const image=await panel(cards,{title:`Booster de ${i.user.username}`,subtitle:`5 cartes · ${boost.date||boost.paris_day}`,columns:5});
 const opts={content:`${newly?'🎉 **Ton booster est ouvert !**':'🎁 **Voici ton dernier booster !**'}\n${cards.map(c=>`• ${c.code} · ${safe(c.title)} — **${decorateTitle(c.tier)}**`).join('\n')}`,
 files:[new AttachmentBuilder(image,{name:'mon-booster.png'})],components:[rowButtons([{id:`ldh:share:${boost.id}`,label:boost.shared?'Déjà partagé':'📣 Partager dans #drôles-de-cartes',style:ButtonStyle.Primary,disabled:boost.shared}])]};
 return i.editReply(opts);
}
async function handleBooster(i){
 const sub=i.options.getSubcommand();await i.deferReply({flags:EP});
 if(sub==='statut'){
  const {rows}=await usePool().query('SELECT opened_at FROM ldh_boosters WHERE guild_id=$1 AND user_id=$2 AND paris_day=$3',[i.guildId,i.user.id,dayParis()]);
  return i.editReply(rows.length?'⏳ Ton booster du jour est déjà ouvert. Reviens à minuit (heure de Paris).':'✅ Ton booster de 5 cartes est disponible ! Utilise `/booster ouvrir`.');
 }
 return boosterReply(i,sub==='ouvrir'?await claimBooster(i.guildId,i.user.id):await lastBooster(i.guildId,i.user.id),sub==='ouvrir');
}
async function shareBooster(i,id){
 await i.deferReply({flags:EP});
 await transaction(async db=>{
  await lock(db,i.guildId);
  const {rows}=await db.query('SELECT id,user_id,paris_day,card_ids,shared_at FROM ldh_boosters WHERE id=$1 AND guild_id=$2 FOR UPDATE',[id,i.guildId]);
  const b=rows[0];if(!b||b.user_id!==i.user.id)err('Ce bouton ne t’appartient pas.');
  if(b.shared_at)err('Tu as déjà partagé ce booster.');
  const settings=await db.query('SELECT share_channel FROM ldh_config WHERE guild_id=$1',[i.guildId]);
  const channelId=settings.rows[0]?.share_channel;if(!channelId)err('Esty doit d’abord configurer le salon avec /cartes configurer-salon.');
  const channel=await botClient.channels.fetch(channelId);
  if(!channel?.isTextBased()||!channel.send)err('Salon de partage inaccessible au bot.');
  const cards=await getImages(i.guildId,b.card_ids,db);
  const artwork=await panel(cards,{title:`Booster de ${i.user.username}`,subtitle:`5 découvertes · ${b.paris_day}`,columns:5});
  await channel.send({content:`${(await getMode(i.guildId,db)).mode==='test'?'🧪 **MESSAGE DE TEST — NE COMPTE PAS POUR LE LANCEMENT**\n':''}🎴 **${safe(i.user.username)} partage son booster !**\n${cards.map(c=>`• ${c.code} — **${decorateTitle(c.tier)}**`).join('\n')}`,
   files:[new AttachmentBuilder(artwork,{name:'booster-partage.png'})],...noMentions});
  await db.query('UPDATE ldh_boosters SET shared_at=now() WHERE id=$1',[id]);
 });
 return i.editReply('✅ Booster publié une seule fois dans **#drôles-de-cartes** !');
}
async function collectData(guild,user,album,person,pg){
 const key=normalize(person||'');
 const {rows:catalog}=await usePool().query(`SELECT id,code,character_name,character_key,title,tier,image FROM ldh_cards
 WHERE guild_id=$1 AND (($2='prestige' AND tier='prestige') OR ($2='classique' AND tier<>'prestige' AND ($3='' OR character_key=$3)))
 ORDER BY character_key,CASE tier WHEN 'commune' THEN 1 WHEN 'peu_commune' THEN 2 WHEN 'rare' THEN 3 WHEN 'epique' THEN 4 WHEN 'legendaire' THEN 5 ELSE 6 END,id`,[guild,album,key]);
 const {rows:inv}=await usePool().query('SELECT card_id,quantity FROM ldh_inventory WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 const quant=new Map(inv.map(x=>[String(x.card_id),x.quantity]));
 const cards=catalog.map(c=>({...c,quantity:quant.get(String(c.id))||0,missing:!(quant.get(String(c.id))||0)}));
 const total=cards.length,own=cards.filter(c=>c.quantity>0).length,quantTotal=cards.reduce((s,c)=>s+c.quantity,0);
 const per=album==='prestige'?8:10;
 const max=Math.max(1,Math.ceil(total/per));
 const page=Math.max(1,Math.min(max,pg));
 return {cards:cards.slice((page-1)*per,page*per).map(c=>({...c,image:c.quantity>0?c.image:null})),total,own,quantTotal,page,max};
}
async function albumPayload(guild,user,album,person,page,username,token){
 const info=await collectData(guild,user,album,person,page);
 const pic=await panel(info.cards,{title:`${album==='prestige'?'👑 Prestige':'📚 Classique'} · ${username}`,subtitle:`${info.own}/${info.total} cartes actuelles · ${info.quantTotal} exemplaires · Page ${info.page}/${info.max}`,
 columns:album==='prestige'?4:5});
 const buttons=[];
 if(info.page>1)buttons.push({id:`ldh:album:${token}:prev`,label:'◀ Précédent'});
 if(info.page<info.max)buttons.push({id:`ldh:album:${token}:next`,label:'Suivant ▶'});
 const content=`📚 **Collection ${album==='prestige'?'Prestige':'Classique'} de ${safe(username)}**\n**${info.own}/${info.total} cartes possédées** (${info.quantTotal} exemplaires), page ${info.page}/${info.max}.\nLes cartes manquantes sont grisées. Les cartes échangées peuvent être récupérées plus tard.`;
 return {content,files:[new AttachmentBuilder(pic,{name:'album.png'})],components:buttons.length?[rowButtons(buttons)]:[]};
}
async function handleCollection(i){
 await i.deferReply({flags:EP});
 const target=i.options.getUser('joueur')||i.user,album=i.options.getString('album')||'classique';
 const person=i.options.getString('personnage')||'',page=i.options.getInteger('page')||1;
 const token=nano();albums.set(token,{guild:i.guildId,viewer:i.user.id,target:target.id,name:target.username,album,person,page,created:Date.now()});
 const payload=await albumPayload(i.guildId,target.id,album,person,page,target.username,token);
 const st=albums.get(token);st.page=Math.min(page,(await collectData(i.guildId,target.id,album,person,page)).max);
 await i.editReply(payload);
}
async function pageAlbum(i,token,action){
 const a=albums.get(token);if(!a||a.guild!==i.guildId||a.viewer!==i.user.id||Date.now()-a.created>900000)err('Cet album a expiré. Relance /collection.');
 await i.deferUpdate();a.page=Math.max(1,a.page+(action==='next'?1:-1));
 const payload=await albumPayload(i.guildId,a.target,a.album,a.person,a.page,a.name,token);
 const inf=await collectData(i.guildId,a.target,a.album,a.person,a.page);a.page=inf.page;
 await i.editReply({...payload,attachments:[]});
}
async function lookupCardOffer(db,guild,items){
 const out=[];
 for(const it of items){const c=await getCard(guild,it.code,false,db);if(!c)err(`Carte inconnue : ${it.code}`);out.push({...it,id:c.id,title:c.title,tier:c.tier});}
 return out;
}
async function verifyCards(db,guild,user,items){
 if(!items.length)return [];
 const enriched=await lookupCardOffer(db,guild,items);
 for(const it of enriched){
  const {rows}=await db.query('SELECT quantity FROM ldh_inventory WHERE guild_id=$1 AND user_id=$2 AND card_id=$3',[guild,user,it.id]);
  const n=rows[0]?.quantity||0;
  if(n<it.qty)err(`${user} ne possède pas ${it.qty} exemplaire(s) de ${it.code} (actuellement ${n}).`);
  it.last=n===it.qty;
 }
 return enriched;
}
function tradeText(t,offer,request){
 return `🤝 **Proposition d’échange #${t.id}**\n**<@${t.from_user}> propose :**\n${offer.map(formatLine).join('\n')||'Aucune carte'}\n**À <@${t.to_user}> contre :**\n${request.map(formatLine).join('\n')||'Aucune carte'}\n⏳ Valable 24 heures. Les deux inventaires sont vérifiés à la confirmation.`;
}
function modalField(id,label,required=true){return new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setRequired(required).setStyle(TextInputStyle.Paragraph).setMaxLength(400).setPlaceholder('Ex : C-00001 x2, P-00006'));}
async function startTrade(i){
 const target=i.options.getUser('membre',true);
 if(target.bot||target.id===i.user.id)err('Choisis un autre membre humain.');
 const modal=new ModalBuilder().setCustomId(`ldh:offer:${target.id}`).setTitle('🤝 Proposer un échange');
 modal.addComponents(modalField('offer','Mes cartes à offrir (codes + quantité)'),modalField('request','Cartes demandées (ou « aucune »)',false));
 await i.showModal(modal);
}
async function offerModal(i,to){
 await i.deferReply({flags:EP});
 const offer=parseItems(i.fields.getTextInputValue('offer'));
 const request=parseItems(i.fields.getTextInputValue('request'));
 if(!offer.length)err('Propose au moins une carte.');
 const preview=await transaction(async db=>{
  await lock(db,i.guildId);
  const mine=await verifyCards(db,i.guildId,i.user.id,offer);
  const theirs=await lookupCardOffer(db,i.guildId,request);
  const q=await db.query('INSERT INTO ldh_trades(guild_id,from_user,to_user,offer,request) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id',[i.guildId,i.user.id,to,JSON.stringify(offer),JSON.stringify(request)]);
  return {id:q.rows[0].id,mine,theirs};
 });
 const warning=preview.mine.filter(x=>x.last).map(x=>x.code);
 await i.editReply({content:`**Vérifie la proposition #${preview.id} avant envoi :**\n**Tu offres :** ${preview.mine.map(formatLine).join(' · ')}\n**Tu demandes :** ${preview.theirs.map(formatLine).join(' · ')||'Rien'}\n${warning.length?`⚠️ **Attention :** tu offres ton dernier exemplaire de ${warning.join(', ')}. Ces cartes quitteront ta collection si l’échange est accepté.\n`:''}Aucune carte n’a encore changé de propriétaire.`,components:[rowButtons([{id:`ldh:trade:send:${preview.id}`,label:'📨 Envoyer la proposition',style:ButtonStyle.Primary},{id:`ldh:trade:cancel:${preview.id}`,label:'Annuler',style:ButtonStyle.Danger}])]});
}
async function getTrade(db,guild,id,lockRow=false){const {rows}=await db.query(`SELECT * FROM ldh_trades WHERE id=$1 AND guild_id=$2${lockRow?' FOR UPDATE':''}`,[id,guild]);if(!rows[0])err('Proposition introuvable.');return rows[0];}
async function tradeChannel(i){
 const {rows}=await usePool().query('SELECT trade_channel FROM ldh_config WHERE guild_id=$1',[i.guildId]);
 const id=rows[0]?.trade_channel||i.channelId;
 const ch=await botClient.channels.fetch(id);
 if(!ch?.send)err('Salon inaccessible. Configure /cartes configurer-echanges dans un salon public.');
 return ch;
}
async function sendTrade(i,id){
 await i.deferReply({flags:EP});
 const ch=await tradeChannel(i);
 const row=await transaction(async db=>{
  await lock(db,i.guildId);
  const t=await getTrade(db,i.guildId,id,true);
  if(t.from_user!==i.user.id||t.status!=='draft')err('Cette proposition est déjà envoyée ou annulée.');
  const mine=await verifyCards(db,i.guildId,i.user.id,t.offer);
  const theirs=await lookupCardOffer(db,i.guildId,t.request);
  const content=((await getMode(i.guildId,db)).mode==='test'?'🧪 **ÉCHANGE DE TEST — SERA EFFACÉ AU LANCEMENT**\n':'')+tradeText(t,mine,theirs);
  const pics=await getImages(i.guildId,[...mine,...theirs].map(x=>x.id),db);
  const first=pics.slice(0,mine.length),second=pics.slice(mine.length);
  while(first.length<5)first.push({missing:true,tier:'commune',title:'—'});
  while(second.length<5)second.push({missing:true,tier:'commune',title:'—'});
  const artwork=await panel([...first,...second],{title:`Échange #${id}`,subtitle:'1re ligne : cartes offertes · 2e ligne : cartes demandées',columns:5});
  const message=await ch.send({content,files:[new AttachmentBuilder(artwork,{name:'proposition-echange.png'})],components:[rowButtons([{id:`ldh:trade:accept:${id}`,label:'✅ Accepter',style:ButtonStyle.Success},{id:`ldh:trade:reject:${id}`,label:'Refuser',style:ButtonStyle.Danger}])],allowedMentions:{parse:[],users:[t.to_user]}});
  await db.query('UPDATE ldh_trades SET status=$1,channel_id=$2,message_id=$3 WHERE id=$4',['pending',ch.id,message.id,id]);
  return t;
 });
 await i.editReply(`📨 **Proposition #${id} envoyée à <@${row.to_user}> !** Visible dans <#${ch.id}>.`);
}
async function cancelOrReject(i,id,isReject=false){
 await i.deferReply({flags:EP});
 await transaction(async db=>{
  await lock(db,i.guildId);
  const t=await getTrade(db,i.guildId,id,true);
  const allowed=isReject?t.to_user:t.from_user;
  if(allowed!==i.user.id)err('Tu ne peux pas modifier la proposition d’un autre joueur.');
  if(!['draft','pending'].includes(t.status))err('Cette proposition est déjà close.');
  await db.query('UPDATE ldh_trades SET status=$1,closed_at=now() WHERE id=$2',[isReject?'refused':'cancelled',id]);
 });
 await i.editReply(`✅ Proposition #${id} ${isReject?'refusée':'annulée'}.`);
}
async function askAccept(i,id){
 await i.deferReply({flags:EP});
 const t=await getTrade(usePool(),i.guildId,id);
 if(t.to_user!==i.user.id)err('Seul le membre destinataire peut accepter cet échange.');
 if(t.status!=='pending'||Date.parse(t.expires_at)<Date.now())err('Proposition expirée ou déjà traitée.');
 const his=await lookupCardOffer(usePool(),i.guildId,t.offer);
 const mine=await verifyCards(usePool(),i.guildId,i.user.id,t.request);
 const last=mine.filter(x=>x.last).map(x=>x.code);
 await i.editReply({content:`🤝 **Confirmer l’échange #${id} ?**\n**Tu reçois :** ${his.map(formatLine).join(' · ')}\n**Tu cèdes :** ${mine.map(formatLine).join(' · ')||'Aucune carte'}\n${last.length?`⚠️ Tu vas perdre ton dernier exemplaire de ${last.join(', ')}.\n`:''}Les deux inventaires seront vérifiés une dernière fois.`,components:[rowButtons([{id:`ldh:trade:confirm:${id}`,label:'✅ Confirmer définitivement',style:ButtonStyle.Success},{id:`ldh:trade:reject:${id}`,label:'Refuser',style:ButtonStyle.Danger}])]});
}
async function finalAccept(i,id){
 await i.deferReply({flags:EP});
 const trade=await transaction(async db=>{
  await lock(db,i.guildId);
  const t=await getTrade(db,i.guildId,id,true);
  if(t.to_user!==i.user.id)err('Tu n’es pas le destinataire de l’échange.');
  if(t.status!=='pending'||Date.parse(t.expires_at)<Date.now())err('Échange déjà traité ou expiré.');
  const from=await verifyCards(db,i.guildId,t.from_user,t.offer),to=await verifyCards(db,i.guildId,t.to_user,t.request);
  for(const c of from){await db.query('UPDATE ldh_inventory SET quantity=quantity-$1 WHERE guild_id=$2 AND user_id=$3 AND card_id=$4',[c.qty,i.guildId,t.from_user,c.id]);await addInventory(db,i.guildId,t.to_user,c.id,c.qty);}
  for(const c of to){await db.query('UPDATE ldh_inventory SET quantity=quantity-$1 WHERE guild_id=$2 AND user_id=$3 AND card_id=$4',[c.qty,i.guildId,t.to_user,c.id]);await addInventory(db,i.guildId,t.from_user,c.id,c.qty);}
  await db.query('UPDATE ldh_trades SET status=$1,closed_at=now() WHERE id=$2',['accepted',id]);
  return t;
 });
 try{if(trade.message_id&&trade.channel_id){const c=await botClient.channels.fetch(trade.channel_id);const m=await c?.messages.fetch(trade.message_id);await m?.edit({content:`✅ **Échange #${id} terminé !** Les cartes ont été transférées entre <@${trade.from_user}> et <@${trade.to_user}>.`,components:[],...noMentions});}}catch(e){console.warn('Échange enregistré, impossible de mettre à jour le message :',e.message);}
 return i.editReply(`✅ **Échange #${id} effectué !** Les cartes ont été transférées et les albums mis à jour.`);
}
async function handleEchange(i){
 const sub=i.options.getSubcommand();
 if(sub==='proposer')return startTrade(i);
 await i.deferReply({flags:EP});
 if(sub==='annuler'){
  const id=i.options.getInteger('numero',true);
  // Interaction déjà différée : utiliser une routine qui ne rediffère pas.
  await transaction(async db=>{await lock(db,i.guildId);const t=await getTrade(db,i.guildId,id,true);if(t.from_user!==i.user.id)err('Tu ne peux annuler que tes échanges.');if(!['draft','pending'].includes(t.status))err('Échange déjà clos.');await db.query('UPDATE ldh_trades SET status=$1,closed_at=now() WHERE id=$2',['cancelled',id]);});
  return i.editReply(`✅ Proposition #${id} annulée.`);
 }
 const {rows}=await usePool().query(`SELECT id,from_user,to_user,status,created_at FROM ldh_trades WHERE guild_id=$1 AND (from_user=$2 OR to_user=$2) AND status<>'draft' ORDER BY id DESC LIMIT 15`,[i.guildId,i.user.id]);
 return i.editReply(`🤝 **Tes 15 derniers échanges :**\n${rows.map(t=>`#${t.id} · ${t.from_user===i.user.id?'envoyé':'reçu'} · **${t.status}** · <@${t.from_user===i.user.id?t.to_user:t.from_user}>`).join('\n')||'Aucun échange.'}`);
}
async function findOwners(i){
 await i.deferReply({flags:EP});const code=i.options.getString('code',true);
 const card=await getCard(i.guildId,code);if(!card)err('Code introuvable.');
 const {rows}=await usePool().query('SELECT user_id,quantity FROM ldh_inventory WHERE guild_id=$1 AND card_id=$2 AND quantity>0 ORDER BY quantity DESC LIMIT 20',[i.guildId,card.id]);
 return i.editReply(`🔎 **${card.code} · ${safe(card.title)} · ${humanTier(card.tier)}**\n${rows.map(r=>`<@${r.user_id}> — **${r.quantity} exemplaire(s)**`).join('\n')||'Personne ne possède cette carte pour le moment.'}`);
}
async function rank(i){
 await i.deferReply({flags:EP});
 const {rows}=await usePool().query(`SELECT user_id,COUNT(*) FILTER(WHERE quantity>0)::int AS uniques,SUM(quantity)::int AS total,
 COUNT(*) FILTER(WHERE quantity>0 AND card_id IN (SELECT id FROM ldh_cards WHERE guild_id=$1 AND tier='prestige'))::int AS prestiges
 FROM ldh_inventory WHERE guild_id=$1 GROUP BY user_id ORDER BY uniques DESC,total DESC LIMIT 15`,[i.guildId]);
 return i.editReply(`🏆 **Classement des collectionneurs**\n${rows.map((r,j)=>`${j+1}. <@${r.user_id}> — **${r.uniques} différentes**, ${r.total} exemplaires, ${r.prestiges} Prestige`).join('\n')||'Aucun collectionneur pour le moment.'}`);
}
async function handle(i){
 try{
  if(!i.guildId)return;
  // Blocage SERVEUR entier avant le lancement, ou tout sauf Esty/Tropi en période de test.
  // Les commandes /cartes restent réservées à leur contrôle interne (catalogue / lancement).
  const state=await getMode(i.guildId);
  const isCardsAdmin=i.isChatInputCommand()&&i.commandName==='cartes';
  if(!isCardsAdmin&&!mayPlay(state,i.user.id)){
   const message=state.mode==='test'?'🧪 Les Drôles de Cartes sont en test privé avec Esty et Tropi. Le lancement officiel arrive !':'🔒 Les Drôles de Cartes ne sont pas encore ouvertes. Esty prépare le lancement !';
   return i.reply(privateText(message));
  }
  if(i.isChatInputCommand()){ 
   if(i.commandName==='cartes')return await cardCommand(i,i.options.getSubcommand());
   if(i.commandName==='booster')return await handleBooster(i);
   if(i.commandName==='collection')return await handleCollection(i);
   if(i.commandName==='echange')return await handleEchange(i);
   if(i.commandName==='carte')return await findOwners(i);
   if(i.commandName==='classement-cartes')return await rank(i);
   return;
  }
  if(i.isModalSubmit()&&i.customId.startsWith('ldh:test:submit:'))return await finishTest(i,i.customId.split(':')[3]);
  if(i.isModalSubmit()&&i.customId.startsWith('ldh:offer:'))return await offerModal(i,i.customId.split(':')[2]);
  if(i.isButton()&&i.customId.startsWith('ldh:')){
   const [_,type,action,id]=i.customId.split(':');
   if(type==='test'&&action==='finish')return await showResetModal(i,id);
   if(type==='import')return await commitImport(i,action,id);
   if(type==='share')return await shareBooster(i,action);
   if(type==='album')return await pageAlbum(i,action,id);
   if(type==='trade'){
    if(action==='send')return await sendTrade(i,id);
    if(action==='cancel')return await cancelOrReject(i,id);
    if(action==='reject')return await cancelOrReject(i,id,true);
    if(action==='accept')return await askAccept(i,id);
    if(action==='confirm')return await finalAccept(i,id);
   }
  }
 }catch(e){
  console.error('❌ Les Drôles de Cartes:',e);
  const message=`❌ ${String(e.message||'Erreur inconnue').slice(0,600)}`;
  try{if(i.deferred)await i.editReply({content:message,components:[],attachments:[]});else if(i.replied)await i.followUp(privateText(message));else await i.reply(privateText(message));}
  catch(x){console.error('Impossible de signaler erreur cartes :',x.message);}
 }
}
module.exports={commands,init,handle};
