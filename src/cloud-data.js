import { isStoredTrip } from './trip-data.js';

const BUCKET = 'journal-photos';
const text = value => typeof value === 'string';
const id = value => text(value) && value.length > 0 && value.length <= 200;
const photoData = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const unique = items => new Set(items.map(item => item.id)).size === items.length;

export function validateWorkspace(value, remote = false, userId = '') {
  if (!value || value.version !== 1 || !(value.trip === null || isStoredTrip(value.trip)) || !Array.isArray(value.entries)) throw new Error('Dữ liệu chuyến đi không hợp lệ.');
  for (const entry of value.entries) {
    if (!entry || !id(entry.id) || !text(entry.title) || !entry.title.trim() || !text(entry.date) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(Date.parse(entry.date)) || typeof entry.km !== 'number' || !Number.isFinite(entry.km) || entry.km < 0 || !text(entry.memory) || !text(entry.story) || !Array.isArray(entry.places) || !entry.places.every(text) || !Array.isArray(entry.photos) || entry.photos.length > 8 || (entry.sourceTripId != null && !id(entry.sourceTripId)) || (entry.origin != null && !text(entry.origin)) || (entry.destination != null && !text(entry.destination))) throw new Error('Dữ liệu nhật ký không hợp lệ.');
    for (const photo of entry.photos) {
      if (!photo || !id(photo.id) || !text(photo.name) || (remote
        ? !text(photo.path) || !photo.path.startsWith(`${userId}/`) || !/^[a-zA-Z0-9/-]+\.(jpeg|png|webp)$/.test(photo.path)
        : !text(photo.src) || photo.src.length > 14 * 1024 * 1024 || !photoData.test(photo.src))) throw new Error('Dữ liệu ảnh không hợp lệ.');
    }
    if (!unique(entry.photos)) throw new Error('Ảnh bị trùng ID.');
  }
  if (!unique(value.entries)) throw new Error('Nhật ký bị trùng ID.');
  return value;
}

export async function requireUser(client, expectedUserId) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.id !== expectedUserId) throw new Error('Phiên đăng nhập đã thay đổi. Hãy mở lại trang Tài khoản.');
}

export async function readCloud(client, userId) {
  await requireUser(client, userId);
  const { data, error } = await client.from('user_workspaces').select('revision,payload,updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) validateWorkspace(data.payload, true, userId);
  return data;
}

function photoBlob(src) {
  const [header, body] = src.split(',');
  const bytes = Uint8Array.from(atob(body), char => char.charCodeAt(0));
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Mỗi ảnh tối đa 10 MB.');
  return new Blob([bytes], { type: header.slice(5, header.indexOf(';')) });
}

export async function saveCloud(client, userId, workspace, revision) {
  validateWorkspace(workspace);
  await requireUser(client, userId);
  const payload = structuredClone(workspace);
  const storage = client.storage.from(BUCKET);
  for (const entry of payload.entries) {
    for (let i = 0; i < entry.photos.length; i++) {
      const photo = entry.photos[i];
      const blob = photoBlob(photo.src);
      const path = `${userId}/${crypto.randomUUID()}.${blob.type.split('/')[1]}`;
      const { error } = await storage.upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      entry.photos[i] = { id: photo.id, name: photo.name, path };
    }
  }
  await requireUser(client, userId);
  const { data, error } = await client.rpc('save_workspace', { expected_user_id: userId, expected_revision: revision, new_payload: payload });
  if (error?.code === '40001') throw new Error('Thiết bị khác đã lưu bản mới. Hãy kiểm tra lại bản trên tài khoản trước khi lưu tiếp.');
  if (error) throw error;
  return data;
}

export async function downloadCloud(client, userId, row) {
  validateWorkspace(row.payload, true, userId);
  await requireUser(client, userId);
  const workspace = structuredClone(row.payload);
  for (const entry of workspace.entries) {
    for (let i = 0; i < entry.photos.length; i++) {
      const photo = entry.photos[i];
      const { data, error } = await client.storage.from(BUCKET).download(photo.path);
      if (error) throw error;
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Không đọc được ảnh tải về.'));
        reader.readAsDataURL(data);
      });
      entry.photos[i] = { id: photo.id, name: photo.name, src };
    }
  }
  await requireUser(client, userId);
  return validateWorkspace(workspace);
}
