import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutePlaceRequests, requestedPlaceTypes } from '../src/route-place-requests.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const result = places => ({ places, completed: 1, total: 1, failed: 0 });
function harness() {
  const calls = [], updates = [];
  const requests = createRoutePlaceRequests((route, type, signal, progress) => new Promise((resolve, reject) => {
    calls.push({ route, type, signal, progress, resolve, reject });
  }), (route, type, state) => updates.push({ route, type, state }));
  return { calls, updates, requests };
}

test('opening the journey without choosing a type does not request any POIs', async () => {
  assert.deepEqual(requestedPlaceTypes(), []);
  assert.deepEqual(requestedPlaceTypes(['fuel', 'planned', 'fuel', 'rest']), ['fuel', 'rest']);
  const { calls, requests } = harness();
  requests.sync({}, []); await tick(); assert.equal(calls.length, 0);
  requests.dispose();
});

test('newly selected types load independently and deselecting cancels only that type', async () => {
  const { requests, calls, updates } = harness(), route = {};
  requests.sync(route, ['fuel']); await tick();
  assert.deepEqual(calls.map(c => c.type), ['fuel']);
  requests.sync(route, ['fuel', 'rest']); await tick();
  assert.deepEqual(calls.map(c => c.type), ['fuel', 'rest']);
  assert.equal(calls[0].signal.aborted, false);
  requests.sync(route, ['rest']);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls[1].signal.aborted, false);
  const before = updates.length;
  calls[0].progress(result([{ id: 'stale' }])); calls[0].resolve(result([{ id: 'stale' }]));
  await tick(); assert.equal(updates.length, before);
  calls[1].resolve(result([{ id: 'rest' }])); await tick();
  assert.equal(updates.at(-1).state.items[0].id, 'rest');
  requests.dispose();
});

test('successful types are reused on reselect; failures retry without reloading successes', async () => {
  const { requests, calls } = harness(), route = {};
  requests.sync(route, ['fuel', 'repair']); await tick();
  calls.find(c => c.type === 'fuel').resolve(result([{ id: 'fuel' }]));
  calls.find(c => c.type === 'repair').reject(new Error('offline')); await tick();
  requests.sync(route, ['fuel', 'repair']); await tick(); assert.equal(calls.length, 2);
  requests.sync(route, ['fuel', 'repair'], 1); await tick();
  assert.equal(calls.length, 3); assert.equal(calls[2].type, 'repair');
  calls[2].resolve(result([])); await tick();
  requests.sync(route, []); requests.sync(route, ['fuel']); await tick();
  assert.equal(calls.length, 3);
  requests.dispose();
});

test('changing or clearing a route cancels old jobs and ignores late results', async () => {
  const { requests, calls, updates } = harness(), first = {}, second = {};
  requests.sync(first, ['fuel']); await tick();
  requests.sync(second, ['fuel']); await tick();
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve(result([{ id: 'old' }])); await tick();
  assert.ok(!updates.some(update => update.state.items.some(p => p.id === 'old')));
  requests.sync(null, ['fuel']); assert.equal(calls[1].signal.aborted, true);
  calls[1].resolve(result([])); await tick();
  assert.equal(calls.length, 2);
  requests.dispose();
});
