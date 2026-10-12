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
