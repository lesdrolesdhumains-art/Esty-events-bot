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
 return sharp(buf,{limitInputPixels:18000000}).rotate().resize({width:800,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:90,effort:4}).toBuffer();
}
// Coordonnées en fractions de l'image complète : [gauche,haut,droite,bas].
// Ces valeurs sont des points de départ, jamais des découpes définitives imposées :
// l'administrateur peut ajuster indépendamment les 4 côtés de chaque carte.
const LAYOUTS=Object.freeze({
 trois_deux:[
  [0.042,0.097,0.338,0.545],
  [0.349,0.097,0.654,0.545],
  [0.661,0.097,0.957,0.545],
  [0.069,0.551,0.490,0.977],
  [0.511,0.551,0.951,0.977]
 ],
 horizontale:Array.from({length:5},(_,k)=>[k/5+0.006,0.04,(k+1)/5-0.006,0.96]),
 verticale:Array.from({length:5},(_,k)=>[0.04,k/5+0.005,0.96,(k+1)/5-0.005])
});
function validateBox(box){
 if(!Array.isArray(box)||box.length!==4||box.some(x=>!Number.isFinite(x)))throw Error('Coordonnées invalides.');
 const [left,top,right,bottom]=box;
 if(left<0||top<0||right>1||bottom>1||right-left<0.025||bottom-top<0.025)throw Error('Découpe impossible : vérifie les côtés gauche, haut, droit et bas (0 à 100 %).');
 return box;
}
async function sheetInfo(buf,disposition){
 if(!LAYOUTS[disposition])throw Error('Disposition de planche non reconnue.');
 const normalized=await sharp(buf,{limitInputPixels:45000000,failOn:'error'}).rotate().toBuffer({resolveWithObject:true});
 const {width,height}=normalized.info;
 const meta={format:normalized.info.format};
 if(!['jpeg','png','webp','avif'].includes(meta.format))throw Error('La planche doit être un fichier JPG, PNG ou WEBP.');
 if(!width||!height||width<600||height<450)throw Error('Planche trop petite : envoie une image originale d’au moins 600 × 450 pixels.');
 if(disposition==='trois_deux'&&(width<720||height<560))throw Error('Planche 3+2 trop petite : envoie l’image originale, au moins 720 × 560 pixels.');
 const boxes=LAYOUTS[disposition].map(b=>b.slice());
 return {width,height,boxes,disposition};
}
async function cutOne(buf,box){
 validateBox(box);
 const rotated=await sharp(buf,{limitInputPixels:45000000,failOn:'error'}).rotate().toBuffer();
 const {width,height}=await sharp(rotated).metadata();
 const [x1,y1,x2,y2]=box;
 const left=Math.max(0,Math.min(width-1,Math.floor(x1*width)));
 const top=Math.max(0,Math.min(height-1,Math.floor(y1*height)));
 const right=Math.max(left+1,Math.min(width,Math.ceil(x2*width)));
 const bottom=Math.max(top+1,Math.min(height,Math.ceil(y2*height)));
 if(right-left<180||bottom-top<220)throw Error('La zone choisie est trop petite : agrandis légèrement la sélection.');
 return prepareImage(await sharp(rotated).extract({left,top,width:right-left,height:bottom-top}).toBuffer());
}
async function cutPlanche(buf,disposition,providedBoxes=null){
 const info=await sheetInfo(buf,disposition);
 const boxes=providedBoxes||info.boxes;
 if(!Array.isArray(boxes)||boxes.length!==5)throw Error('Il faut exactement cinq zones de découpe.');
 // Décodage/rotation unique pour ne pas déformer les plans photographiques.
 const rotated=await sharp(buf,{limitInputPixels:45000000}).rotate().toBuffer();
 const images=[];
 for(const box of boxes){
  validateBox(box);
  const [x1,y1,x2,y2]=box;
  const left=Math.floor(x1*info.width),top=Math.floor(y1*info.height);
  const right=Math.min(info.width,Math.ceil(x2*info.width));
  const bottom=Math.min(info.height,Math.ceil(y2*info.height));
  if(right-left<180||bottom-top<220)throw Error('Une carte est trop petite : ajuste sa zone de découpe.');
  images.push(await prepareImage(await sharp(rotated).extract({left,top,width:right-left,height:bottom-top}).toBuffer()));
 }
 return images;
}
function placeholder(label,w=CARD_W,h=CARD_H){
 return svg(w,h,`<rect width="100%" height="100%" rx="8" fill="#252936"/><rect x="8" y="8" width="${w-16}" height="${h-16}" rx="8" fill="none" stroke="#666C77" stroke-dasharray="8,6" stroke-width="3"/><text x="50%" y="46%" text-anchor="middle" fill="#C8CEDB" font-size="50">?</text><text x="50%" y="56%" text-anchor="middle" fill="#C8CEDB" font-size="15">${esc(label)}</text>`);
}
async function cardTile(c){
 const w=CARD_W,h=CARD_H;
 // Les cartes classiques et Prestige sont déjà entièrement illustrées.
 // Pas de bandeau noir, de titre répété ou de cadre superposé.
 if(c.image&&!c.missing){
  return sharp(c.image).rotate().resize(w,h,{fit:'contain',background:'#111522'}).png().toBuffer();
 }
 const color=tierOf(c.tier).color;
 const title=(c.title||c.character_name||'Carte').slice(0,34);
 const under=svg(w,h,`<rect width="100%" height="100%" rx="12" fill="#171A25"/><rect x="3" y="3" width="${w-6}" height="${h-6}" rx="11" fill="none" stroke="#6C7180" stroke-width="5"/><text x="50%" y="${h-49}" font-family="sans-serif" text-anchor="middle" font-size="16" font-weight="bold" fill="#FFFFFF">${esc(title)}</text><text x="50%" y="${h-24}" font-family="sans-serif" text-anchor="middle" font-size="13" fill="${color}">MANQUANTE</text>`);
 return sharp(under).composite([{input:placeholder('À découvrir',w-10,h-64),left:5,top:5}]).png().toBuffer();
}
async function panel(cards,{title='Les Drôles de Cartes',subtitle='',columns=5}={}){
 if(cards.length===1 && cards[0].image && !cards[0].missing){
  return sharp(cards[0].image).png().toBuffer();
 }
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
module.exports={prepareImage,cutPlanche,sheetInfo,cutOne,validateBox,panel};
