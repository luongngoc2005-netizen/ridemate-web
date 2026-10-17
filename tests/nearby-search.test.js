import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyStatus, nearbyMapsUrl } from '../src/nearby-search.js';

test('nearby buttons report GPS, loading, errors, empty and successful results distinctly', () => {
  assert.match(nearbyStatus({ pending: true }, null, { items: [] }), /Đang lấy vị trí/);
  assert.match(nearbyStatus({}, null, { items: [] }), /Bật định vị/);
  assert.equal(nearbyStatus({ error: 'Permission denied' }, null, { items: [] }), 'Permission denied');
  const search = { key: 'fuel', point: [105, 21] };
  assert.match(nearbyStatus({}, search, { items: [], loading: false }), /Đang tìm/);
  assert.equal(nearbyStatus({}, search, { items: [], error: 'Offline' }), 'Offline');
  assert.match(nearbyStatus({}, search, { items: [], ready: true }), /Chưa tìm thấy/);
  assert.match(nearbyStatus({}, search, { items: [{ id: 1 }], ready: true }), /Tìm thấy 1/);
});

test('external nearby search uses the requested category and the exact GPS snapshot', () => {
  for (const [category, term] of [['fuel', 'gas station'], ['rest', 'hotel']]) {
    const url = new URL(nearbyMapsUrl([106.2587824, 22.665781], category));
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('query'), `${term} near 22.665781,106.2587824`);
  }
  assert.throws(() => nearbyMapsUrl(null, 'fuel'));
});
