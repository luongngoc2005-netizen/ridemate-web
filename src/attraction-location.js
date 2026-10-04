import { searchPlannedCandidates, geocode } from './route-data.js';
import { validPoint } from './places-data.js';

export const locationKey = (name, destination) => `${destination.trim()}::${name.trim()}`;
const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
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
  if(!all.length)all=await searchPlannedCandidates(name,{end:center},signal);
  const {vietnam} = await import('./vietnam-guard.js');
  const candidates = all.filter(p => vietnam.containsPoint(p.coordinates) &&
    (['tourism','historic','natural','leisure'].includes(p.kind)||p.kind==='waterway'&&p.subtype==='waterfall'));
  const exact = matchingAttractions(name, candidates);
  // Matching a name alone does not establish the province. Require the local
  // address as well; otherwise the user must confirm a candidate.
  const region = fold(destination);
  const verified = exact.filter(p => fold(p.address).includes(region));
  return { candidates, automatic: verified.length === 1 && exact.length === 1 ? verified[0] : null };
}
