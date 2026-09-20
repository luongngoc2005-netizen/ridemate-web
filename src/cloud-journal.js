import { readCloud, requireUser, validateWorkspace } from './cloud-data.js';
import { createJournalSync } from './journal-sync.js';

export function createCloudJournal(client, userId) {
  const downloaded = new Map();
  const uploaded = new Map();
  const storage = client.storage.from('journal-photos');
  async function hydrate(entry) {
    const photos = [];
    for (const photo of entry.photos) {
      let src = downloaded.get(photo.path);
      if (!src) {
        const { data, error } = await storage.download(photo.path);
        if (error) throw error;
        src = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
          reader.readAsDataURL(data);
        });
        downloaded.set(photo.path, src);
      }
      photos.push({ ...photo, src });
    }
    return { ...entry, photos };
  }
  async function upload(entry) {
    validateWorkspace({ version: 1, trip: null, entries: [entry] });
    await requireUser(client, userId);
    const photos = [];
    for (const photo of entry.photos) {
      let path = downloaded.get(photo.path) === photo.src ? photo.path : uploaded.get(photo.src);
      if (!path) {
        const [header, body] = photo.src.split(',');
        const type = header.slice(5, header.indexOf(';'));
        const bytes = Uint8Array.from(atob(body), char => char.charCodeAt(0));
        if (bytes.length > 10 * 1024 * 1024) throw new Error('Mỗi ảnh tối đa 10 MB.');
        path = `${userId}/${crypto.randomUUID()}.${type.split('/')[1]}`;
        const { error } = await storage.upload(path, new Blob([bytes], { type }), { contentType: type, upsert: false });
        if (error) throw error;
        uploaded.set(photo.src, path);
        downloaded.set(path, photo.src);
      }
      photos.push({ id: photo.id, name: photo.name, path });
    }
    return { ...entry, photos };
  }
  return createJournalSync({
    read: () => readCloud(client, userId), hydrate, upload,
    commit: async (payload, revision) => {
      await requireUser(client, userId);
      const { error } = await client.rpc('save_workspace', { expected_user_id: userId, expected_revision: revision, new_payload: payload });
      if (error) throw error;
    },
  });
}
