import catalog from './destination-catalog.json' with {type:'json'};

// These are tourism areas, not replacement coordinates for renamed provinces.
export const destinations=catalog;
export const foldDestination=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases=item=>[item.name,...(item.aliases||[])].map(foldDestination);
const key=value=>foldDestination(value).replace(/^(?:tinh|thanh pho|tp) /,'').replace(/ viet nam$/,'').trim();
export const destinationArea=value=>destinations.find(item=>aliases(item).includes(key(value)))||null;
export function suggestionsFor(value){
  const exact=destinationArea(value);if(exact)return exact;
  const query=` ${foldDestination(value)} `;
  // Short abbreviations are accepted only as the complete destination.
  const matches=destinations.filter(item=>aliases(item).some(name=>name.length>3&&query.includes(` ${name} `)));
  const specific=matches.filter(item=>!matches.some(other=>other!==item&&(other.parent===item.name||other.currentProvince===item.name&&other.name!==item.name)));
  // Two unrelated areas need clarification; never pick the first catalog row.
  return specific.length===1?specific[0]:undefined;
}
export function destinationAddressMatches(value,address,{allowCurrent=false}={}){
  const area=suggestionsFor(value),query=` ${foldDestination(address)} `;
  const names=area?[area.name,...(area.aliases||[]),...(allowCurrent?[area.parent,area.currentProvince]:[])].filter(Boolean):[value];
  return names.some(name=>foldDestination(name).length>3&&query.includes(` ${foldDestination(name)} `));
}
export function trustedLandmarkSource(value){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&destinations.some(item=>new URL(item.source).href===url.href);}catch{return false;}
}
