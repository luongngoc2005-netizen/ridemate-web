import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournalSync } from '../src/journal-sync.js';
import { provinces, travelDestinations } from '../src/provinces.js';

const entry = (id, story = '') => ({ id, title: id, date: '2026-09-20', km: 10, story, memory: '', places: [], photos: [] });
function backend(initial = []) {
  let row = { revision: 1, payload: { version: 1, trip: { id: 'keep-trip' }, entries: initial } };
  const transport = {
    read: async () => structuredClone(row),
    commit: async (payload, revision) => {
      if (revision !== row.revision) throw Object.assign(new Error('Conflict'), { code: '40001' });
      row = { revision: revision + 1, payload: structuredClone(payload) };
    },
    upload: async value => structuredClone(value),
    hydrate: async value => structuredClone(value),
  };
  return { transport, repository: () => createJournalSync(transport), data: () => row.payload };
}
test('Journal saved on device A is loaded on device B without manual backup', async () => {
  const server = backend(); const a = server.repository(), b = server.repository();
  await a.put(entry('a'));
  assert.equal((await b.getAll())[0].id, 'a');
  assert.deepEqual(server.data().trip, { id: 'keep-trip' });
});
test('Two devices editing different journals preserve both changes', async () => {
  const server = backend([entry('a'), entry('b')]); const a = server.repository(), b = server.repository();
  const first = (await a.getAll())[0], second = (await b.getAll())[1];
  await a.put({ ...first, story: 'Device A' });
  await b.put({ ...second, story: 'Device B' });
  assert.deepEqual(server.data().entries.map(item => item.story).sort(), ['Device A', 'Device B']);
  assert.ok(server.data().entries.every(item => !('_cloudBase' in item)));
});
test('Same-journal conflict does not overwrite another device', async () => {
  const server = backend([entry('a')]); const a = server.repository(), b = server.repository();
  const first = (await a.getAll())[0], stale = (await b.getAll())[0];
  await a.put({ ...first, story: 'New' });
  await assert.rejects(b.put({ ...stale, story: 'Old' }), /thiết bị khác/);
  assert.equal(server.data().entries[0].story, 'New');
  await assert.rejects(b.delete(stale), /thiết bị khác/);
});
test('Delete propagates and a stale editor cannot resurrect the journal', async () => {
  const server = backend([entry('a')]); const a = server.repository(), b = server.repository();
  const saved = (await a.getAll())[0], stale = (await b.getAll())[0];
  await a.delete(saved);
  assert.deepEqual(await b.getAll(), []);
  await assert.rejects(b.put({ ...stale, story: 'stale edit' }), /thiết bị khác/);
});
test('Revision race retries by merging the journal into the latest workspace', async () => {
  const server = backend(); const original = server.transport.commit; let first = true;
  server.transport.commit = async (payload, revision) => {
    if (first) {
      first = false;
      await original({ ...server.data(), entries: [entry('other')] }, revision);
      throw Object.assign(new Error('Conflict'), { code: '40001' });
    }
    return original(payload, revision);
  };
  await server.repository().put(entry('mine'));
  assert.deepEqual(server.data().entries.map(item => item.id).sort(), ['mine', 'other']);
});
test('Retry after a committed request loses its response is idempotent', async () => {
  const server = backend(); const original = server.transport.commit; let first = true;
  server.transport.commit = async (payload, revision) => {
    await original(payload, revision);
    if (first) { first = false; throw new Error('Network interrupted'); }
  };
  const repo = server.repository();
  await assert.rejects(repo.put(entry('mine')), /Network interrupted/);
  await repo.put(entry('mine'));
  assert.equal(server.data().entries.length, 1);
});
test('Photo upload failure never changes cloud metadata', async () => {
  const server = backend([entry('old')]);
  server.transport.upload = async () => { throw new Error('Upload failed'); };
  await assert.rejects(server.repository().put(entry('new')), /Upload failed/);
  assert.equal(server.data().entries[0].id, 'old');
});
test('Province options contain 34 unique current units and separate travel destinations', () => {
  assert.equal(provinces.length, 34);
  assert.equal(new Set(provinces).size, 34);
  assert.ok(provinces.includes('Hà Nội') && provinces.includes('Huế'));
  assert.ok(travelDestinations.includes('Hà Giang'));
});
