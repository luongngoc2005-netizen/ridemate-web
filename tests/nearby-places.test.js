import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNearbyPlaces, loadPlaces, mapServices } from '../src/route-data.js';

let example = 0;
test.beforeEach(t => {
  const endpoint = mapServices.places;
  mapServices.places = `https://nearby-test.invalid/${++example}`;
  t.after(() => { mapServices.places = endpoint; });
});

test('nearby search uses GPS coordinates, filters radius and sorts nearest first', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.match(options.body.get('data'), /around:2000,21,105/);
    assert.match(options.body.get('data'), /amenity=fuel/);
    assert.match(options.body.get('data'), /hotel\|guest_house\|motel/);
    assert.match(options.body.get('data'), /motorcycle_repair\|car_repair\|tyres/);
    assert.match(options.body.get('data'), /service:motorcycle:repair/);
    return { ok: true, json: async () => ({ elements: [
      { type: 'node', id: 1, lat: 21.005, lon: 105, tags: { amenity: 'fuel', name: 'Further' } },
      { type: 'node', id: 2, lat: 21.001, lon: 105, tags: { amenity: 'fuel', name: 'Nearer' } },
      { type: 'node', id: 3, lat: 22, lon: 105, tags: { amenity: 'fuel', name: 'Outside radius' } },
    ] }) };
  };
  try { assert.deepEqual((await loadNearbyPlaces([105, 21], 'fuel')).map(p => p.name), ['Nearer', 'Further']); }
  finally { globalThis.fetch = original; }
});

test('nearby search rejects missing GPS and unsupported categories', async () => {
  await assert.rejects(loadNearbyPlaces(null, 'fuel'));
  await assert.rejects(loadNearbyPlaces([105, 21], 'invalid'));
});

test('incomplete provider responses are errors rather than empty nearby results', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ elements: [], remark: 'timeout' }) });
  try { await assert.rejects(loadNearbyPlaces([105, 21], 'rest'), /Chưa tải đủ/); }
  finally { globalThis.fetch = original; }
});

test('categories and small GPS changes share an area cache; distant areas and refresh fetch again', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({elements:[]})};});
  await loadNearbyPlaces([105.01,21.01],'fuel');
  await loadNearbyPlaces([105.01,21.01],'fuel');assert.equal(calls,1);
  await loadNearbyPlaces([105.01,21.01],'rest');assert.equal(calls,1);
  await loadNearbyPlaces([105.011,21.01],'repair');assert.equal(calls,1);
  await loadNearbyPlaces([105.02,21.01],'fuel');assert.equal(calls,2);
  await loadNearbyPlaces([105.01,21.01],'fuel',undefined,{refresh:true});assert.equal(calls,3);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadNearbyPlaces([105.01,21.01],'fuel',controller.signal),{name:'AbortError'});
  assert.equal(calls,3);
});

test('provider errors do not become empty results and are not cached', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:false,status:503};});
  await assert.rejects(loadNearbyPlaces([105.03,21.01],'fuel'),/Google Maps/);
  await assert.rejects(loadNearbyPlaces([105.03,21.01],'fuel'),/Google Maps/);
  assert.equal(calls,2);
});

test('cached elements are re-filtered at the current GPS, including newly visible edge points', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return { ok: true, json: async () => ({ elements: [
      { type: 'node', id: 10, lon: 105, lat: 21.015, tags: { amenity: 'fuel', name: 'North edge' } },
      { type: 'node', id: 11, lon: 105, lat: 20.987, tags: { amenity: 'fuel', name: 'South edge' } },
      { type: 'node', id: 12, lon: 105, lat: 21.001, tags: { tourism: 'hotel', name: 'Hotel' } },
      { type: 'node', id: 13, lon: 105, lat: 21.002, tags: { shop: 'motorcycle', 'service:motorcycle:repair': 'yes', name: 'Repair' } },
    ] }) };
  });
  assert.deepEqual((await loadNearbyPlaces([105, 21], 'fuel')).map(p => p.name), ['South edge']);
  const moved = await loadNearbyPlaces([105, 21.003], 'fuel');
  assert.deepEqual(moved.map(p => p.name), ['North edge']);
  assert.ok(moved[0].distanceMeters < 1500);
  assert.equal((await loadNearbyPlaces([105, 21.003], 'rest'))[0].name, 'Hotel');
  assert.equal((await loadNearbyPlaces([105, 21.003], 'repair'))[0].name, 'Repair');
  assert.equal(calls, 1);
});

test('switching category while loading reuses the request without cancelling the new subscriber', async t => {
  let complete, calls = 0, requestSignal;
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    calls++; requestSignal = signal;
    return new Promise(resolve => { complete = () => resolve({ ok: true, json: async () => ({ elements: [] }) }); });
  });
  const first = new AbortController();
  const fuel = loadNearbyPlaces([105, 21], 'fuel', first.signal);
  const cancelled = assert.rejects(fuel, { name: 'AbortError' });
  first.abort();
  const rest = loadNearbyPlaces([105, 21], 'rest');
  await cancelled;
  assert.equal(requestSignal.aborted, false);
  complete();
  assert.deepEqual(await rest, []);
  assert.equal(calls, 1);
});

test('leaving nearby search cancels the request and cannot cache a late reply', async t => {
  let complete, requestSignal, calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    calls++; requestSignal = signal;
    if (calls > 1) return { ok: true, json: async () => ({ elements: [] }) };
    return new Promise(resolve => { complete = () => resolve({ ok: true, json: async () => ({ elements: [] }) }); });
  });
  const controller = new AbortController();
  const search = loadNearbyPlaces([105, 21], 'fuel', controller.signal);
  const cancelled = assert.rejects(search, { name: 'AbortError' });
  controller.abort(); await cancelled;
  assert.equal(requestSignal.aborted, true);
  complete();
  await loadNearbyPlaces([105, 21], 'rest');
  assert.equal(calls, 2);
});

test('area cache expires after five minutes and does not mix service endpoints', async t => {
  let now = Date.now(), calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: true, json: async () => ({ elements: [] }) }; });
  await loadNearbyPlaces([105, 21], 'fuel');
  now += 300001;
  await loadNearbyPlaces([105, 21], 'fuel');
  assert.equal(calls, 2);
  mapServices.places += '/other';
  await loadNearbyPlaces([105, 21], 'rest');
  assert.equal(calls, 3);
});

test('rate limiting pauses nearby and remaining corridor requests for thirty seconds', async t => {
  let now = Date.now(), calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status: 429 }; });
  const route = { coordinates: [[105.8, 21], [106.8, 21]] };
  const result = await loadPlaces(route);
  assert.ok(result.total > 1);
  assert.equal(result.failed, result.total);
  assert.equal(calls, 1);
  await assert.rejects(loadNearbyPlaces([105.8, 21], 'fuel'), /30 giây/);
  assert.equal(calls, 1);
  now += 30001;
  await assert.rejects(loadNearbyPlaces([105.8, 21], 'fuel'), /Google Maps/);
  assert.equal(calls, 2);
});

test('stalled nearby search stops at ten seconds with actionable feedback', async t => {
  const realSetTimeout=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>realSetTimeout(fn,delay===10000?1:delay,...args));
  let stopped=false;
  t.mock.method(globalThis,'fetch',async(_url,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>{stopped=true;reject(new DOMException('Aborted','AbortError'));},{once:true});
  }));
  await assert.rejects(loadNearbyPlaces([105.04,21.01],'rest'),/phản hồi chậm/);
  assert.equal(stopped,true);
});
