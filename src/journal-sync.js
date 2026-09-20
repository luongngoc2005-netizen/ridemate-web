// Merge only the edited journal into the latest workspace. Other journals and
// the saved trip must survive writes from another browser.
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const fingerprint = entry => entry ? stable(entry) : null;

export function createJournalSync({ read, commit, upload, hydrate }) {
  async function getAll() {
    const row = await read();
    const entries = row?.payload.entries || [];
    return Promise.all(entries.map(async entry => ({ ...await hydrate(entry), _cloudBase: fingerprint(entry) })));
  }
  async function mutate(entry, remove = false) {
    const { _cloudBase = null, isNew, ...local } = entry;
    const prepared = remove ? null : await upload(local);
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await read();
      const payload = row?.payload || { version: 1, trip: null, entries: [] };
      const current = payload.entries.find(item => item.id === local.id);
      // Retry after an ambiguous successful response is safe and idempotent.
      if (remove && !current) return;
      if (!remove && fingerprint(current) === fingerprint(prepared)) return { ...local, _cloudBase: fingerprint(prepared) };
      if (fingerprint(current) !== _cloudBase) throw new Error('Bài này đã được sửa hoặc xóa trên thiết bị khác. Nội dung đang nhập vẫn được giữ; hãy sao chép nội dung trước khi tải lại nhật ký.');
      const entries = payload.entries.filter(item => item.id !== local.id);
      if (prepared) entries.push(prepared);
      try {
        await commit({ ...payload, entries }, row?.revision || 0);
        return remove ? undefined : { ...await hydrate(prepared), _cloudBase: fingerprint(prepared) };
      } catch (error) {
        if (error.code !== '40001') throw error;
      }
    }
    throw new Error('Dữ liệu đang được cập nhật trên thiết bị khác. Hãy thử lưu lại.');
  }
  return { getAll, put: entry => mutate(entry), delete: entry => mutate(entry, true) };
}
