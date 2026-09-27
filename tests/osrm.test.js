import test from 'node:test';
import assert from 'node:assert/strict';
import { routePoints, itineraryStops, osrmUrl, parseOsrm, routeGeoJSON, accuracyGeoJSON } from '../src/osrm-data.js';
import { loadPlaces } from '../src/route-data.js';

test('OSRM preserves itinerary order and repeats nonconsecutive visits, omitting unresolved pins', () => {
  const a = { label: 'A', coordinates: [105, 21] }, b = { label: 'B', coordinates: [106, 22] };
  const stops = itineraryStops({ itinerary: [{ id: 'd1', places: [{ name: 'C', coordinates: [105.5, 21.5] }, { name: 'Missing' }] }, { id: 'd2', places: [{ name: 'Back', coordinates: a.coordinates }] }] });
  const points = routePoints(a, b, stops);
  assert.deepEqual(points.map(p => p.coordinates), [a.coordinates, [105.5, 21.5], a.coordinates, b.coordinates]);
  assert.equal(points[2].dayNumber, 2);
  const url = osrmUrl('https://router.project-osrm.org/route/v1/driving', points);
  assert.match(url.pathname, /105,21;105.5,21.5;105,21;106,22$/);
  assert.equal(url.searchParams.get('geometries'), 'geojson');
  assert.equal(url.searchParams.get('steps'), 'true');
});
test('OSRM meters/seconds convert correctly and individual days become colored GeoJSON lines', () => {
  const points = [{ coordinates: [105, 21], label: 'A' }, { coordinates: [106, 22], label: 'B', dayNumber: 2 }];
  const coordinates = points.map(p => p.coordinates);
  const result = { code: 'Ok', routes: [{ distance: 1500, duration: 120, geometry: { coordinates }, legs: [{ distance: 1500, duration: 120, steps: [{ geometry: { coordinates } }] }] }] };
  const route = parseOsrm(result, points);
  assert.equal(route.distanceKm, 1.5); assert.equal(route.durationSeconds, 120);
  const geo = routeGeoJSON(route); assert.equal(geo.features[0].properties.day, 2);
  assert.deepEqual(geo.features[0].geometry.coordinates, coordinates);
  assert.throws(() => parseOsrm({ code: 'NoRoute' }, points));
  assert.throws(() => parseOsrm({ ...result, routes: [{ ...result.routes[0], legs: [] }] }, points));
  const ring = accuracyGeoJSON({ coordinates: [105, 21], accuracy: 100 }).geometry.coordinates[0];
  assert.deepEqual(ring[0], ring.at(-1)); assert.equal(ring.length, 65);
});
test('Place loading publishes partial success and retry only requests failed segments', async context => {
  const route = { coordinates: [[106, 10], [106, 11]] };
  let count = 0, failing = true;
  context.mock.method(globalThis, 'fetch', async () => {
    count++;
    if (count === 2 && failing) return { ok: false, status: 504 };
    return { ok: true, json: async () => ({ elements: [{ type: 'node', id: count, lon: 106, lat: 10.2, tags: { amenity: 'fuel', name: `Fuel ${count}` } }] }) };
  });
  const snapshots = [];
  const first = await loadPlaces(route, undefined, result => snapshots.push(result));
  assert.equal(first.failed, 1); assert.ok(first.places.length);
  assert.ok(snapshots[0].places.length); assert.equal(snapshots.length, first.total);
  const prior = count; failing = false;
  const second = await loadPlaces(route);
  assert.equal(count - prior, 1); assert.equal(second.failed, 0); assert.ok(second.places.length >= first.places.length);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadPlaces(route, controller.signal), { name: 'AbortError' });
});
