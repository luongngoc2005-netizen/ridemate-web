import { validPoint } from './route-data.js';
import { newId } from './trip-data.js';

export function plannedPlaces(trip) {
  return trip.itinerary.flatMap((day, index) => day.places.map(place => ({ ...place, id: `planned:${day.id}:${place.id}`, placeId: place.id, dayId: day.id, dayNumber: index + 1, type: 'planned' })));
}

export function addPlannedPlace(trip, dayId, place) {
  if (!validPoint(place.coordinates)) throw new Error('Hãy chọn vị trí hợp lệ trên bản đồ.');
  return { ...trip, itinerary: trip.itinerary.map(day => day.id !== dayId || day.places.some(p => p.sourceId === place.id) ? day : {
    ...day, places: [...day.places, { id: newId(), name: place.name, coordinates: [...place.coordinates], address: place.address || '', category: place.type, sourceId: place.id }],
  }) };
}

export function locatePlannedPlace(trip, dayId, placeId, candidate, originalName) {
  if (!validPoint(candidate.coordinates)) throw new Error('Vị trí không hợp lệ.');
  return { ...trip, itinerary: trip.itinerary.map(day => day.id !== dayId ? day : { ...day, places: day.places.map(place => {
    if (place.id !== placeId || place.name !== originalName) return place;
    const { sourceId, ...rest } = place;
    return { ...rest, coordinates: [...candidate.coordinates], address: candidate.address || '', ...(candidate.id ? { sourceId: candidate.id } : {}) };
  }) }) };
}

export function clearPlannedLocation(trip, dayId, placeId, originalName) {
  return { ...trip, itinerary: trip.itinerary.map(day => day.id !== dayId ? day : { ...day, places: day.places.map(place => {
    if (place.id !== placeId || place.name !== originalName) return place;
    const { coordinates, address, sourceId, ...rest } = place;
    return rest;
  }) }) };
}

export function renamePlannedPlace(place, name) {
  if (name === place.name) return place;
  // A changed name may mean a different place; never keep its old coordinate pin.
  return { id: place.id, name };
}

export function mergeEditedDay(current, edited, baseline) {
  const originalIds = new Set(baseline.places.map(place => place.id));
  const places = edited.places.map(place => {
    const original = baseline.places.find(p => p.id === place.id);
    const latest = current.places.find(p => p.id === place.id);
    return latest && original?.name === place.name && latest.name === place.name ? { ...latest, name: place.name } : place;
  });
  // Points added from the floating panel while this editor was open must survive.
  return { ...edited, places: [...places, ...current.places.filter(p => !originalIds.has(p.id) && !places.some(saved => saved.id === p.id))] };
}
