import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapLibraryLoader} from '../src/maplibre-loader.js';

test('dynamic loader unwraps the worker URL and shares one load across maps', async () => {
  let calls = 0;
  const workerUrls = [], library = {setWorkerUrl: value => workerUrls.push(value)};
  const load = createMapLibraryLoader({
    library: async () => { calls++; return library; },
    worker: async () => ({default: '/assets/maplibre-gl-worker-installed.js'}),
    stylesheet: async () => ({}),
  });
  const first = load(), second = load();
  assert.equal(first, second);
  assert.deepEqual(await Promise.all([first, second]), [library, library]);
  assert.equal(await load(), library);
  assert.equal(calls, 1);
  assert.deepEqual(workerUrls, ['/assets/maplibre-gl-worker-installed.js']);
});

test('a failed load can be retried explicitly without an automatic retry loop', async () => {
  let attempts = 0;
  const library = {setWorkerUrl() {}};
  const load = createMapLibraryLoader({
    library: async () => { if (++attempts === 1) throw new Error('offline'); return {default: library}; },
    worker: async () => ({default: '/assets/worker.js'}), stylesheet: async () => ({}),
  });
  await assert.rejects(load(), /offline/);
  assert.equal(attempts, 1);
  assert.equal(await load(), library);
  assert.equal(attempts, 2);
});

test('missing worker URL is rejected before map initialization', async () => {
  let configured = false;
  const load = createMapLibraryLoader({
    library: async () => ({setWorkerUrl() {configured = true;}}),
    worker: async () => ({}), stylesheet: async () => ({}),
  });
  await assert.rejects(load(), /worker URL/);
  assert.equal(configured, false);
});
