import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationStore } from '../src/navigation-store.js';

function browser() {
  const entries = [{ state: null, url: 'https://demo.test/?keep=yes' }];
  let cursor = 0;
  const listeners = {};
  return {
    get location() { return new URL(entries[cursor].url); },
    addEventListener(name, fn) { listeners[name] = fn; }, scrollTo() {},
    history: {
      get state() { return entries[cursor].state; },
      get length() { return entries.length; },
      replaceState(state, _unused, url) { entries[cursor] = { state, url }; },
      pushState(state, _unused, url) { entries.splice(cursor + 1); entries.push({ state, url }); cursor++; },
      go(offset) { cursor += offset; listeners.popstate({ state: entries[cursor].state }); },
    },
  };
}
const tick = () => new Promise(resolve => queueMicrotask(resolve));
test('one navigation batches trip selection and page; Back/Forward restore without adding entries', async () => {
  const b = browser(), store = createNavigationStore(b);
  store.register('page', 'home'); store.register('activeId', null);
  store.set('activeId', 'trip-1'); store.set('page', 'trip'); await tick();
  assert.equal(b.history.length, 2);
  b.history.go(-1); assert.equal(store.get('page'), 'home'); assert.equal(store.get('activeId'), null);
  b.history.go(1); assert.equal(store.get('page'), 'trip'); assert.equal(store.get('activeId'), 'trip-1');
  assert.equal(b.history.length, 2); assert.equal(b.location.searchParams.get('keep'), 'yes');
});
test('draft snapshots stay out of URL/history payload and replacement does not add a step', async () => {
  const b = browser(), store = createNavigationStore(b);
  store.set('journal.draft.guest', { story: 'private draft' }); await tick();
  assert.doesNotMatch(JSON.stringify(b.history.state) + b.location.href, /private draft/);
  store.set('journal.draft.guest', null, { replace: true }); await tick();
  assert.equal(b.history.length, 2);
});
test('busy operations block Back and restore the original history position', async () => {
  const b = browser(), store = createNavigationStore(b);
  store.set('page', 'journal'); await tick();
  const release = store.block(); b.history.go(-1);
  assert.equal(store.get('page'), 'journal');
  assert.equal(b.location.searchParams.get('page'), 'journal');
  release(); b.history.go(-1); assert.equal(b.location.searchParams.get('page'), 'home');
});
test('reload preserves URL route and can navigate to older history entries', async () => {
  const b = browser(), first = createNavigationStore(b);
  first.set('page', 'plans'); await tick(); first.set('page', 'trip'); first.set('activeId', 'id'); await tick();
  const reloaded = createNavigationStore(b);
  assert.equal(reloaded.get('activeId'), 'id');
  b.history.go(-1); assert.equal(reloaded.get('page'), 'plans');
  b.history.go(1); assert.equal(reloaded.get('page'), 'trip');
});
