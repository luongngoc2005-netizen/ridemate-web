import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrip, initialDetails, saveTrip, readTrip } from '../src/trip-data.js';
import { validateWorkspace } from '../src/cloud-data.js';
import { plannedPlaces, addPlannedPlace, locatePlannedPlace, clearPlannedLocation, renamePlannedPlace, mergeEditedDay } from '../src/planned-places.js';
import { itineraryStops, routePoints } from '../src/osrm-data.js';

test('An unroutable saved stop can be relocated or cleared without deleting the plan', () => {
  const trip = createTrip(initialDetails), original = plannedPlaces(trip)[0];
  const wrong = locatePlannedPlace(trip, original.dayId, original.placeId, { id: 'node/old', coordinates: [110, 10], address: 'Wrong' }, original.name);
  const corrected = locatePlannedPlace(wrong, original.dayId, original.placeId, { id: 'node/new', coordinates: [105, 21], address: 'Correct' }, original.name);
  const saved = plannedPlaces(corrected)[0];
  assert.deepEqual(saved.coordinates, [105, 21]); assert.equal(saved.sourceId, 'node/new');
  const cleared = clearPlannedLocation(wrong, original.dayId, original.placeId, original.name);
  const clearedPlace = plannedPlaces(cleared)[0];
  assert.equal(clearedPlace.name, original.name); assert.equal(clearedPlace.placeId, original.placeId);
  for (const key of ['coordinates', 'address', 'sourceId']) assert.equal(clearedPlace[key], undefined);
  assert.equal(plannedPlaces(cleared).length, plannedPlaces(trip).length);
  assert.deepEqual(routePoints({ coordinates: [105, 21] }, { coordinates: [106, 22] }, itineraryStops(cleared)).map(p => p.coordinates), [[105, 21], [106, 22]]);
  assert.deepEqual(clearPlannedLocation(wrong, original.dayId, original.placeId, 'stale name'), wrong);
  assert.deepEqual(validateWorkspace({ version: 1, trip: corrected, entries: [] }).trip, corrected);
});

test('Adding a route pin stores its exact location once per day and preserves the rest of the trip', () => {
  const trip = createTrip(initialDetails), day = trip.itinerary[0];
  const pin = { id: 'node/7', name: 'Cây xăng A', type: 'fuel', coordinates: [105.81, 21.02], address: 'Hà Nội' };
  const next = addPlannedPlace(trip, day.id, pin);
  assert.equal(day.places.length, 0);
  assert.deepEqual(next.itinerary[0].places[0].coordinates, pin.coordinates);
  assert.deepEqual(addPlannedPlace(next, day.id, pin).itinerary, next.itinerary);
  assert.deepEqual(next.itinerary.slice(1), trip.itinerary.slice(1));
  let raw;
  const storage = { setItem: (_, value) => { raw = value; }, getItem: () => raw };
  saveTrip(storage, next);
  assert.deepEqual(readTrip(storage).trip, next);
  assert.deepEqual(validateWorkspace({ version: 1, trip: next, entries: [] }).trip, next);
});
test('Legacy names remain unlocated until a user chooses a position; renaming clears the old pin', () => {
  const trip = createTrip(initialDetails), place = plannedPlaces(trip)[0];
  assert.equal(place.coordinates, undefined);
  const candidate = { coordinates: [105, 22], address: 'Địa chỉ đã chọn' };
  const next = locatePlannedPlace(trip, place.dayId, place.placeId, candidate, place.name);
  const saved = plannedPlaces(next)[0];
  assert.deepEqual(saved.coordinates, candidate.coordinates);
  assert.equal(saved.name, place.name);
  assert.equal(renamePlannedPlace(saved, 'Tên mới').coordinates, undefined);
  assert.deepEqual(locatePlannedPlace(trip, place.dayId, place.placeId, candidate, 'stale name').itinerary, trip.itinerary);
  assert.throws(() => locatePlannedPlace(trip, place.dayId, place.placeId, { coordinates: [NaN, 2] }, place.name));
});
test('Saving an open day editor retains pins added or located through the floating panel', () => {
  const baseline = { id: 'day', title: 'Day', note: '', places: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
  const current = { ...baseline, places: [{ id: 'a', name: 'A', coordinates: [105, 21] }, baseline.places[1], { id: 'c', name: 'C', coordinates: [105, 22] }] };
  const edited = { ...baseline, note: 'changed', places: [baseline.places[0]] };
  const merged = mergeEditedDay(current, edited, baseline);
  assert.deepEqual(merged.places.map(p => p.id), ['a', 'c']);
  assert.deepEqual(merged.places[0].coordinates, [105, 21]);
  assert.equal(merged.note, 'changed');
});
