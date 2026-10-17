import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNearbyPlaces } from '../src/route-data.js';

test('nearby search uses GPS coordinates, filters radius and sorts nearest first', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.match(options.body.get('data'), /around:1500,21,105/);
    assert.match(options.body.get('data'), /amenity=fuel/);
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

test('nearby cache is isolated by exact GPS/category, and explicit refresh bypasses it', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({elements:[]})};});
  await loadNearbyPlaces([105.01,21.01],'fuel');
  await loadNearbyPlaces([105.01,21.01],'fuel');assert.equal(calls,1);
  await loadNearbyPlaces([105.01,21.01],'rest');assert.equal(calls,2);
  await loadNearbyPlaces([105.02,21.01],'fuel');assert.equal(calls,3);
  await loadNearbyPlaces([105.01,21.01],'fuel',undefined,{refresh:true});assert.equal(calls,4);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadNearbyPlaces([105.01,21.01],'fuel',controller.signal),{name:'AbortError'});
  assert.equal(calls,4);
});

test('provider errors do not become empty results and are not cached', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:false,status:406};});
  await assert.rejects(loadNearbyPlaces([105.03,21.01],'fuel'),/Google Maps/);
  await assert.rejects(loadNearbyPlaces([105.03,21.01],'fuel'),/Google Maps/);
  assert.equal(calls,2);
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
