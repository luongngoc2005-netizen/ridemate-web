import { searchPlannedCandidates, geocode } from './route-data.js';
import { validPoint } from './places-data.js';
import {suggestionsFor,destinationAddressMatches} from './destination-data.js';

export const locationKey = (name, destination) => `${destination.trim()}::${name.trim()}`;
const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function cleanDestinationAttractions(value,destination){
  if(value?.destination!==destination||!Array.isArray(value.items))return null;
  const items=value.items.slice(0,40).filter(p=>typeof p?.name==='string'&&p.name.length<=200&&validPoint(p.coordinates)&&/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(p.source)).map(p=>({name:p.name,id:String(p.id),source:p.source,coordinates:p.coordinates.slice(0,2),address:String(p.address||destination).slice(0,500),kind:p.kind,subtype:p.subtype}));
  return {destination,items};
}
export function relevantAttractions(name,destination,candidates){
  const tokens=fold(name).split(' ').filter(t=>!['dong','thac','vuon','quoc','gia','deo','nui','chua','di','tich','khu','pho','co','thanh'].includes(t));
  const known=suggestionsFor(destination)?.places.some(place=>fold(place)===fold(name));
  return candidates.filter(p=>validPoint(p.coordinates)&&destinationAddressMatches(destination,p.address,{allowCurrent:known&&fold(p.name)===fold(name)})&&
    (['tourism','historic','natural'].includes(p.kind)||p.kind==='waterway'&&p.subtype==='waterfall')&&
    !['hotel','hostel','guest_house','motel','city','town','village'].includes(p.subtype)&&
    (fold(p.name)===fold(name)||tokens.length>=2&&tokens.every(t=>fold(p.name).split(' ').includes(t))));
}
export function matchingAttractions(name, candidates) {
  return candidates.filter(p => validPoint(p.coordinates) && fold(p.name) === fold(name) &&
    (['tourism','historic','natural','leisure'].includes(p.kind)||p.kind==='waterway'&&p.subtype==='waterfall') &&
    !['city','town','village','administrative'].includes(p.subtype) &&
    (!fold(name).startsWith('thac ') || p.subtype==='waterfall'||p.subtype==='attraction') &&
    (!fold(name).startsWith('dong ') || p.subtype==='cave_entrance'||p.subtype==='attraction'));
}
export function cleanStopLocations(value, destination, names) {
  const result = {};
  for (const name of names) {
    const key = locationKey(name, destination), p = value?.[key];
    if (p?.requestedName === name && p.destination === destination && validPoint(p.coordinates) && p.confirmed === true) {
      result[key] = { requestedName: name, destination, name: p.name || name, coordinates: p.coordinates.slice(0,2),
        address: typeof p.address === 'string' ? p.address.slice(0,500) : '', source: typeof p.source === 'string' && /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(p.source) ? p.source : '',
        id: String(p.id || ''), confirmed: true };
    }
  }
  return result;
}
export async function findAttraction(name, destination, signal) {
  const center = await geocode(destination, signal);
  let all = await searchPlannedCandidates(`${name}, ${destination}`, {end:center}, signal);
  if(!relevantAttractions(name,destination,all).length)all=await searchPlannedCandidates(name,{end:center},signal);
  const {getVietnamGuard} = await import('./vietnam-guard.js');
  const vietnam = await getVietnamGuard();
  const candidates = relevantAttractions(name,destination,all).filter(p => vietnam.containsPoint(p.coordinates));
  const exact = matchingAttractions(name, candidates);
  // Matching a name alone does not establish the province. Require the local
  // address as well; otherwise the user must confirm a candidate.
  const known=suggestionsFor(destination)?.places.some(place=>fold(place)===fold(name));
  const verified = exact.filter(p => destinationAddressMatches(destination,p.address,{allowCurrent:known}));
  return { candidates, automatic: verified.length === 1 && exact.length === 1 ? verified[0] : null };
}
