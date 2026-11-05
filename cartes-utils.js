'use strict';
const {randomInt}=require('node:crypto');
const TIERS=[
 {key:'commune',label:'Commune',weight:448,color:'#929AA8'},
 {key:'peu_commune',label:'Peu commune',weight:300,color:'#29A96B'},
 {key:'rare',label:'Rare',weight:170,color:'#478FE2'},
 {key:'epique',label:'Épique',weight:70,color:'#A65BE0'},
 {key:'legendaire',label:'Légendaire',weight:10,color:'#E4B334'},
 {key:'prestige',label:'Légende des Légendaires',weight:2,color:'#E36B35'},
];
const BASE_TIERS=TIERS.filter(t=>t.key!=='prestige');
function normalize(v){return String(v||'').trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function esc(s){return String(s||'').replace(/[<>&"']/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[x]));}
function safe(s){return String(s||'').replace(/([\\*_~`|>])/g,'\\$1').replace(/@/g,'@\u200b');}
function dayParis(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day}`;
}
function chooseTier(cardsByTier,rng=randomInt){
 const viable=TIERS.filter(t=>(cardsByTier[t.key]||[]).length>0);
 if(!viable.length)throw Error('Le catalogue est vide : une administratrice doit d’abord ajouter des cartes avec /cartes ajouter-joueur.');
 const total=viable.reduce((sum,t)=>sum+t.weight,0);
 let n=rng(total);
 for(const tier of viable){if(n<tier.weight)return tier.key;n-=tier.weight;}
 return viable.at(-1).key;
}
function parseItems(input){
 if(!input||/^\s*(aucun|aucune|rien|-)\s*$/i.test(input))return [];
 const chunks=String(input).split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
 if(chunks.length>5)throw Error('Maximum 5 références différentes par côté de l’échange.');
 const out=new Map();
 for(const chunk of chunks){
  const m=/^([CP]-\d{1,12})(?:\s*[x×*]\s*(\d{1,3}))?$/i.exec(chunk);
  if(!m)throw Error(`Format invalide : « ${chunk.slice(0,45)} ». Exemple : C-00001 x2, P-00012`);
  const code=m[1].toUpperCase(),qty=Number(m[2]||1);
  if(!Number.isInteger(qty)||qty<1||qty>99)throw Error('Chaque quantité doit être comprise entre 1 et 99.');
  out.set(code,(out.get(code)||0)+qty);
  if(out.get(code)>99)throw Error('Quantité maximum par carte : 99.');
 }
 return [...out].map(([code,qty])=>({code,qty}));
}
function formatCode(id,prestige=false){return `${prestige?'P':'C'}-${String(id).padStart(5,'0')}`;}
module.exports={TIERS,BASE_TIERS,normalize,esc,safe,dayParis,chooseTier,parseItems,formatCode};
