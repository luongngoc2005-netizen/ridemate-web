import ToolIcon from './ToolIcon.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { completionDraft, annualStats, placeNames, validEntry, journalStore, preparePhoto } from './journal-data.js';
import './journal.css';
import JournalRoute from './JournalRoute.jsx';
import ProvinceSelect from './ProvinceSelect.jsx';
import { supabase } from './supabase.js';
import { createCloudJournal } from './cloud-journal.js';

const today = () => new Date().toLocaleDateString('en-CA');
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('vi-VN');
const number = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
function EntryForm({ entry, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({ ...entry, placesText: entry.places.join('\n') }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const update = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const upload = async event => {
    const files = [...event.target.files]; event.target.value = '';
    if (draft.photos.length + files.length > 8) { setError('Mỗi hành trình tối đa 8 ảnh. Hãy bỏ bớt ảnh trước khi thêm.'); return; }
    setBusy(true); setError('');
    try { const photos = []; for (const file of files) photos.push(await preparePhoto(file)); setDraft(d => ({ ...d, photos: [...d.photos, ...photos] })); }
    catch (e) { setError(e.message || 'Không đọc được ảnh. Hãy chọn ảnh khác.'); }
    finally { setBusy(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (!!draft.origin?.trim() !== !!draft.destination?.trim()) { setError('Hãy nhập cả điểm xuất phát và điểm kết thúc để hiển thị bản đồ, hoặc để trống cả hai.'); return; }
    if (!validEntry(draft) || draft.date > today()) { setError('Nhập tên hành trình, ngày đã hoàn thành và số km hợp lệ.'); return; }
    setBusy(true); setError('');
    try { const { placesText, ...value } = draft; await onSave({ ...value, title: value.title.trim(), km: Number(value.km), places: placeNames(placesText) }); }
    catch (e) { setError(`${e.message || 'Chưa lưu được nhật ký.'} Nội dung vẫn ở đây để bạn thử lại.`); setBusy(false); }
  };
  return <form className="card journal-editor" onSubmit={submit}><h2>{entry.isNew ? (entry.sourceTripId ? 'Hoàn thành chuyến đi' : 'Thêm hành trình đã đi') : 'Chỉnh sửa nhật ký'}</h2><p>{entry.sourceTripId ? "Xác nhận ngày kết thúc, nhập số km thực tế và các điểm bạn thực sự đã đến. Lưu nhật ký để hoàn thành chuyến đi và cập nhật thành tựu." : "Mỗi bài viết tương ứng một chuyến đi đã hoàn thành."}</p><fieldset disabled={busy}><div className="journal-fields"><label>Tên hành trình<input required maxLength={150} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Ví dụ: Hà Giang — mùa hoa tam giác mạch" /></label><label>Ngày kết thúc chuyến đi<input required type="date" max={today()} value={draft.date} onChange={e => update('date', e.target.value)} /></label><label>Quãng đường thực tế (km)<input required type="number" min="0" step="0.1" value={draft.km} onChange={e => update('km', e.target.value)} placeholder="Nhập tổng km đã đi" /></label></div><div className="journal-fields"><label>Điểm xuất phát<ProvinceSelect value={draft.origin || ''} onChange={e => update('origin', e.target.value)} /></label><label>Điểm kết thúc<ProvinceSelect value={draft.destination || ''} onChange={e => update('destination', e.target.value)} /></label></div><p className="muted-copy">Nhập cả hai địa điểm để có bản đồ tuyến xe máy tham khảo. Tuyến chưa bao gồm điểm ghé và không phải bản ghi GPS; số km thực tế vẫn do bạn nhập.</p><label>Các điểm đã đến — mỗi dòng một điểm<textarea rows={4} value={draft.placesText} onChange={e => update('placesText', e.target.value)} placeholder={'Cột cờ Lũng Cú, Hà Giang\nĐèo Mã Pí Lèng, Hà Giang'} /></label><label>Kỷ niệm đáng nhớ<textarea rows={3} value={draft.memory} onChange={e => update('memory', e.target.value)} placeholder="Khoảnh khắc bạn muốn giữ lại..." /></label><label>Nhật ký của bạn<textarea rows={7} value={draft.story} onChange={e => update('story', e.target.value)} placeholder="Kể lại hành trình theo cách của bạn..." /></label><label className="journal-upload"><ToolIcon name="plus" className="inline-icon"/> Thêm ảnh của bạn<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} /></label><p className="muted-copy">Tối đa 8 ảnh JPG, PNG hoặc WebP, mỗi ảnh tối đa 10 MB. Ảnh được thu nhỏ để tiết kiệm bộ nhớ; ảnh đầu tiên là ảnh bìa.</p><div className="journal-photo-edit">{draft.photos.map((photo, index) => <div key={photo.id}><img src={photo.src} alt={`Ảnh ${index + 1}: ${photo.name}`} /><button type="button" onClick={() => update('photos', draft.photos.filter(p => p.id !== photo.id))} aria-label={`Bỏ ảnh ${index + 1}`}>Bỏ ảnh</button>{index > 0 && <button type="button" onClick={() => update('photos', [photo, ...draft.photos.filter(p => p.id !== photo.id)])}>Đặt làm ảnh bìa</button>}</div>)}</div><div className="edit-actions"><button type="submit" className="green">Lưu nhật ký</button><button type="button" className="soft" onClick={onCancel}>Hủy</button></div></fieldset>{busy && <p role="status">Đang xử lý và lưu dữ liệu…</p>}{error && <p role="alert" className="storage-warning">{error}</p>}</form>;
}

export default function Journal({ userId, completionTrip = null, onEntryChange = () => {} }) {
  const repository = useMemo(() => userId ? createCloudJournal(supabase, userId) : {
    getAll: () => journalStore('getAll'),
    put: async entry => { await journalStore('put', entry); return entry; },
    delete: entry => journalStore('delete', entry.id),
  }, [userId]);
  const alive = useRef(true);
  const [working, setWorking] = useState(false), [ready, setReady] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [entries, setEntries] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear())), [selected, setSelected] = useState(null), [draft, setDraft] = useState(null), [lightbox, setLightbox] = useState(null);
  useEffect(() => { let active = true; repository.getAll().then(items => { if (active) { setEntries(items); setReady(true); if (completionTrip) { const existing = items.find(item => item.sourceTripId === completionTrip.id); if (existing) { setSelected(existing.id); setYear(existing.date.slice(0,4)); onEntryChange(existing); } else setDraft(completionDraft(completionTrip, today())); } } }).catch(e => { if (active) setError(e.message || 'Không tải được nhật ký. Hãy kiểm tra kết nối rồi thử lại.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!lightbox) return; const close = event => { if (event.key === 'Escape') setLightbox(null); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [lightbox]);
  useEffect(() => {
    if (!draft && !working) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, working]);
  useEffect(() => {
    if (!userId || draft || working || loading || !ready) return;
    let active = true, fetching = false;
    const poll = async () => {
      if (document.hidden || fetching) return;
      fetching = true;
      try { const items = await repository.getAll(); if (active) { setEntries(items); setError(''); } }
      catch (e) { if (active) setError(e.message || 'Chưa cập nhật được nhật ký từ tài khoản.'); }
      finally { fetching = false; }
    };
    const timer = setInterval(poll, 30000);
    window.addEventListener('focus', poll);
    window.addEventListener('online', poll);
    document.addEventListener('visibilitychange', poll);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', poll); window.removeEventListener('online', poll); document.removeEventListener('visibilitychange', poll); };
  }, [repository, userId, draft, working, loading, ready]);
  const refresh = async () => {
    setLoading(true);
    try { const items = await repository.getAll(); if (alive.current) { setEntries(items); setReady(true); setError(''); } }
    catch (e) { if (alive.current) setError(e.message || 'Không tải được nhật ký.'); }
    finally { if (alive.current) setLoading(false); }
  };
  const importLocal = async () => {
    if (!window.confirm('Nhập nhật ký trên trình duyệt này vào tài khoản đang đăng nhập? Các bài trùng ID sẽ được bỏ qua; dữ liệu local vẫn được giữ nguyên.')) return;
    setWorking(true); setError('');
    let count = 0;
    try {
      const existing = new Set((await repository.getAll()).map(item => item.id));
      const local = await journalStore('getAll');
      for (const entry of local) {
        if (!alive.current) return;
        if (existing.has(entry.id)) continue;
        const { _cloudBase, ...value } = entry;
        await repository.put(value); count++;
      }
      const items = await repository.getAll();
      if (alive.current) { setEntries(items); setNotice(`Đã nhập ${count} bài. Các bài trùng ID được giữ theo bản trên tài khoản.`); }
    } catch (e) { if (alive.current) setError(`Đã nhập ${count} bài. ${e.message || 'Nhập chưa hoàn tất.'} Bạn có thể thử lại; các bài đã nhập sẽ được bỏ qua.`); }
    finally { if (alive.current) setWorking(false); }
  };
  const scroll = () => window.scrollTo({ top: 0, behavior: 'instant' });
  const create = () => { setDraft({ id: crypto.randomUUID(), isNew: true, title: '', date: today(), km: '', places: [], memory: '', story: '', photos: [] }); scroll(); };
  const save = async value => {
    const { isNew, ...entry } = value;
    setWorking(true);
    try {
      const saved = await repository.put(entry);
      if (!alive.current) return;
      onEntryChange(saved); setEntries(items => [...items.filter(i => i.id !== saved.id), saved]);
      setYear(saved.date.slice(0, 4)); setSelected(saved.id); setDraft(null); setError('');
      setNotice(userId ? 'Đã lưu nhật ký lên tài khoản.' : 'Đã lưu nhật ký trên trình duyệt.'); scroll();
    } finally { if (alive.current) setWorking(false); }
  };
  const remove = async entry => {
    if (!window.confirm(`Xóa nhật ký “${entry.title}”${userId ? ' khỏi tài khoản trên mọi thiết bị' : ''}?`)) return;
    setWorking(true);
    try { await repository.delete(entry); if (!alive.current) return; onEntryChange(entry, true); setEntries(items => items.filter(i => i.id !== entry.id)); setSelected(null); setError(''); scroll(); }
    catch (e) { if (alive.current) setError(e.message || 'Không xóa được nhật ký.'); }
    finally { if (alive.current) setWorking(false); }
  };
  const entry = entries.find(e => e.id === selected);
  const stats = annualStats(entries, year);
  const years = [...new Set([String(new Date().getFullYear()), year, ...entries.map(e => e.date.slice(0, 4))])].sort().reverse();
  const filtered = entries.filter(e => e.date.slice(0, 4) === year).sort((a, b) => b.date.localeCompare(a.date));
  return <main className="page journal-page"><div className="title"><div><h1>Nhật ký hành trình</h1><p>Những cung đường đã đi. Những kỷ niệm ở lại.</p></div>{!draft && <button className="green" onClick={create} disabled={loading || working || !ready}><ToolIcon name="plus" className="inline-icon"/> Tạo bài mới</button>}</div><p className="muted-copy">{userId ? 'Nhật ký và ảnh được lưu vào tài khoản khi bạn bấm Lưu. Các thiết bị khác tự cập nhật khi mở nhật ký hoặc trong vòng 30 giây khi đang xem.' : 'Nhật ký đang lưu trên trình duyệt này. Đăng nhập để lưu và xem trên các thiết bị khác.'}</p>{notice && <p role="status" className="save-feedback">{notice}</p>}{!draft && <div className="account-actions"><button className="soft" disabled={loading || working} onClick={refresh}>Tải lại nhật ký</button>{userId && <button className="soft" disabled={loading || working || !ready} onClick={importLocal}>Nhập nhật ký cũ từ trình duyệt</button>}</div>}{error && <p role="alert" className="storage-warning">{error}</p>}{loading ? <p role="status">Đang mở nhật ký…</p> : draft ? <EntryForm key={draft.id} entry={draft} onSave={save} onCancel={() => { if (window.confirm('Bỏ các thay đổi chưa lưu?')) setDraft(null); }} /> : entry ? <><button className="soft" onClick={() => { setSelected(null); scroll(); }}><ToolIcon name="arrowLeft" className="inline-icon"/> Tất cả hành trình năm {year}</button><article className="card journal-detail"><div className="title"><div><small>{dateLabel(entry.date)}</small><h2>{entry.title}</h2></div><div className="edit-actions"><button className="soft" disabled={working} onClick={() => { setDraft(entry); scroll(); }}>Chỉnh sửa nhật ký</button><button className="soft" disabled={working} onClick={() => remove(entry)}>Xóa bài viết</button></div></div><div className="journal-detail-stats"><b><ToolIcon name="route" className="inline-icon"/> {number(entry.km)} km đã đi</b><b><ToolIcon name="pin" className="inline-icon"/> {entry.places.length} điểm đã đến</b><b><ToolIcon name="image" className="inline-icon"/> {entry.photos.length} ảnh kỷ niệm</b></div><JournalRoute entry={entry} onEdit={() => { setDraft(entry); scroll(); }} /><h3>Album hành trình</h3>{entry.photos.length ? <div className="journal-album">{entry.photos.map((photo, index) => <button key={photo.id} onClick={() => setLightbox(photo)} aria-label={`Xem ảnh ${index + 1}`}><img src={photo.src} alt={`${entry.title} — ảnh ${index + 1}`} /></button>)}</div> : <p>Chưa có ảnh. Chọn “Chỉnh sửa nhật ký” để thêm ảnh của bạn.</p>}<h3>Kỷ niệm đáng nhớ</h3><p className="journal-prose">{entry.memory || 'Bạn chưa ghi lại kỷ niệm.'}</p><h3>Các điểm đã đến</h3>{entry.places.length ? <ul className="journal-places">{entry.places.map(place => <li key={place}>{place}</li>)}</ul> : <p>Chưa ghi nhận điểm đến.</p>}<h3>Nhật ký của tôi</h3><p className="journal-prose">{entry.story || 'Câu chuyện đang chờ bạn viết tiếp…'}</p></article></> : <><section className="journal-achievements"><div className="title"><div><small>MỖI CHUYẾN ĐI, MỘT DẤU ẤN</small><h2>Thành tựu năm {year}</h2></div><label>Năm<select aria-label="Năm thống kê" value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></label></div><div className="journal-totals">{[['route', number(stats.km), 'km đã đi'], ['pin', stats.places, 'điểm đã đến'], ['flag', stats.trips, 'chuyến đi']].map(([icon, value, label]) => <div key={label}><span><ToolIcon name={icon}/></span><b>{value}</b><small>{label}</small></div>)}</div><p>Tính theo năm kết thúc chuyến đi và số km bạn ghi nhận. Điểm trùng tên trong cùng năm chỉ tính một lần; hãy thêm tỉnh/thành để phân biệt.</p></section><div className="title"><h2>Album hành trình · {year}</h2><span>{stats.trips} chuyến đi</span></div>{!filtered.length && <div className="card journal-empty"><h3>Năm {year} chưa có hành trình nào</h3><p>Thêm chuyến đi đã hoàn thành để bắt đầu album và thành tựu của bạn.</p></div>}<div className="journal-cards">{filtered.map(item => <button className="journal-card" key={item.id} onClick={() => { setSelected(item.id); scroll(); }}>{item.photos[0] ? <img src={item.photos[0].src} alt={item.title} /> : <div className="journal-cover"><ToolIcon name="mountain" className="inline-icon"/><small>Chuyến đi của bạn</small></div>}<div><small>{dateLabel(item.date)} · {item.photos.length} ảnh</small><h3>{item.title}</h3><p>{number(item.km)} km · {item.places.length} điểm đã đến</p><p className="journal-excerpt">{item.memory || item.story || 'Mở để xem và viết tiếp kỷ niệm…'}</p><b>Xem hành trình <ToolIcon name="arrowRight" className="inline-icon"/></b></div></button>)}<button className="journal-add" disabled={working || !ready} onClick={create}><span><ToolIcon name="plus" className="inline-icon"/></span>Thêm bài viết</button></div></>}{lightbox && <dialog className="journal-lightbox" ref={node => { if (node && !node.open) node.showModal(); }} onClose={() => setLightbox(null)} aria-label="Ảnh hành trình" onClick={() => setLightbox(null)}><button autoFocus onClick={() => setLightbox(null)}>Đóng ảnh <ToolIcon name="close" className="inline-icon"/></button><img src={lightbox.src} alt={lightbox.name} /></dialog>}</main>;
}
