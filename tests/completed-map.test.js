import test from 'node:test';
import assert from 'node:assert/strict';
import { canLoadTripMap } from '../src/trip-map-state.js';
import { loadTripRoute } from '../src/route-data.js';

test('completed and absent plans never geocode or request routes', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Completed plans must not call map services'); });
  assert.equal(await loadTripRoute(null), null);
  assert.equal(await loadTripRoute({ completedAt: '2026-10-17', origin: 'Hà Nội', destination: 'Cao Bằng', itinerary: [] }), null);
  assert.equal(canLoadTripMap({ completedAt: '2026-10-17' }), false);
  assert.equal(canLoadTripMap({ completedAt: null }), true);
  assert.equal(canLoadTripMap({}), true);
});
