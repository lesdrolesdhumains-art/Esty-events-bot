'use strict';
/**
 * Les Problèmes d’Esty : UN bouton, UN tirage aléatoire de dossier PostgreSQL.
 * Les anciennes vérités et gages ne sont pas chargés ni utilisés.
 * Compatibilité : le panneau « estywheel:spin » de l'ancienne roue reste cliquable.
 */
const crypto = require('node:crypto');
const db = require('./db');
const store = require('./wheel-db');
const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, AttachmentBuilder
} = require('discord.js');

const SIZE = 400;
const WHEEL_R = 161;
const CENTER_X = SIZE/2;
const CENTER_Y = 202;
const SLICES = 12;
const command = new SlashCommandBuilder()
  .setName('roue').setDescription('🎡 Les problèmes d’Esty : un tour = un problème')
  .addSubcommand(s=>s.setName('installer').setDescription('Publier la roue et son bouton dans le salon'))
  .addSubcommand(s=>s.setName('statut').setDescription('Voir combien de problèmes restent à tirer'))
  .addSubcommand(s=>s.setName('acces').setDescription('Choisir qui peut faire tourner la roue')
    .addStringOption(o=>o.setName('mode').setDescription('Accès au bouton').setRequired(true)
      .addChoices({name:'👑 Esty seulement',value:'prive'},{name:'🎉 Tous les membres',value:'tous'})))
  .addSubcommand(s=>s.setName('fermer').setDescription('Fermer les panneaux de la roue'))
  .addSubcommand(s=>s.setName('aide').setDescription('Rappel des commandes et du fonctionnement'));

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let busy=false;
async function findWheelCards(client){
  const channel=await client.channels.fetch(process.env.ANIMATION_CHANNEL_ID);
  if(!channel?.messages?.fetch) throw new Error('Salon d’animation inaccessible ou sans permission de lire les messages.');
  const messages=await channel.messages.fetch({limit:100});
  const cards=[...messages.values()].filter(m=>m.author?.id===client.user.id &&
    m.components?.some(row=>row.components?.some(c=>c.customId==='estywheel:spin')));
  return {channel,cards};
}

const PALETTE = [
  [16, 10, 34],   // 0 fond
  [37, 23, 65],   // 1 ombre
  [244, 201, 110],// 2 doré
  [255, 246, 226],// 3 blanc cassé
  [226, 66, 147], // 4 rose
  [135, 77, 215], // 5 violet
  [49, 179, 169], // 6 turquoise
  [255, 155, 202],// 7 rose clair
  [191, 158, 255],// 8 violet clair
  [136, 240, 223],// 9 turquoise clair
  [245, 176, 74], // 10 or foncé
  [72, 47, 99],   // 11 détail
  [28, 18, 48],   // 12 bordure foncée
  [255, 220, 161],// 13 reflet
  [116, 94, 146], // 14 secondaire
  [250, 228, 203] // 15 nuances
];

// Mini-police interne : zéro font / zéro bibliothèque à installer.
const FONT = {
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'B':['11110','10001','10001','11110','10001','10001','11110'],
  'D':['11110','10001','10001','10001','10001','10001','11110'],
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'G':['01111','10000','10000','10111','10001','10001','01111'],
  'I':['11111','00100','00100','00100','00100','00100','11111'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'M':['10001','11011','10101','10101','10001','10001','10001'],
  'O':['01110','10001','10001','10001','10001','10001','01110'],
  'P':['11110','10001','10001','11110','10000','10000','10000'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'V':['10001','10001','10001','10001','10001','01010','00100'],
  'Y':['10001','10001','01010','00100','00100','00100','00100'],
  'U':['10001','10001','10001','10001','10001','10001','01110'],
  'N':['10001','11001','10101','10011','10001','10001','10001'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  '?':['01110','10001','00001','00010','00100','00000','00100'],
  '!':['00100','00100','00100','00100','00100','00000','00100'],
  "'":['00100','00100','01000','00000','00000','00000','00000'],
  'È':['00100','00010','11111','10000','11110','10000','11111'],
  'É':['00100','01000','11111','10000','11110','10000','11111']
};
const TWOPI = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;

function put(pix, width, height, x, y, color) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < width && y < height) pix[y * width + x] = color;
}
function rect(pix, w, h, x0, y0, w0, h0, color) {
  for(let yy=y0; yy<y0+h0; yy++) for(let xx=x0;xx<x0+w0;xx++) put(pix,w,h,xx,yy,color);
}
function textOn(pix, w, h, content, x, y, size, color, angle=0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const tw = (content.length * 6 - 1) * size;
  const th = 7 * size;
  for(let z=0;z<content.length;z++) {
    const g = FONT[content[z]] || FONT[' '];
    for(let row=0; row<7; row++) for(let col=0; col<5; col++) {
      if(g[row][col] !== '1') continue;
      for(let dy=0;dy<size;dy++) for(let dx=0;dx<size;dx++) {
        const lx = (z*6+col)*size+dx-tw/2;
        const ly = row*size+dy-th/2;
        put(pix,w,h,x + lx*c-ly*s, y + lx*s+ly*c,color);
      }
    }
  }
}
function makeWheelBase() {
  // Douze secteurs identiques en fonction : ils représentent simplement des dossiers.
  // AUCUNE catégorie « Vérité » ou « Gage » sur la roue.
  const r = WHEEL_R, d = r * 2 + 2;
  const p = new Uint8Array(d * d).fill(0);
  const cx = d / 2, cy = d / 2;
  const sector = TWOPI / SLICES;
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    const dx = x - cx, dy = y - cy, distance = Math.hypot(dx, dy);
    if (distance > r + 1) continue;
    if (distance > r - 7) { p[y * d + x] = 2; continue; }
    if (distance > r - 11) { p[y * d + x] = 10; continue; }
    const angle = mod(Math.atan2(dx, -dy) + sector / 2, TWOPI);
    const index = Math.floor(angle / sector) % SLICES;
    const distanceToEdge = Math.min(mod(angle, sector), sector - mod(angle, sector));
    const col = [4, 5, 6, 7, 8, 9][index % 6];
    p[y * d + x] = (distanceToEdge < 0.018 && distance > 32) ? 3 : col;
  }
  for (let j = 0; j < SLICES; j++) {
    const angle = j * sector;
    const x = cx + 106 * Math.sin(angle), y = cy - 106 * Math.cos(angle);
    const letter = j % 3 === 0 ? '!' : '?';
    textOn(p, d, d, letter, x + 1, y + 1, 2, 12, angle);
    textOn(p, d, d, letter, x, y, 2, 3, angle);
  }
  // Moyeu central.
  for (let y = cy - 30; y <= cy + 30; y++) for (let x = cx - 30; x <= cx + 30; x++) {
    const dis = Math.hypot(x - cx, y - cy);
    if (dis < 29) p[Math.round(y) * d + Math.round(x)] = (dis > 23 ? 2 : (dis > 19 ? 12 : 1));
  }
  return {pixels:p, d, cx, cy};
}
const BASE = makeWheelBase();
function frame(rotation) {
  const pix=new Uint8Array(SIZE*SIZE).fill(0);
  // Fond et ornements
  for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) {
    if((x<12||x>SIZE-13||y<12||y>SIZE-13)) pix[y*SIZE+x]=1;
  }
  textOn(pix,SIZE,SIZE,"LES PROBLÈMES D'ESTY",CENTER_X,19,2,2);
  textOn(pix,SIZE,SIZE,'UN TOUR  UN DOSSIER',CENTER_X,387,2,14);
  for(let j=0;j<12;j++) {
    const a=j*TWOPI/12;
    const x=CENTER_X+177*Math.sin(a),y=CENTER_Y-177*Math.cos(a);
    for(let yy=-3;yy<=3;yy++)for(let xx=-3;xx<=3;xx++) {
      if(xx*xx+yy*yy<=9) put(pix,SIZE,SIZE,x+xx,y+yy,(j%3===0?3:2));
    }
  }
  const c=Math.cos(-rotation),s=Math.sin(-rotation);
  const d=BASE.d, r=WHEEL_R;
  for(let y=Math.floor(CENTER_Y-r-1);y<=Math.ceil(CENTER_Y+r+1);y++) {
    for(let x=Math.floor(CENTER_X-r-1);x<=Math.ceil(CENTER_X+r+1);x++) {
      const dx=x-CENTER_X,dy=y-CENTER_Y;
      if(dx*dx+dy*dy>(r+1)*(r+1)) continue;
      const sx=Math.round(BASE.cx+dx*c-dy*s);
      const sy=Math.round(BASE.cy+dx*s+dy*c);
      if(sx>=0 && sx<d && sy>=0 && sy<d) pix[y*SIZE+x]=BASE.pixels[sy*d+sx];
    }
  }
  // Flèche fixe en haut : pointe précisément à 12 h
  for(let y=34;y<=59;y++) {
    const halfWidth=Math.floor((y-34)*0.58);
    for(let x=CENTER_X-halfWidth;x<=CENTER_X+halfWidth;x++) put(pix,SIZE,SIZE,x,y,2);
  }
  textOn(pix,SIZE,SIZE,'ESTY',CENTER_X,202,2,3);
  return pix;
}

// Encodeur GIF89a (LZW pur JavaScript, aucune dépendance native).
function lzwEncode(pixelData,minSize=4) {
  const clear=1<<minSize, stop=clear+1;
  let codeSize=minSize+1, next=stop+1;
  const dict=new Map();
  const bytes=[]; let acc=0,bits=0;
  function emit(code) {
    acc |= code<<bits; bits+=codeSize;
    while(bits>=8) {bytes.push(acc&255);acc>>>=8;bits-=8;}
  }
  emit(clear);
  let w=pixelData[0];
  for(let pos=1;pos<pixelData.length;pos++) {
    const k=pixelData[pos];
    const key=(w<<4)|k;
    const v=dict.get(key);
    if(v!==undefined) { w=v;continue; }
    emit(w);
    if(next<4096) {
      dict.set(key,next++);
      if(next > (1<<codeSize) && codeSize<12) codeSize++;
    } else {
      emit(clear);
      dict.clear();codeSize=minSize+1;next=stop+1;
    }
    w=k;
  }
  emit(w); emit(stop);
  if(bits>0) bytes.push(acc&255);
  return Buffer.from(bytes);
}
function makeGif() {
  // Une roue 100 % problèmes : l'arrêt est visuellement aléatoire,
  // le vrai dossier est tiré au hasard dans PostgreSQL.
  const nb=23;
  const total=TWOPI*4 + crypto.randomInt(0, 360) * (Math.PI / 180);
  const out=[];
  const push=(...values)=>{out.push(Buffer.from(values));};
  const u16=n=>[n&255,(n>>8)&255];
  push(...Buffer.from('GIF89a','ascii'));
  push(...u16(SIZE),...u16(SIZE),0xF3,0,0);
  push(...PALETTE.flat());
  for(let f=0;f<nb;f++) {
    const t=f/(nb-1), eased=1-Math.pow(1-t,3.4);
    // La dernière image reste affichée : pas de boucle infinie.
    const angle=total*eased;
    const img=frame(angle);
    const delay=(f===nb-1)?120:((f>nb-5)?12:7);
    push(0x21,0xF9,4,0,...u16(delay),0,0);
    push(0x2C,0,0,0,0,...u16(SIZE),...u16(SIZE),0);
    push(4);
    const raw=lzwEncode(img,4);
    for(let k=0;k<raw.length;k+=255) {
      const block=raw.subarray(k,Math.min(k+255,raw.length));
      push(block.length);
      out.push(block);
    }
    push(0);
  }
  push(0x3B);
  return Buffer.concat(out);
}

function button(disabled=false){
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('estywheel:spin').setLabel('🎡 Faire tourner les problèmes')
      .setStyle(ButtonStyle.Primary).setDisabled(disabled)
  )];
}
const privateReply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
function description(settings){
  return '# 🎡 LES PROBLÈMES D’ESTY\n'
    + '💣 **Une roue. Un tirage. Un problème surprise !**\n\n'
    + 'Clique sur **🎡 Faire tourner les problèmes** : la roue s’anime, s’arrête, et un dossier secret est révélé au hasard.\n'
    + (settings.mode==='tous'?'🎉 Tous les membres peuvent lancer la roue.':'👑 Esty contrôle le bouton.')
    + '\n\n💗 Les personnes citées peuvent passer ; les dossiers ne sont pas des accusations.';
}
async function updateCards(client,settings){
  const {cards}=await findWheelCards(client);
  let count=0;
  for(const m of cards) try{await m.edit({content:description(settings),components:button(),allowedMentions:{parse:[]}});count++;}catch(e){console.warn('Mise à jour roue :',e.message);}
  return count;
}
async function handle(i,{guildId,ownerId,client}){
  const isCmd=i.isChatInputCommand()&&i.commandName==='roue';
  const isButton=i.isButton()&&i.customId==='estywheel:spin';
  if(!isCmd&&!isButton)return false;
  if(i.guildId!==guildId){await privateReply(i,'🔒 Ce jeu est réservé au serveur Les Drôles d’Humains.');return true;}
  if(isCmd){
    if(i.user.id!==ownerId){await privateReply(i,'👑 Ces commandes sont réservées à Esty.');return true;}
    const sub=i.options.getSubcommand();
    if(busy&&['fermer'].includes(sub)){await privateReply(i,'⏳ La roue tourne déjà.');return true;}
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if(sub==='installer'){
      const {cards,channel}=await findWheelCards(client);
      if(cards.length){await updateCards(client,await store.settings(guildId));await i.editReply('🎡 Roue déjà installée : panneau mis à jour avec la nouvelle version **100 % problèmes**. Réutilise son bouton !');return true;}
      const settings=await store.settings(guildId);
      await channel.send({content:description(settings),components:button(),allowedMentions:{parse:[]}});
      await i.editReply(`✅ Roue publiée dans <#${channel.id}>. Clique sur son bouton pour tirer un problème !`);return true;
    }
    if(sub==='statut'){
      const [settings,counts]=await Promise.all([store.settings(guildId),store.problemStats(guildId)]);
      await i.editReply(`🎡 **Les problèmes d’Esty**\n💣 Dossiers au total : **${counts.total}**\n🗃️ Encore à tirer : **${counts.pending}**\n🎯 Déjà réservé : **${counts.selected}**\n✅ Déjà sortis : **${counts.revealed}**\n👑 Accès : **${settings.mode==='prive'?'Esty':'tout le serveur'}**\n\nQuand la pioche est vide : \`/probleme recommencer confirmation:RECOMMENCER\`.`);
      return true;
    }
    if(sub==='acces'){
      const mode=i.options.getString('mode',true);
      await store.setMode(guildId,mode);
      await updateCards(client,await store.settings(guildId));
      await i.editReply(`✅ La roue est accessible à : ${mode==='prive'?'Esty uniquement':'tous les membres'}.`);return true;
    }
    if(sub==='fermer'){
      const {cards}=await findWheelCards(client);
      let count=0;
      for(const m of cards){await m.edit({content:'🔒 **Les problèmes d’Esty : roue fermée.**',components:[]});count++;}
      await i.editReply(`🔒 ${count} panneau(x) fermé(s). Si un panneau a plus de 100 messages, supprime-le manuellement.`);return true;
    }
    if(sub==='aide'){
      await i.editReply('**🎡 Les problèmes d’Esty**\n1. \`/probleme ajouter\` pour enregistrer des dossiers.\n2. \`/roue installer\` pour afficher le bouton.\n3. Un clic = animation + problème tiré au sort et affiché automatiquement.\n\n**Commandes roue :** \`/roue installer\`, \`/roue statut\`, \`/roue acces\`, \`/roue fermer\`, \`/roue aide\`.\n**Pioche épuisée :** \`/probleme recommencer confirmation:RECOMMENCER\`.\nAucune vérité, aucun gage, aucune désignation de joueur nécessaire.');return true;
    }
    return true;
  }
  const settings=await store.settings(guildId);
  if(settings.mode==='prive'&&i.user.id!==ownerId){await privateReply(i,'👑 Seule Esty peut faire tourner la roue.');return true;}
  if(busy){await privateReply(i,'⏳ La roue tourne déjà !');return true;}
  busy=true;
  let disabled=false;
  try{
    await i.deferUpdate();
    // Rend le bouton temporairement inactif pour éviter les doubles clics.
    await i.message.edit({components:button(true)});disabled=true;
    const counts=await store.problemStats(guildId);
    if(counts.pending+counts.selected===0){
      await i.followUp({content:counts.total?'📭 Tous les problèmes sont passés ! Recommence la pioche avec `/probleme recommencer confirmation:RECOMMENCER`.':'📭 Aucun problème enregistré. Ajoute-en avec `/probleme ajouter`.',flags:MessageFlags.Ephemeral});
      return true;
    }
    // Réservation privée de l’aléa en base ; l'animation ne montre jamais le texte avant son arrêt.
    const p=await db.drawProblem(guildId);
    if(!p){await i.followUp({content:'📭 La pioche est vide.',flags:MessageFlags.Ephemeral});return true;}
    const gif=makeGif();
    if(gif.length>7_500_000)throw new Error('Animation GIF trop volumineuse.');
    await i.channel.send({content:'# 🎡 LES PROBLÈMES D’ESTY\n💣 **La roue tourne... Quel dossier va sortir ?**',files:[new AttachmentBuilder(gif,{name:'les-problemes-d-esty.gif'})],allowedMentions:{parse:[]}});
    await sleep(3100);
    const mention=p.target?`🎯 **Personne visée :** ${p.target}\n`:'';
    const body=`# 💣 BIM ! LE PROBLÈME EST TOMBÉ !\n**Dossier #${p.id}**\n${mention}\n${p.question}\n\n🎤 Place aux explications... ou au joker ! 💗`;
    await i.channel.send({content:body,allowedMentions:{parse:[]}});
    await db.revealProblem(guildId,p.id);
  }catch(err){
    console.error('❌ Roue :',err);
    try{await i.followUp({content:'❌ Problème pendant le tirage : '+String(err.message).slice(0,180)+'\nSi un dossier a été réservé sans être affiché, utilise `/probleme remettre`.',flags:MessageFlags.Ephemeral});}catch{}
  }finally{
    if(disabled){try{await i.message.edit({components:button()});}catch(e){console.warn('Bouton :',e.message);}}
    busy=false;
  }
  return true;
}
module.exports={command,handle,makeGif,button,isBusy:()=>busy};
