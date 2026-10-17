import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoute, routePosition } from '../src/route-data.js';
import { domesticShapingPoints, domesticRequestChunks } from '../src/domestic-routing.js';
import { isDomesticRoute } from '../src/vietnam-guard.js';

const start = { label: 'Cao Bằng', coordinates: [106.2587824, 22.665781] };
const end = { label: 'An Giang request', coordinates: [105.0270095, 10.5307999] };
const response = coordinates => {
  const legs = coordinates.slice(1).map((point, index) => ({
    distance: routePosition(coordinates[index], [coordinates[index], point]).total,
    duration: 1200,
    steps: [{ geometry: { coordinates: [coordinates[index], point] } }],
  }));
  return { ok: true, json: async () => ({ code: 'Ok', routes: [{
    distance: legs.reduce((sum, leg) => sum + leg.distance, 0),
    duration: legs.length * 1200, geometry: { coordinates }, legs,
  }] }) };
};

test('The failing cross-country request uses bounded short legs and merges them in order', async t => {
  let active = 0, peak = 0;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const payload = JSON.parse(new URL(input).searchParams.get('json'));
    const coordinates = payload.locations.map(p => [p.lon, p.lat]);
    requests.push(coordinates);
    assert.ok(coordinates.length >= 2 && coordinates.length <= 3, 'Batch a few legs, never the oversized all-country request');
    assert.ok(coordinates.slice(1).reduce((sum, point, index) => sum + routePosition(coordinates[index], [coordinates[index], point]).total, 0) <= 500000);
    assert.equal(payload.alternates, 0);
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, coordinates[0][1] > 22 ? 15 : 1));
    active--;
    return response(coordinates);
  });
  const route = await loadRoute(start, end);
  const expected = [start, ...domesticShapingPoints(start, end), end];
  assert.equal(peak, 2);
  assert.equal(requests.length, domesticRequestChunks(expected).length);
  assert.equal(requests.length, 5, 'Reduce the failing case from nine calls to five');
  assert.deepEqual(route.points.map(p => p.coordinates), expected.map(p => p.coordinates));
  assert.deepEqual(route.legs.map(leg => leg.start.coordinates), expected.slice(0, -1).map(p => p.coordinates));
  assert.equal(route.legs.length, expected.length - 1);
  assert.equal(route.distanceKm, route.legs.reduce((sum, leg) => sum + leg.distanceKm, 0));
  assert.equal(isDomesticRoute(route), true);
});

test('Splitting a long itinerary preserves user stops, day metadata and input data', async t => {
  const stops = [{ id: 'user-stop', name: 'My stop', coordinates: [105.681, 18.679], dayNumber: 2, dayId: 'day-2' }];
  const before = structuredClone(stops);
  t.mock.method(globalThis, 'fetch', async input => response(
    JSON.parse(new URL(input).searchParams.get('json')).locations.map(p => [p.lon, p.lat]),
  ));
  const route = await loadRoute(start, end, undefined, stops);
  assert.deepEqual(stops, before);
  assert.deepEqual(route.points.find(p => p.id === 'user-stop'), { ...stops[0] });
  assert.ok(route.points.some(p => p.routingOnly));
  assert.ok(route.legs.every(leg => leg.dayNumber === 2));
  assert.equal(isDomesticRoute(route), true);
});

test('A provider distance-limit error on a multi-stop request retries short legs', async t => {
  const a = { label: 'Limit start', coordinates: [105.854, 21.028] };
  const b = { label: 'Limit end', coordinates: [106.679, 20.883] };
  const stop = { id: 'limit-stop', name: 'Stop', coordinates: [106, 21] };
  const sizes = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const coordinates = JSON.parse(new URL(input).searchParams.get('json')).locations.map(p => [p.lon, p.lat]);
    sizes.push(coordinates.length);
    if (coordinates.length > 2) return { ok: false, status: 400, json: async () => ({ code: 'DistanceExceeded', message: 'Path distance exceeds the max distance limit.' }) };
    return response(coordinates);
  });
  const route = await loadRoute(a, b, undefined, [stop]);
  assert.deepEqual(sizes, [3, 2, 2]);
  assert.deepEqual(route.points.map(p => p.coordinates), [a.coordinates, stop.coordinates, b.coordinates]);
});

test('An unsplittable distance-limit error explains the provider limit', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 400,
    json: async () => ({ code: 'DistanceExceeded', message: 'Path distance exceeds the max distance limit.' }),
  }));
  await assert.rejects(loadRoute(
    { label: 'Short start', coordinates: [105.85, 21.03] },
    { label: 'Short end', coordinates: [106.68, 20.88] },
  ), error => error.code === 'ROUTE_DISTANCE_EXCEEDED' && /vượt giới hạn chiều dài/.test(error.message));
});

test('Retrying a failed final leg reuses successful legs and reports progress', async t => {
  const a = { ...start, label: 'Retry start' }, b = { ...end, label: 'Retry end' };
  let fail = true;
  const requests = [], progress = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const coordinates = JSON.parse(new URL(input).searchParams.get('json')).locations.map(p => [p.lon, p.lat]);
    requests.push(coordinates);
    if (fail && coordinates.at(-1).every((n, i) => n === b.coordinates[i])) {
      await new Promise(resolve => setTimeout(resolve, 5));
      return { ok: false, status: 503 };
    }
    return response(coordinates);
  });
  await assert.rejects(loadRoute(a, b), /Dịch vụ bản đồ/);
  const prior = requests.length;
  fail = false;
  const route = await loadRoute(a, b, undefined, [], message => progress.push(message));
  assert.equal(requests.length - prior, 1);
  assert.equal(isDomesticRoute(route), true);
  assert.match(progress.at(-1), new RegExp(`${route.legs.length}/${route.legs.length}`));
});

test('Rejected batches fall back to individual legs without recursion or extra concurrency', async t => {
  const fresh = await import('../src/route-data.js?batch-limit-fallback');
  let active = 0, peak = 0, batches = 0;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const coordinates = JSON.parse(new URL(input).searchParams.get('json')).locations.map(p => [p.lon, p.lat]);
    requests.push(coordinates);
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    if (coordinates.length > 2) {
      batches++;
      return { ok: false, status: 400, json: async () => ({ code: 'DistanceExceeded' }) };
    }
    return response(coordinates);
  });
  const route = await fresh.loadRoute(start, end);
  const expected = [start, ...domesticShapingPoints(start, end), end];
  assert.equal(batches, 4);
  assert.equal(requests.length, 13);
  assert.equal(peak, 2);
  assert.deepEqual(route.points.map(p => p.coordinates), expected.map(p => p.coordinates));
  assert.equal(isDomesticRoute(route), true);
});

test('A completed route is reused without another provider request', async t => {
  const fresh = await import('../src/route-data.js?completed-route-cache');
  let calls = 0, cached = false;
  t.mock.method(globalThis, 'fetch', async input => {
    if (cached) throw new Error('Cached route must not call the provider');
    calls++;
    return response(JSON.parse(new URL(input).searchParams.get('json')).locations.map(p => [p.lon, p.lat]));
  });
  await fresh.loadRoute(start, end);
  assert.equal(calls, 5);
  cached = true;
  const route = await fresh.loadRoute(start, end);
  assert.equal(calls, 5);
  assert.equal(isDomesticRoute(route), true);
});

test('A stalled batch falls back to short legs before the full request timeout', async t => {
  const fresh = await import('../src/route-data.js?batch-timeout-fallback');
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, delay, ...args) => realSetTimeout(fn, delay === 8000 ? 1 : delay, ...args));
  let abortedBatch = false, singles = 0;
  t.mock.method(globalThis, 'fetch', async (input, { signal }) => {
    const coordinates = JSON.parse(new URL(input).searchParams.get('json')).locations.map(p => [p.lon, p.lat]);
    if (coordinates.length > 2 && coordinates[0].every((n, i) => n === start.coordinates[i])) {
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
        abortedBatch = true; reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true }));
    }
    if (coordinates.length === 2) singles++;
    return response(coordinates);
  });
  const route = await fresh.loadRoute(start, end);
  assert.equal(abortedBatch, true);
  assert.equal(singles, 3, 'Two fallback legs plus the final single-leg batch');
  assert.equal(isDomesticRoute(route), true);
});
