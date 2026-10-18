import {provinceLocation,provinceLocations} from '../src/province-locations.js';
import {suggestionsFor,destinations} from '../src/trip-data.js';
import {validPoint} from '../src/places-data.js';
import {apiError} from './supabase-gate.js';

export const foldPlace=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const caches=new WeakMap();
export function attractionRequests(payload){
  const text=[payload.message,payload.context?.preferences].filter(Boolean).join('. '),folded=foldPlace(text);
  const include=new Set(),exclude=new Set();
  for(const name of destinations.flatMap(d=>d.places)){
    const full=foldPlace(name),short=full.replace(/^(?:thac|dong|chua|nui|khu di tich|bai bien|vuon quoc gia) /,'');
    const at=folded.indexOf(full)>=0?folded.indexOf(full):short.split(' ').length>=2?folded.indexOf(short):-1;if(at<0)continue;
    const before=folded.slice(Math.max(0,at-35),at);
    (/\b(?:khong (?:muon )?(?:di|ghe|tham|tham quan)|bo|bot|loai|tru)\s*$/.test(before)?exclude:include).add(name);
  }
  // Named requests outside the editorial list still need a map lookup in B.
  for(const match of text.matchAll(/(?:ghé(?: thăm)?|tham quan|thăm)\s+([^.;\n]+)/gi)){
    if(/(?:không(?: muốn)?|bỏ)\s*$/i.test(text.slice(Math.max(0,match.index-18),match.index)))continue;
    for(const part of match[1].split(/,|\s+và\s+/i)){
      const name=part.split(/\s+(?:trong|vào|ngày|rồi|sau đó|giúp|cho tôi)\b/i)[0].trim();
      if(!name||name.length>120||provinceLocation(name)||/^(?:các? |những |một |quán |nhà hàng |điểm |địa điểm |nơi |đâu|gì|thiên nhiên|danh lam)/i.test(name))continue;
      if(![...include,...exclude].some(p=>foldPlace(name).includes(foldPlace(p))||foldPlace(p).endsWith(foldPlace(name))))include.add(name);
    }
  }
  return {include:[...include],exclude:[...exclude]};
}
export async function destinationAttractions(destination,{fetchImpl=fetch,signal,requestedNames=[],excludedNames=[]}={}){
  const local=suggestionsFor(destination);
  const excluded=new Set(excludedNames.map(foldPlace));
  const curated=local?.places.filter(name=>!excluded.has(foldPlace(name)))||[];
  const requested=[...new Set(requestedNames.filter(name=>!excluded.has(foldPlace(name))))];
  if(local&&requested.every(name=>curated.some(p=>foldPlace(p)===foldPlace(name)))){
    if(!curated.length)throw apiError(503,'AI_DESTINATION_DATA_UNAVAILABLE');
    return {...local,places:curated,items:[],required:requested,excluded:excludedNames,mode:'famous'};
  }
  if(!requested.length)throw apiError(503,'AI_DESTINATION_DATA_UNAVAILABLE');
  const region=provinceLocation(destination);
  let cache=caches.get(fetchImpl);if(!cache){cache=new Map();caches.set(fetchImpl,cache);}
  const cacheKey=JSON.stringify([destination,requested,excludedNames]);
  const cached=cache.get(cacheKey);if(cached?.until>Date.now())return cached.value;
  const relation=region?.source.match(/\/relation\/(\d+)$/)?.[1];
  if(relation){
    // Search the actual administrative polygon, never an unrestricted country-wide search.
    const query=`[out:json][timeout:7];rel(${relation});map_to_area->.destination;(nwr(area.destination)[name][tourism~"^(attraction|museum|viewpoint|theme_park|zoo)$"];nwr(area.destination)[name][historic~"^(castle|ruins|archaeological_site|monument)$"];nwr(area.destination)[name][natural~"^(cave_entrance|peak)$"];nwr(area.destination)[name][waterway=waterfall];);out center tags 120;`;
    try{
      const response=await fetchImpl(`https://overpass-api.de/api/interpreter?${new URLSearchParams({data:query})}`,{headers:{Accept:'application/json','User-Agent':'RideMate/0.1 destination lookup'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8500)]):AbortSignal.timeout(8500)});
      if(!response.ok)throw new Error('Attraction lookup unavailable');
      const body=await response.json();
      if(body.remark||!Array.isArray(body.elements))throw new Error('Incomplete lookup');
      const {vietnam}=await import('../src/vietnam-guard.js');
      const seen=new Set(),items=[];
      for(const p of body.elements){
        const name=p.tags?.['name:vi']||p.tags?.name,coordinates=[p.lon??p.center?.lon,p.lat??p.center?.lat];
        const kind=p.tags?.tourism?'tourism':p.tags?.historic?'historic':p.tags?.natural?'natural':'waterway';
        if(typeof name!=='string'||!name.trim()||name.length>200||!['node','way','relation'].includes(p.type)||!Number.isSafeInteger(p.id)||!validPoint(coordinates)||!vietnam.containsPoint(coordinates)||seen.has(foldPlace(name)))continue;
        const subtype=p.tags[kind];
        if(!['attraction','museum','viewpoint','theme_park','zoo','castle','ruins','archaeological_site','monument','cave_entrance','peak','waterfall'].includes(subtype))continue;
        seen.add(foldPlace(name));items.push({id:`${p.type}/${p.id}`,name:name.trim(),coordinates,kind,subtype,address:region.name,source:`https://www.openstreetmap.org/${p.type}/${p.id}`});
      }
      const chosen=items.filter(p=>requested.some(name=>foldPlace(name)===foldPlace(p.name)));
      if(requested.every(name=>chosen.some(p=>foldPlace(p.name)===foldPlace(name)))){
        const value={name:region.name,places:[...new Set([...requested,...curated])],items:chosen,source:local?.source||'OpenStreetMap',required:requested,excluded:excludedNames,mode:'requested'};
        if(cache.size>=32)cache.delete(cache.keys().next().value);
        cache.set(cacheKey,{until:Date.now()+900000,value});return value;
      }
    }catch(error){if(signal?.aborted)throw error;}
  }
  // Never silently replace a requested place with an unrelated famous attraction.
  throw apiError(503,'AI_REQUESTED_PLACE_UNAVAILABLE');
}

export function validateDestinationDraft(draft,selection,origin){
  const allowed=new Set(selection.places.map(foldPlace));
  if(draft.days.some(d=>d.stops.some(name=>!allowed.has(foldPlace(name)))))throw apiError(502,'AI_DESTINATION_MISMATCH');
  if(selection.required?.some(name=>!draft.days.some(d=>d.stops.some(p=>foldPlace(p)===foldPlace(name)))))throw apiError(502,'AI_REQUESTED_PLACE_MISSING');
  const prose=foldPlace([draft.summary,...draft.days.flatMap(d=>[d.title,d.morning,d.afternoon,d.evening,d.lodging])].join(' '));
  if(selection.excluded?.some(name=>` ${prose} `.includes(` ${foldPlace(name)} `)))throw apiError(502,'AI_DESTINATION_MISMATCH');
  const regions=[...destinations,...provinceLocations];
  for(const region of regions){
    // Origin is valid in the travel legs, but unrelated regions/attractions are not.
    const name=foldPlace(region.name);
    if([origin,draft.destination,selection.name].some(p=>foldPlace(p).includes(name)))continue;
    if(` ${prose} `.includes(` ${name} `)||region.places?.some(p=>` ${prose} `.includes(` ${foldPlace(p)} `)))throw apiError(502,'AI_DESTINATION_MISMATCH');
  }
}
