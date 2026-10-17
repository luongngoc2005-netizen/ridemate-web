import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoutePlaces, mapServices } from '../src/route-data.js';
import { fetchRoutePois } from '../src/poi-client.js';

let index = 0;
test.beforeEach(t => {
  const prior = { poi: mapServices.poi, nearbyProvider: mapServices.nearbyProvider, places: mapServices.places };
  mapServices.poi = { url: `https://route-${++index}.supabase.invalid`, key: 'sb_publishable_test' };
  mapServices.nearbyProvider = 'auto'; mapServices.places = `https://overpass.invalid/${index}`;
  t.after(() => Object.assign(mapServices, prior));
});
const route = () => ({ coordinates: [[106, 20.8], [106, 21.8]] });
const row = (category, id, lat) => ({ type: 'node', id, lon: 106, lat, category, name: `Place ${id}`, address: '', hours: '' });
const reply = places => ({ ok: true, json: async () => ({ ready: true, places, complete: false }) });

test('route search sends the full corridor and selected category, returns spread markers and caches that route/type', async t => {
  const tripRoute = route(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.ok(url.endsWith('/route_pois'));
    const body = JSON.parse(options.body);
    assert.deepEqual(body.route_geojson.coordinates, tripRoute.coordinates);
    assert.equal(body.radius_m, 1700);
    assert.equal(body.lon, undefined); assert.equal(body.lat, undefined);
    return reply(Array.from({ length: 100 }, (_, i) => row(body.category_name, i + 1, 20.8 + i / 99)));
  });
  const first = await loadRoutePlaces(tripRoute, 'fuel');
  assert.equal(first.places.length, 30);
  assert.equal(first.places[0].id, 'node/1'); assert.equal(first.places.at(-1).id, 'node/100');
  assert.ok(first.places.every(p => p.type === 'fuel' && p.distanceMeters <= 1500));
  assert.equal((await loadRoutePlaces(tripRoute, 'fuel')).places.length, 30); assert.equal(calls, 1);
  await loadRoutePlaces(tripRoute, 'rest'); assert.equal(calls, 2);
  await loadRoutePlaces(route(), 'fuel'); assert.equal(calls, 3);
});

test('legacy fallback queries only the selected category along the route', async t => {
  mapServices.poi = null; let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++; const query = options.body.get('data');
    assert.match(query, /tourism/); assert.match(query, /around:1700/);
    assert.doesNotMatch(query, /amenity|shop|restaurant/);
    return { ok: true, json: async () => ({ elements: [] }) };
  });
  const result = await loadRoutePlaces({ coordinates: [[106, 21], [106.01, 21.01]] }, 'rest');
  assert.equal(result.failed, 0); assert.equal(calls, 1);
});

test('a valid empty route response is not replaced by nearby or Overpass requests', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => { calls++; assert.ok(url.endsWith('/route_pois')); return reply([]); });
  assert.deepEqual((await loadRoutePlaces(route(), 'repair')).places, []);
  assert.equal(calls, 1);
});

test('invalid requests, unavailable required snapshots and cancellation are explicit errors', async t => {
  await assert.rejects(loadRoutePlaces({}, 'fuel'));
  await assert.rejects(loadRoutePlaces(route(), 'planned'));
  mapServices.nearbyProvider = 'supabase';
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ ready: false }) }));
  await assert.rejects(loadRoutePlaces(route(), 'fuel'), /điểm dọc tuyến chưa sẵn sàng/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadRoutePlaces(route(), 'fuel', controller.signal), { name: 'AbortError' });
  await assert.rejects(fetchRoutePois(mapServices.poi, [[NaN, 21], [106, 22]], 'fuel'), /không hợp lệ/);
});
