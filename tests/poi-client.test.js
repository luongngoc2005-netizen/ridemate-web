import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNearbyPois } from '../src/poi-client.js';
import { mapServices, loadNearbyPlaces } from '../src/route-data.js';

let index = 0;
const config = () => ({ url: `https://poi-${++index}.supabase.invalid`, key: 'sb_publishable_example' });
const payload = (places = [], complete = true) => ({ ready: true, dataset: 'vietnam-test', sourceDate: '2026-10-17', places, complete });
const reply = data => ({ ok: true, json: async () => data });
const sample = (category, id = 1, lat = 21.001) => ({ type: 'node', id, category, lon: 105, lat, name: category, address: 'Địa chỉ', hours: '24/7' });

test('Supabase nearby uses a bounded read-only RPC and a publishable key without a bearer token', async () => {
  const settings = config();
  const result = await fetchNearbyPois(settings, [105, 21], undefined, { fetchImpl: async (url, options) => {
    assert.equal(url, settings.url + '/rest/v1/rpc/nearby_pois');
    assert.deepEqual(JSON.parse(options.body), { lon: 105, lat: 21, radius_m: 2000 });
    assert.equal(options.headers.apikey, settings.key);
    assert.equal(options.headers.Authorization, undefined);
    return reply(payload([sample('fuel'), sample('rest', 2), sample('repair', 3)]));
  } });
  assert.deepEqual(result.elements.map(p => p.tags.amenity || p.tags.tourism || p.tags.shop), ['fuel', 'hotel', 'motorcycle_repair']);
  assert.equal(result.elements[0].tags['addr:street'], 'Địa chỉ');
});

test('missing migration or unpublished snapshot is cached as unavailable, while ready empty results stay valid', async () => {
  for (const response of [{ status: 404 }, reply({ ready: false })]) {
    const settings = config(); let calls = 0, now = 1000;
    const fetchImpl = async () => { calls++; return response; };
    assert.equal(await fetchNearbyPois(settings, [105, 21], undefined, { fetchImpl, now: () => now }), null);
    assert.equal(await fetchNearbyPois(settings, [106, 21], undefined, { fetchImpl, now: () => now }), null);
    assert.equal(calls, 1);
    now += 300001;
    await fetchNearbyPois(settings, [105, 21], undefined, { fetchImpl, now: () => now });
    assert.equal(calls, 2);
  }
  assert.deepEqual((await fetchNearbyPois(config(), [105, 21], undefined, { fetchImpl: async () => reply(payload()) })).elements, []);
});

test('invalid payloads and permission errors cannot look like empty successful results', async () => {
  for (const response of [reply({ ready: true }), reply(payload([sample('invalid')])), reply(payload([{ ...sample('fuel'), lon: NaN }])), { ok: false, status: 403 }]) {
    await assert.rejects(fetchNearbyPois(config(), [105, 21], undefined, { fetchImpl: async () => response }));
  }
});

test('Supabase lookup respects cancellation and stops a stalled connection at four seconds', async t => {
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, delay, ...args) => realSetTimeout(fn, delay === 4000 ? 1 : delay, ...args));
  const stalled = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(fetchNearbyPois(config(), [105, 21], undefined, { fetchImpl: stalled }), /phản hồi chậm/);
  const controller = new AbortController();
  const search = fetchNearbyPois(config(), [105, 21], controller.signal, { fetchImpl: stalled });
  const rejected = assert.rejects(search, { name: 'AbortError' });
  controller.abort(); await rejected;
});

function setup(t, mode = 'auto') {
  const prior = { poi: mapServices.poi, nearbyProvider: mapServices.nearbyProvider, places: mapServices.places };
  mapServices.poi = config(); mapServices.nearbyProvider = mode; mapServices.places = 'https://overpass.invalid/test';
  t.after(() => Object.assign(mapServices, prior));
}

test('three riding categories use one Supabase lookup and never contact Overpass after publication', async t => {
  setup(t); let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++; assert.ok(url.startsWith(mapServices.poi.url));
    return reply(payload([sample('fuel'), sample('rest', 2), sample('repair', 3)]));
  });
  for (const category of ['fuel', 'rest', 'repair']) {
    const places = await loadNearbyPlaces([105, 21], category);
    assert.equal(places[0].type, category); assert.equal(places[0].nearby, undefined);
  }
  assert.equal(calls, 1);
  await loadNearbyPlaces([105, 21], 'fuel', undefined, { refresh: true });
  assert.equal(calls, 2);
});

test('unpublished data falls back during rollout; a valid empty Supabase result does not', async t => {
  setup(t); const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    return url.startsWith(mapServices.poi.url) ? reply({ ready: false }) : reply({ elements: [] });
  });
  await loadNearbyPlaces([105, 21], 'fuel');
  await loadNearbyPlaces([106, 21], 'rest');
  assert.equal(calls.length, 3);
  mapServices.poi = config();
  t.mock.method(globalThis, 'fetch', async url => { assert.ok(url.startsWith(mapServices.poi.url)); return reply(payload()); });
  assert.deepEqual(await loadNearbyPlaces([105, 21], 'fuel'), []);
});

test('explicit Supabase mode and transient failures avoid a second slow Overpass lookup', async t => {
  setup(t, 'supabase'); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return reply({ ready: false }); });
  await assert.rejects(loadNearbyPlaces([105, 21], 'fuel'), /chưa sẵn sàng/);
  assert.equal(calls, 1);
  mapServices.poi = config(); mapServices.nearbyProvider = 'auto';
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status: 503 }; });
  await assert.rejects(loadNearbyPlaces([105, 21], 'fuel'), /Google Maps/);
  assert.equal(calls, 2);
});

test('dense truncated snapshots cannot be reused after movement, including in-flight category changes', async t => {
  setup(t); let calls = 0, complete;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { complete = () => resolve(reply(payload([sample('fuel')], false))); });
    return reply(payload([sample('fuel')], false));
  });
  const first = loadNearbyPlaces([105, 21], 'fuel');
  const moved = loadNearbyPlaces([105, 21.001], 'rest');
  complete(); await Promise.all([first, moved]);
  assert.equal(calls, 2);
  await loadNearbyPlaces([105, 21.002], 'fuel');
  assert.equal(calls, 3);
});
