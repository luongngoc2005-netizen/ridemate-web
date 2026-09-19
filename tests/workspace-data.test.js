import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { journalStore, readWorkspaceBackup } from '../src/journal-data.js';
import { applyWorkspace, readLocalWorkspace } from '../src/workspace-data.js';
import { STORAGE_KEY, createTrip } from '../src/trip-data.js';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const entry = id => ({ id, title: id, date: '2026-09-17', km: 1, memory: '', story: '', places: [], photos: [] });
test('IndexedDB version 1 upgrades without losing existing journals', async () => {
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('ridemate-journal', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(entry('local'));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
  assert.deepEqual(await journalStore('getAll'), [entry('local')]);
  assert.equal(await readWorkspaceBackup(), undefined);
});
test('Loading cloud data preserves a complete recoverable local backup including the trip', async () => {
  const local = storage();
  const trip = createTrip({ origin: 'Hà Nội', destination: 'Hà Giang', date: '2026-09-17', days: 2 });
  local.setItem(STORAGE_KEY, JSON.stringify(trip));
  await journalStore('put', entry('local'));
  const cloud = { version: 1, trip: null, entries: [entry('cloud')] };
  await applyWorkspace(cloud, local);
  assert.deepEqual(await readLocalWorkspace(local), cloud);
  const backup = await readWorkspaceBackup();
  assert.equal(backup.trip.id, trip.id);
  assert.equal(backup.entries[0].id, 'local');
  await applyWorkspace(backup, local);
  assert.deepEqual(await readLocalWorkspace(local), backup);
});
test('Denied localStorage write leaves journal data unchanged', async () => {
  const before = await journalStore('getAll');
  const denied = { getItem: () => null, removeItem: () => { throw new Error('Storage denied'); } };
  await assert.rejects(applyWorkspace({ version: 1, trip: null, entries: [] }, denied), /Storage denied/);
  assert.deepEqual(await journalStore('getAll'), before);
});
test('IndexedDB failure rolls back the localStorage trip', async () => {
  const local = storage();
  const trip = createTrip({ origin: 'Hà Nội', destination: 'Hà Giang', date: '2026-09-17', days: 2 });
  local.setItem(STORAGE_KEY, JSON.stringify(trip));
  const realDatabase = globalThis.indexedDB;
  globalThis.indexedDB = { open: () => {
    const request = { error: new Error('IndexedDB denied') };
    queueMicrotask(() => request.onerror());
    return request;
  } };
  try {
    await assert.rejects(applyWorkspace({ version: 1, trip: null, entries: [] }, local), /IndexedDB denied/);
    assert.equal(JSON.parse(local.getItem(STORAGE_KEY)).id, trip.id);
  } finally { globalThis.indexedDB = realDatabase; }
});
