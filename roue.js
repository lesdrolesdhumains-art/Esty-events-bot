'use strict';
/**
 * 🎡 La Roue des Problèmes d'Esty — Les Drôles d'Humains
 * Module autonome, sans dépendance supplémentaire.
 * Commandes : /roue installer, /roue acces, /roue fermer
 * Le bot existant ajoute « roue.command » à l'enregistrement Discord
 * et appelle « await roue.handle(i, {guildId, ownerId, client}) ».
 */
const crypto = require('node:crypto');
const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, AttachmentBuilder
} = require('discord.js');

const SIZE = 400;
const WHEEL_R = 161;
const CENTER_X = SIZE / 2;
const CENTER_Y = 202;
const SEGMENTS = [
  { label: 'PROBLEME', name: '💣 Problème visé', color: 4, hint: 'Esty peut tirer un dossier avec `/probleme tirer`, puis décider de le révéler avec `/probleme reveler`.' },
  { label: 'VERITE', name: '👀 Vérité', color: 5, hint: 'Esty pose une question vérité à la personne désignée. Elle peut passer.' },
  { label: 'GAGE', name: '😈 Gage', color: 6, hint: 'Esty propose un petit défi drôle, toujours facultatif.' },
];

const command = new SlashCommandBuilder()
  .setName('roue')
  .setDescription('🎡 Contrôler la roue animée des Problèmes d’Esty')
  .addSubcommand(s => s.setName('installer').setDescription('Installer le bouton de la roue dans le salon d’animation'))
  .addSubcommand(s => s.setName('acces').setDescription('Choisir qui peut faire tourner la roue')
    .addStringOption(o => o.setName('mode').setDescription('Qui peut cliquer ?').setRequired(true)
      .addChoices({ name: '👑 Esty seulement', value: 'prive' }, { name: '🎉 Tous les membres', value: 'tous' })))
  .addSubcommand(s => s.setName('fermer').setDescription('Désactiver la roue et retirer son bouton'));

// Choix volontaire : Esty seule par défaut, après chaque redémarrage.
let mode = 'prive';
let busy = false;
// Le bot peut retrouver les roues encore visibles même après un redémarrage.
async function findWheelCards(client) {
  const channel = await client.channels.fetch(process.env.ANIMATION_CHANNEL_ID);
  if (!channel?.messages?.fetch) throw new Error('Impossible de lire les messages du salon d’animation.');
  const messages = await channel.messages.fetch({limit:100});
  const cards = [...messages.values()].filter(m =>
    m.author?.id === client.user.id &&
    m.components?.some(row => row.components?.some(c => c.customId === 'estywheel:spin'))
  );
  return {channel, cards};
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
  ' ':['00000','00000','00000','00000','00000','00000','00000']
};
const TWOPI = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const r = WHEEL_R, d=r*2+2;
  const p = new Uint8Array(d*d).fill(0);
  const cx=d/2, cy=d/2;
  const sector = TWOPI/3;
  for (let y=0;y<d;y++) for(let x=0;x<d;x++) {
    const dx=x-cx,dy=y-cy, distance=Math.hypot(dx,dy);
    if(distance>r+1) continue;
    if(distance>r-7) {p[y*d+x]=2;continue;}
    if(distance>r-11) {p[y*d+x]=10;continue;}
    const angle=mod(Math.atan2(dx,-dy)+sector/2,TWOPI);
    const index=Math.floor(angle/sector)%3;
    const lineDistance=Math.min(mod(angle,sector), sector-mod(angle,sector));
    let col=SEGMENTS[index].color;
    if(lineDistance < 0.028 && distance>30) col=3;
    else if(distance>r-31) col=col+3;
    p[y*d+x]=col;
  }
  // Les textes font physiquement partie de la roue : ils tournent avec elle.
  for(let i=0;i<3;i++) {
    const angle=i*sector;
    const x=cx+98*Math.sin(angle), y=cy-98*Math.cos(angle);
    textOn(p,d,d,SEGMENTS[i].label,x+1,y+2,2,12,angle);
    textOn(p,d,d,SEGMENTS[i].label,x,y,2,3,angle);
  }
  // Moyeu central
  for(let y=cy-30;y<=cy+30;y++) for(let x=cx-30;x<=cx+30;x++) {
    const dis=Math.hypot(x-cx,y-cy);
    if(dis<29) p[Math.round(y)*d+Math.round(x)]=(dis>23?2:(dis>19?12:1));
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
  textOn(pix,SIZE,SIZE,'LES PROBLEMES',CENTER_X,19,2,2);
  textOn(pix,SIZE,SIZE,'ESTY EVENTS',CENTER_X,387,2,14);
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
function makeGif(winner) {
  // 4 tours, ralentissement progressif et arrêt déterministe sur la catégorie tirée.
  const nb=23;
  const total=TWOPI*4 - winner*(TWOPI/3);
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

function button(disabled=false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('estywheel:spin').setLabel('🎡 Faire tourner la roue')
      .setStyle(ButtonStyle.Primary).setDisabled(disabled)
  )];
}
function modeText() { return mode==='prive'?'👑 Seule Esty peut cliquer.':'🎉 Tous les membres peuvent cliquer.'; }
const replyPrivate=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral});
function description() {
  return '# 🎡 LA ROUE DES PROBLÈMES D’ESTY\n'
    + '💣 **Problème visé** • 👀 **Vérité** • 😈 **Gage**\n\n'
    + `${modeText()}\n` + 'Clique sur le bouton pour découvrir le prochain défi ! 🍿';
}
async function handle(i, { guildId, ownerId, client }) {
  const isCmd=i.isChatInputCommand() && i.commandName==='roue';
  const isButton=i.isButton() && i.customId==='estywheel:spin';
  if(!isCmd&&!isButton) return false;
  if(i.guildId!==guildId) {await replyPrivate(i,'🔒 Cette roue est réservée au serveur Les Drôles d’Humains.');return true;}
  if(isCmd) {
    if(i.user.id!==ownerId) {await replyPrivate(i,'👑 Cette commande est réservée à Esty.');return true;}
    const sub=i.options.getSubcommand();
    if(sub==='installer') {
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const channel=await client.channels.fetch(process.env.ANIMATION_CHANNEL_ID);
      if(!channel?.isTextBased()||typeof channel.send!=='function') throw new Error('Salon ANIMATION_CHANNEL_ID inaccessible.');
      const m=await channel.send({content:description(),components:button(),allowedMentions:{parse:[]}});
      await i.editReply(`✅ Roue installée dans <#${channel.id}> ! Le bouton est prêt. 🎡`);
      return true;
    }
    if(sub==='acces') {
      await i.deferReply({flags:MessageFlags.Ephemeral});
      mode=i.options.getString('mode')==='tous'?'tous':'prive';
      let updated=0;
      try {
        const {cards}=await findWheelCards(client);
        for(const m of cards) {await m.edit({content:description()});updated++;}
      }catch(err) {console.warn('Cartes roue non actualisées :',err.message);}
      await i.editReply(`✅ Nouveau mode : ${modeText()}\n${updated} panneau(x) actualisé(s). Mode Esty seule au redémarrage.`);
      return true;
    }
    if(sub==='fermer') {
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const {cards}=await findWheelCards(client);
      let count=0;
      for(const m of cards) {
        try {await m.edit({components:[],content:'🔒 **La roue des problèmes est fermée.**'});count++;}
        catch(e) {console.warn('Roue non désactivée :',e.message);}
      }
      await i.editReply(count?`🔒 ${count} roue(s) désactivée(s) !`:'🔒 Aucune roue trouvée parmi les 100 derniers messages du salon. Supprime un éventuel ancien panneau manuellement.');
      return true;
    }
    return true;
  }
  if(mode==='prive' && i.user.id!==ownerId) {await replyPrivate(i,'👑 Seule Esty peut faire tourner cette roue pour le moment.');return true;}
  if(busy) {await replyPrivate(i,'⏳ La roue tourne déjà ! Attends le résultat.');return true;}
  busy=true;
  let marked=false;
  try {
    await i.deferUpdate();
    await i.message.edit({components:button(true)});
    marked=true;
    const winner=crypto.randomInt(0,3);
    const gif=makeGif(winner);
    if(gif.length>7_500_000) throw new Error('Fichier GIF trop volumineux.');
    await i.channel.send({
      content:`# 🎡 LA ROUE TOURNE !\n${i.user} a lancé la roue des problèmes… 🍿`,
      files:[new AttachmentBuilder(gif,{name:'roue-esty.gif'})],
      allowedMentions:{parse:[]}
    });
    // Le GIF s'arrête sur la catégorie, puis le résultat arrive en clair.
    await sleep(3100);
    await i.channel.send({
      content:`# 🎉 LA ROUE A CHOISI…\n## ${SEGMENTS[winner].name.toUpperCase()} !\n${SEGMENTS[winner].hint}\n\n🎤 **Esty, c’est à toi !**`,
      allowedMentions:{parse:[]}
    });
  } catch(err) {
    console.error('❌ Roue des problèmes:',err);
    try {await i.followUp({content:'❌ La roue a rencontré une erreur : '+String(err.message).slice(0,180),flags:MessageFlags.Ephemeral});} catch {}
  } finally {
    if(marked) {
      try {await i.message.edit({components:button()});}catch(e) {console.warn('Bouton roue:',e.message);}
    }
    busy=false;
  }
  return true;
}
module.exports={command,handle,makeGif,button};
