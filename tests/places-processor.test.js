import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createPlaceAccumulator, routePosition, selectPlaces } from '../src/places-data.js';
import { createPlaceProcessor } from '../src/places-processor.js';

const route = [[105, 20], [105, 22]];
const place = (id, lat = 21) => ({ type: 'node', id, lon: 105, lat, tags: { amenity: 'fuel', name: `Fuel ${id}` } });

test('Incremental filtering computes each position once, including rejected points', () => {
  let computations = 0;
  const accumulator = createPlaceAccumulator(route, (...args) => { computations++; return routePosition(...args); });
  const a = place(1), b = place(2, 21.5), far = { ...place(3), lon: 108 };
  accumulator.add([a, far]); accumulator.snapshot(); accumulator.snapshot();
  accumulator.add([a, far, b]); accumulator.snapshot();
  assert.equal(computations, 3);
  assert.deepEqual(accumulator.snapshot(), selectPlaces([a, far, b], route));
  const otherRoute = createPlaceAccumulator([[108, 20], [108, 22]]);
  otherRoute.add([far]); assert.equal(otherRoute.snapshot().length, 1);
});

test('Actual worker returns incremental results matching the synchronous filter', async () => {
  let nativeWorker, terminated = false;
  const factory = () => {
    nativeWorker = new Worker(new URL('./helpers/places-worker-harness.mjs', import.meta.url));
    const adapter = { postMessage: data => nativeWorker.postMessage(data), terminate() { terminated = true; nativeWorker.terminate(); } };
    nativeWorker.on('message', data => adapter.onmessage?.({ data }));
    nativeWorker.on('error', error => adapter.onerror?.(error));
    return adapter;
  };
  const processor = createPlaceProcessor(route, undefined, factory);
  try {
    assert.deepEqual(await processor.add([place(1)]), selectPlaces([place(1)], route));
    assert.deepEqual(await processor.add([place(1), place(2)]), selectPlaces([place(1), place(2)], route));
  } finally { processor.dispose(); }
  assert.equal(terminated, true);
});

test('Worker failure replays prior segments in fallback without losing pins', async () => {
  let worker, count = 0;
  const factory = () => worker = {
    terminate() {},
    postMessage(data) {
      if (++count === 1) queueMicrotask(() => this.onmessage({ data: { id: data.id, places: selectPlaces(data.elements, route) } }));
      else queueMicrotask(() => this.onerror({ preventDefault() {} }));
    },
  };
  const processor = createPlaceProcessor(route, undefined, factory);
  try {
    await processor.add([place(1)]);
    assert.deepEqual(await processor.add([place(2)]), selectPlaces([place(1), place(2)], route));
  } finally { processor.dispose(); }
});

test('Abort terminates pending worker work and rejects without publishing stale pins', async () => {
  const controller = new AbortController(); let terminated = false;
  const processor = createPlaceProcessor(route, controller.signal, () => ({ postMessage() {}, terminate() { terminated = true; } }));
  const pending = processor.add([place(1)]); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(terminated, true);
  await assert.rejects(processor.add([place(2)]), { name: 'AbortError' });
});

test('Without workers, filtering yields to the event loop and supports cancellation', async () => {
  const controller = new AbortController();
  const coordinates = Array.from({ length: 15000 }, (_, i) => [105, 20 + i / 14999 * 2]);
  const processor = createPlaceProcessor(coordinates, controller.signal, () => null);
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await assert.rejects(processor.add(Array.from({ length: 2000 }, (_, i) => place(i, 20 + i / 1000))), { name: 'AbortError' });
  } finally { clearTimeout(timer); processor.dispose(); }
});
