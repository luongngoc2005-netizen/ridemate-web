import test from 'node:test';
import assert from 'node:assert/strict';
import { poiCategory, poiRecord } from '../src/poi-data.js';
import { loadRoutePlaces, mapServices } from '../src/route-data.js';
import { fetchRoutePois, fetchNearbyPois } from '../src/poi-client.js';

const line = [[106, 21], [106, 21.1]];
const config = name => ({ url: `https://${name}.supabase.invalid`, key: 'sb_publishable_test' });
const row = category => ({ type: 'node', id: 1, category, name: category, lon: 106, lat: 21.05, address: 'Test street', hours: '08:00-20:00' });
const reply = places => ({ ok: true, json: async () => ({ ready: true, complete: true, places }) });

test('food and drink extraction keeps all supported amenities, source names and hours', () => {
  for (const [amenity, category] of [['restaurant', 'food'], ['fast_food', 'food'], ['food_court', 'food'], ['cafe', 'drink'], ['ice_cream', 'drink']]) {
    assert.equal(poiCategory({ amenity }), category);
    const record = poiRecord({ type: 'node', id: 1, lon: 106, lat: 21, tags: { amenity, name: 'Place', opening_hours: '24/7' } }, () => true);
    assert.equal(record.category, category); assert.equal(record.hours, '24/7');
  }
  assert.equal(poiCategory({ amenity: 'bar' }), null);
  assert.equal(poiCategory({ amenity: 'restaurant', tourism: 'hotel' }), 'rest');
  assert.equal(poiCategory({ amenity: 'cafe', shop: 'motorcycle_repair' }), 'repair');
});

test('food and drink along a route use Supabase, preserve map details and reuse the category cache', async t => {
  const prior = { poi: mapServices.poi, nearbyProvider: mapServices.nearbyProvider };
  t.after(() => Object.assign(mapServices, prior));
  mapServices.poi = config('food-route'); mapServices.nearbyProvider = 'supabase';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.ok(url.endsWith('/route_pois'));
    return reply([row(JSON.parse(options.body).category_name)]);
  });
  const route = { coordinates: line };
  for (const type of ['food', 'drink']) {
    const result = await loadRoutePlaces(route, type);
    assert.equal(result.places[0].type, type);
    assert.equal(result.places[0].address, 'Test street');
    assert.equal(result.places[0].hours, '08:00-20:00');
    assert.match(result.places[0].source, /openstreetmap.org\/node\/1$/);
    await loadRoutePlaces(route, type);
  }
  assert.equal(calls, 2);
});

test('legacy food rejection is cached separately and cannot disable fuel or hide permission failures', async () => {
  const settings = config('legacy-food'); let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls++;
    return JSON.parse(options.body).category_name === 'food'
      ? { ok: false, status: 400, json: async () => ({ code: '22023', message: 'Invalid route POI search' }) }
      : reply([row('fuel')]);
  };
  assert.equal(await fetchRoutePois(settings, line, 'food', undefined, { fetchImpl }), null);
  assert.equal(await fetchRoutePois(settings, line, 'food', undefined, { fetchImpl }), null);
  assert.equal((await fetchRoutePois(settings, line, 'fuel', undefined, { fetchImpl })).elements.length, 1);
  assert.equal(calls, 2);
  await assert.rejects(fetchRoutePois(config('denied-food'), line, 'food', undefined, {
    fetchImpl: async () => ({ ok: false, status: 403 }),
  }));
});

test('nearby decoder accepts food/drink from upgraded snapshots without dropping the existing categories', async () => {
  const result = await fetchNearbyPois(config('five-categories'), [106, 21], undefined, {
    fetchImpl: async () => reply(['fuel', 'rest', 'repair', 'food', 'drink'].map((category, i) => ({ ...row(category), id: i + 1 }))),
  });
  assert.equal(result.elements.length, 5);
  assert.deepEqual(result.elements.slice(-2).map(p => p.tags.amenity), ['restaurant', 'cafe']);
});

test('auto falls back for food absent from an old snapshot, while required Supabase mode reports missing data', async t => {
  const prior = { poi: mapServices.poi, nearbyProvider: mapServices.nearbyProvider, places: mapServices.places };
  t.after(() => Object.assign(mapServices, prior));
  mapServices.poi = config('missing-food'); mapServices.nearbyProvider = 'auto';
  mapServices.places = 'https://overpass.invalid/food-rollout';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    if (url.endsWith('/route_pois')) return { ok: true, json: async () => ({ ready: false }) };
    assert.match(options.body.get('data'), /restaurant\|fast_food\|food_court/);
    assert.doesNotMatch(options.body.get('data'), /cafe|shop|tourism/);
    return { ok: true, json: async () => ({ elements: [] }) };
  });
  await loadRoutePlaces({ coordinates: [[106, 21], [106, 21.01]] }, 'food');
  assert.equal(calls.length, 2);
  mapServices.nearbyProvider = 'supabase';
  await assert.rejects(loadRoutePlaces({ coordinates: line }, 'food'), /chưa sẵn sàng/);
  assert.equal(calls.length, 2);
});
