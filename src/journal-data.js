export const placeNames = text => [...new Map(text.split('\n').map(s => s.trim()).filter(Boolean).map(s => [s.normalize('NFC').toLocaleLowerCase('vi'), s])).values()];
export function completionDraft(trip, date) {
  return { id: `completed-${trip.id}`, sourceTripId: trip.id, isNew: true, title: `${trip.origin} → ${trip.destination}`, origin: trip.origin, destination: trip.destination, date, km: '', places: [], memory: '', story: trip.notes || '', photos: [] };
}
export function annualStats(entries, year) {
  const trips = entries.filter(e => e.date.slice(0, 4) === String(year));
  return { trips: trips.length, km: trips.reduce((sum, e) => sum + Number(e.km), 0), places: placeNames(trips.flatMap(e => e.places).join('\n')).length };
}
export function validEntry(entry) {
  return !!entry.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && !Number.isNaN(Date.parse(entry.date)) && entry.km !== '' && Number.isFinite(Number(entry.km)) && Number(entry.km) >= 0;
}
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ridemate-journal', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('entries')) request.result.createObjectStore('entries', { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains('backups')) request.result.createObjectStore('backups');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Hãy đóng các tab RideMate khác rồi thử lại.'));
  });
}
// Keep the complete previous workspace in the same IndexedDB transaction.
export async function replaceJournalEntries(entries, previousTrip) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['entries', 'backups'], 'readwrite');
      const store = tx.objectStore('entries');
      const old = store.getAll();
      old.onsuccess = () => {
        tx.objectStore('backups').put({ version: 1, trip: previousTrip, entries: old.result }, 'before-cloud-load');
        store.clear();
        entries.forEach(entry => store.put(entry));
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Không thay được nhật ký.'));
    });
  } finally { db.close(); }
}
export async function readWorkspaceBackup() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('backups', 'readonly');
      const request = tx.objectStore('backups').get('before-cloud-load');
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Không đọc được bản dự phòng.'));
    });
  } finally { db.close(); }
}
export async function journalStore(action, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('entries', action === 'getAll' ? 'readonly' : 'readwrite');
      const request = tx.objectStore('entries')[action](...(value === undefined ? [] : [value]));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Không lưu được dữ liệu.'));
    });
  } finally { db.close(); }
}
export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chọn ảnh JPG, PNG hoặc WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Mỗi ảnh tối đa 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    await img.decode();
    const ratio = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { id: crypto.randomUUID(), name: file.name, src: canvas.toDataURL('image/jpeg', 0.82) };
  } finally { URL.revokeObjectURL(url); }
}
