import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCloud, validateWorkspace, downloadCloud } from '../src/cloud-data.js';

const user = '11111111-1111-4111-8111-111111111111';
const entry = () => ({ id: 'completed-trip-id', title: 'Hà Giang', date: '2026-09-17', km: 300, memory: '', story: '', places: ['Đồng Văn'], photos: [{ id: 'photo-1', name: 'test.jpg', src: 'data:image/jpeg;base64,YWJj' }] });
const workspace = () => ({ version: 1, trip: null, entries: [entry()] });
function client({ uploadError, rpcError, differentUser = false } = {}) {
  const calls = [];
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: differentUser ? 'another-user' : user } } }) },
    storage: { from: () => ({ upload: async (path, blob) => { calls.push({ path, type: blob.type }); return { error: uploadError }; } }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: 2, error: rpcError }; },
  };
}
test('Upload keeps local photos intact and commits metadata only after private uploads', async () => {
  const api = client(); const local = workspace(); const before = structuredClone(local);
  assert.equal(await saveCloud(api, user, local, 1), 2);
  assert.deepEqual(local, before);
  assert.equal(api.calls.length, 2);
  assert.ok(api.calls[0].path.startsWith(`${user}/`));
  const { args } = api.calls[1];
  assert.equal(args.expected_user_id, user);
  assert.equal(args.expected_revision, 1);
  assert.equal(args.new_payload.entries[0].photos[0].src, undefined);
  validateWorkspace(args.new_payload, true, user);
});
test('Photo upload failure never commits a partial workspace', async () => {
  const api = client({ uploadError: new Error('Upload failed') });
  await assert.rejects(saveCloud(api, user, workspace(), 0), /Upload failed/);
  assert.equal(api.calls.length, 1);
});
test('Conflicting cloud revision surfaces an actionable error', async () => {
  const api = client({ rpcError: { code: '40001' } });
  await assert.rejects(saveCloud(api, user, workspace(), 1), /Thiết bị khác/);
});
test('Changing accounts aborts before uploading or writing', async () => {
  const api = client({ differentUser: true });
  await assert.rejects(saveCloud(api, user, workspace(), 0), /Phiên đăng nhập/);
  assert.equal(api.calls.length, 0);
});
test('Workspace rejects duplicate journal IDs and photos outside the owner folder', () => {
  const duplicate = workspace(); duplicate.entries.push(entry());
  assert.throws(() => validateWorkspace(duplicate), /trùng ID/);
  const remote = workspace(); remote.entries[0].photos = [{ id: '1', name: 'x', path: 'other-user/x.jpeg' }];
  assert.throws(() => validateWorkspace(remote, true, user), /ảnh không hợp lệ/);
  const invalid = workspace(); invalid.entries[0].km = 'not-a-number';
  assert.throws(() => validateWorkspace(invalid), /nhật ký không hợp lệ/);
});
test('Missing remote photo aborts download without returning a partial workspace', async () => {
  const remote = workspace(); remote.entries[0].photos = [{ id: '1', name: 'x', path: `${user}/x.jpeg` }];
  const api = client(); api.storage.from = () => ({ download: async () => ({ error: new Error('Missing photo') }) });
  await assert.rejects(downloadCloud(api, user, { payload: remote }), /Missing photo/);
});
