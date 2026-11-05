'use strict';
const sharp=require('sharp');
const {TIERS,esc}=require('./cartes-utils');
const tierOf=x=>TIERS.find(t=>t.key===x)||TIERS[0];
const CARD_W=240,CARD_H=370,GAP=14,TOP=73,BOT=33;
function svg(w,h,txt){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${txt}</svg>`);}
async function prepareImage(buf){
 const meta=await sharp(buf,{limitInputPixels:18000000,failOn:'error'}).metadata();
 if(!['jpeg','png','webp','avif'].includes(meta.format))throw Error('Image non reconnue. Utilise JPG, PNG ou WEBP.');
 if((meta.width||0)<180||(meta.height||0)<220)throw Error('Image trop petite pour une carte (minimum 180 × 220 pixels).');
 return sharp(buf,{limitInputPixels:18000000}).rotate().resize({width:800,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:88,effort:4}).toBuffer();
}
async function cutPlanche(buf,disposition){
 const base=sharp(buf,{limitInputPixels:45000000}).rotate();
 const {width,height}=await base.metadata();
 let slots=[];
 if(disposition==='horizontale'){
  if(width/5<160)throw Error('Planche trop étroite : chaque carte doit faire au moins 160 pixels de large.');
  slots=Array.from({length:5},(_,i)=>({left:Math.round(i*width/5),top:0,width:Math.round((i+1)*width/5)-Math.round(i*width/5),height}));
 }else if(disposition==='verticale'){
  if(height/5<220)throw Error('Planche trop petite : chaque carte doit faire au moins 220 pixels de haut.');
  slots=Array.from({length:5},(_,i)=>({left:0,top:Math.round(i*height/5),width,height:Math.round((i+1)*height/5)-Math.round(i*height/5)}));
 }else if(disposition==='trois_deux'){
  // Gabarit officiel des planches Les Drôles d'Humains :
  // titre en haut ; 3 cartes en ligne supérieure ; 2 cartes élargies en bas.
  // Coordonnées proportionnelles : s'adaptent à différentes résolutions
  // sans rogner les cadres, noms, adjectifs ni mentions de rareté.
  if(width<720||height<560)throw Error('Planche 3+2 trop petite : envoie l’image originale, au moins 720 × 560 pixels.');
  const boxes=[
   [0.040,0.094,0.339,0.550],  // commune — haut gauche
   [0.346,0.094,0.651,0.550],  // peu commune — haut centre
   [0.659,0.094,0.958,0.550],  // rare — haut droite
   [0.066,0.545,0.492,0.984],  // épique — bas gauche
   [0.504,0.542,0.951,0.984]   // légendaire — bas droite
  ];
  slots=boxes.map(([x1,y1,x2,y2])=>{
   const left=Math.max(0,Math.floor(x1*width));
   const top=Math.max(0,Math.floor(y1*height));
   const right=Math.min(width,Math.ceil(x2*width));
   const bottom=Math.min(height,Math.ceil(y2*height));
   return {left,top,width:right-left,height:bottom-top};
  });
 }else throw Error('Disposition de planche non reconnue.');
 const input=await base.toBuffer();
 return Promise.all(slots.map(s=>sharp(input).extract(s).toBuffer().then(prepareImage)));
}
function placeholder(label,w=CARD_W,h=CARD_H){
 return svg(w,h,`<rect width="100%" height="100%" rx="8" fill="#252936"/><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="8" fill="none" stroke="#666C77" stroke-dasharray="8,6" stroke-width="3"/><text x="50%" y="46%" text-anchor="middle" fill="#C8CEDB" font-size="50">?</text><text x="50%" y="56%" text-anchor="middle" fill="#C8CEDB" font-size="15">${esc(label)}</text>`);
}
async function cardTile(c){
 const w=CARD_W,h=CARD_H;
 const color=tierOf(c.tier).color;
 let b;
 if(c.image){
  const sharpImg=sharp(c.image).rotate().resize(w-10,h-64,{fit:'contain',background:'#1B1E29'});
  b=await sharpImg.png().toBuffer();
 } else b=placeholder('À découvrir',w-10,h-64);
 const title=(c.title||c.character_name||'Carte').slice(0,34);
 const label=c.missing?'MANQUANTE':tierOf(c.tier).label;
 const countLabel=Number.isInteger(c.quantity)&&c.quantity>0?`×${c.quantity}`:'';
 const under=svg(w,h,`<rect width="100%" height="100%" rx="12" fill="#171A25"/><rect x="3" y="3" width="${w-6}" height="${h-6}" rx="11" fill="none" stroke="${c.missing?'#6C7180':color}" stroke-width="5"/><text x="50%" y="${h-49}" font-family="sans-serif" text-anchor="middle" font-size="17" font-weight="bold" fill="#FFFFFF">${esc(title)}</text><text x="50%" y="${h-24}" font-family="sans-serif" text-anchor="middle" font-size="13" fill="${c.missing?'#B2B8C6':color}">${esc(label)}</text><text x="${w-16}" y="${h-10}" text-anchor="end" font-family="sans-serif" font-weight="bold" font-size="13" fill="#FFFFFF">${esc(countLabel)}</text>`);
 const outs=await sharp(under).composite([{input:b,left:5,top:5}]).png().toBuffer();
 return outs;
}
async function panel(cards,{title='Les Drôles de Cartes',subtitle='',columns=5}={}){
 const cols=Math.max(1,Math.min(5,columns));
 const rows=Math.ceil(cards.length/cols)||1;
 const w=cols*CARD_W+(cols+1)*GAP;
 const h=TOP+rows*(CARD_H+GAP)+BOT;
 const bg=svg(w,h,`<rect width="100%" height="100%" rx="14" fill="#111522"/><text x="${GAP}" y="30" font-size="24" font-family="sans-serif" font-weight="bold" fill="#FFFFFF">${esc(title.slice(0,55))}</text><text x="${GAP}" y="55" font-size="15" font-family="sans-serif" fill="#B3C1D7">${esc(subtitle.slice(0,120))}</text>`);
 const compositions=[];
 for(let n=0;n<cards.length;n++){
  compositions.push({input:await cardTile(cards[n]),left:GAP+(n%cols)*(CARD_W+GAP),top:TOP+Math.floor(n/cols)*(CARD_H+GAP)});
 }
 return sharp(bg).composite(compositions).png().toBuffer();
}
module.exports={prepareImage,cutPlanche,panel};
