import TripDateInput from './TripDateInput.jsx';
import { useNavigationState } from './useNavigationState.js';
import OriginSelect from './OriginSelect.jsx';
import {StayNightPlan} from './stays/Stays.jsx';
import ToolIcon from './ToolIcon.jsx';
import ProvinceSelect from './ProvinceSelect.jsx';
import React, { useRef, useState } from 'react';
import { dateRange, suggestionsFor, newId } from './trip-data.js';
import RouteOverview from './RouteOverview.jsx';
import RidingView from './RidingView.jsx';
import { useLocation } from './Location.jsx';
import TripLocations from './TripLocations.jsx';
import {mergeValue} from './plan-sync.js';
import { renamePlannedPlace, mergeEditedDay } from './planned-places.js';
import { validPoint, placeDirectionsUrl } from './route-data.js';

export const openMap = query => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
export function TripForm({ trip, editing, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({ ...trip, interests: [...(trip.interests || [])] }));
  const set = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const submit = event => {
    event.preventDefault();
    if (editing && Number(draft.days) < trip.days && !window.confirm(`Giảm còn ${draft.days} ngày sẽ bỏ các ngày sau đó cùng điểm tham quan và ghi chú trong những ngày ấy. Bạn có muốn tiếp tục?`)) return;
    onSave(draft);
  };
  return <main className="page"><h1>{editing ? 'Chỉnh sửa chuyến đi' : 'Tạo chuyến đi'}</h1><p>{editing ? 'Các ngày đã lên kế hoạch được giữ lại. Bạn có thể chỉnh từng ngày trong phần Lịch trình.' : 'Chỉ vài bước để bắt đầu hành trình của bạn.'}</p><form onSubmit={submit} className="create trip-form"><section className="card"><h3>Thông tin cơ bản</h3><OriginSelect value={draft} onChange={setDraft}/><label>Điểm đến<ProvinceSelect required value={draft.destination} onChange={e=>set("destination",e.target.value)}/></label><label>Ngày đi<TripDateInput value={draft.date} onChange={date => set('date', date)} /></label><label>Số ngày<input required type="number" min="1" max="30" step="1" value={draft.days} onChange={e => set('days', e.target.value)} /></label></section><section className="card"><h3>Sở thích chuyến đi</h3><div className="interest">{['Thiên nhiên', 'Văn hóa', 'Ẩm thực', 'Khám phá', 'Nghỉ dưỡng', 'Chụp ảnh'].map(name => <button type="button" key={name} aria-pressed={draft.interests.includes(name)} onClick={() => set('interests', draft.interests.includes(name) ? draft.interests.filter(x => x !== name) : [...draft.interests, name])}>{name}</button>)}</div><label>Ghi chú chuyến đi<textarea value={draft.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Ví dụ: ưu tiên cung đẹp, tránh đi đêm..." /></label><div className="edit-actions"><button className="green" type="submit">{editing ? 'Lưu thay đổi' : <>Tạo chuyến đi <ToolIcon name="arrowRight" className="inline-icon"/></>}</button><button className="soft" type="button" onClick={onCancel}>Hủy</button></div></section></form></main>;
}

function DayEditor({ day, index, onSave, onCancel }) {
  const baseline = useRef(day);
  const [draft, setDraft] = useState(() => ({ ...day, places: day.places.map(p => ({ ...p })) }));
  const reorder = (position, offset) => setDraft(current => { const places = [...current.places]; [places[position], places[position + offset]] = [places[position + offset], places[position]]; return { ...current, places }; });
  return <form className="day-editor card" onSubmit={event => { event.preventDefault(); onSave({ ...draft, title: draft.title.trim(), places: draft.places.map(place => ({ ...place, name: place.name.trim() })).filter(place => place.name) }, baseline.current); }}><h3>Chỉnh sửa ngày {index + 1}</h3><label>Tiêu đề ngày {index + 1}<input required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><h4>Điểm tham quan theo thứ tự</h4>{draft.places.map((place, position) => <div className="place-edit" key={place.id}><label>Điểm {position + 1}<input required aria-label={`Tên điểm ${position + 1}`} value={place.name} onChange={e => setDraft({ ...draft, places: draft.places.map(p => p.id === place.id ? renamePlannedPlace(p, e.target.value) : p) })} /></label><div className="place-controls"><button type="button" disabled={position === 0} aria-label={`Đưa điểm ${position + 1} lên`} onClick={() => reorder(position, -1)}><ToolIcon name="arrowUp" className="inline-icon"/></button><button type="button" disabled={position === draft.places.length - 1} aria-label={`Đưa điểm ${position + 1} xuống`} onClick={() => reorder(position, 1)}><ToolIcon name="arrowDown" className="inline-icon"/></button><button type="button" onClick={() => setDraft({ ...draft, places: draft.places.filter(p => p.id !== place.id) })}>Xóa điểm</button></div></div>)}<button className="soft" type="button" onClick={() => setDraft({ ...draft, places: [...draft.places, { id: newId(), name: '' }] })}><ToolIcon name="plus" className="inline-icon"/> Thêm điểm tham quan</button><div className="day-support-editor"><label>Điểm ăn uống ngày {index + 1}<textarea aria-label={`Điểm ăn uống ngày ${index + 1}`} value={draft.mealStops || ''} onChange={e => setDraft({ ...draft, mealStops: e.target.value })} placeholder={'Ví dụ: Ăn trưa — Quán cơm A, địa chỉ…\nĂn tối — Quán B…'} /></label><label>Điểm nghỉ ngơi ngày {index + 1}<textarea aria-label={`Điểm nghỉ ngơi ngày ${index + 1}`} value={draft.restStops || ''} onChange={e => setDraft({ ...draft, restStops: e.target.value })} placeholder={'Ví dụ: Nghỉ dọc đường — Trạm dừng C…\nNghỉ đêm — Homestay D, địa chỉ…'} /></label></div><p className="muted-copy">Bạn tự điền tên, địa chỉ hoặc giờ dự kiến; mỗi địa điểm một dòng.</p><label>Ghi chú ngày {index + 1}<textarea aria-label={`Ghi chú ngày ${index + 1}`} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Giờ đi, nơi ăn nghỉ, chi phí dự kiến..." /></label><div className="edit-actions"><button className="green" type="submit">Lưu ngày {index + 1}</button><button className="soft" type="button" onClick={onCancel}>Hủy chỉnh sửa</button></div></form>;
}

function Itinerary({ trip, setTrip }) {
  const [editing, setEditing] = useState(null);
  const [selectedDay, setSelectedDay] = useState(trip.itinerary[0].id);
  const [message, setMessage] = useState('');
  const suggestions = suggestionsFor(trip.destination);
  const targetDay = trip.itinerary.find(day => day.id === selectedDay) || trip.itinerary[0];
  const updateDay = (updated, baseline) => { const saved=setTrip(current => ({ ...current, itinerary: current.itinerary.map(day => day.id === updated.id ? mergeValue(baseline,updated,day,`ngày/${day.id}`) : day) })); if(saved===false)return;setEditing(null); setMessage('Đã cập nhật lịch trình.'); };
  const addPlace = name => {
    setTrip(current => ({ ...current, itinerary: current.itinerary.map(day => day.id === targetDay.id && !day.places.some(place => place.name === name) ? { ...day, places: [...day.places, { id: newId(), name }] } : day) }));
    setMessage(`Đã thêm ${name} vào ngày ${trip.itinerary.indexOf(targetDay) + 1}.`);
  };
  return <section className="box itinerary"><h2>Lịch trình gợi ý</h2><p className="muted-copy">Khung tham khảo theo điểm đến, chưa tính thời gian di chuyển. Hãy chọn điểm phù hợp và điều chỉnh theo nhịp đi của bạn.</p><p className="save-feedback" role="status">{message}</p>{trip.itinerary.map((day, index) => editing === day.id ? <DayEditor key={day.id} day={day} index={index} onSave={updateDay} onCancel={() => setEditing(null)} /> : <article className="itinerary-day" key={day.id}><div className="title"><div><span className="day-badge">Ngày {index + 1}</span><h3>{day.title}</h3></div><button className="soft" disabled={editing !== null} onClick={() => setEditing(day.id)}>Chỉnh sửa ngày {index + 1}</button></div>{day.places.length > 0 ? <ol className="places-list">{day.places.map(place => <li key={place.id}><span>{place.name}</span><button onClick={() => validPoint(place.coordinates) ? window.open(placeDirectionsUrl(place), '_blank', 'noopener,noreferrer') : openMap(`${place.name}, ${trip.destination}`)} aria-label={`Xem ${place.name} trên bản đồ`}>Maps <ToolIcon name="external" className="inline-icon"/></button></li>)}</ol> : <p className="muted-copy">Chưa có điểm tham quan. Chỉnh sửa ngày hoặc thêm từ gợi ý bên dưới.</p>}<div className="day-support-summary">{[['mealStops', 'Điểm ăn uống', 'food'], ['restStops', 'Điểm nghỉ ngơi', 'bed']].map(([key, label, icon]) => <section key={key}><h4><ToolIcon name={icon} className="inline-icon"/> {label}</h4>{day[key]?.trim() ? <p>{day[key]}</p> : <button className="soft" disabled={editing !== null} onClick={() => setEditing(day.id)}>+ Thêm {label.toLowerCase()}</button>}</section>)}</div>{day.note && <p className="day-note"><b>Ghi chú: </b>{day.note}</p>}</article>)}<section className="attraction-suggestions"><h3>Điểm tham quan gợi ý tại {trip.destination}</h3>{suggestions ? <><p className="muted-copy">Chọn thêm điểm vào ngày phù hợp; bạn vẫn có thể tự nhập địa điểm khác.</p><label>Thêm gợi ý vào ngày<select aria-label="Thêm gợi ý vào ngày" disabled={editing !== null} value={targetDay.id} onChange={e => setSelectedDay(e.target.value)}>{trip.itinerary.map((day, index) => <option key={day.id} value={day.id}>Ngày {index + 1}: {day.title}</option>)}</select></label><div className="suggestion-list">{suggestions.places.map(name => { const added = targetDay.places.some(place => place.name === name); return <div key={name}><span>{name}</span><button className="soft" disabled={added || editing !== null} onClick={() => addPlace(name)}>{added ? 'Đã thêm' : <><ToolIcon name="plus" className="inline-icon"/> Thêm vào ngày</>}</button></div>; })}</div><a href={suggestions.source} target="_blank" rel="noreferrer">Nguồn tham khảo điểm đến <ToolIcon name="external" className="inline-icon"/></a></> : <><p className="muted-copy">Chưa có danh sách gợi ý cho điểm đến này. Bạn có thể tự thêm điểm bằng nút “Chỉnh sửa ngày”.</p><button className="soft" onClick={() => openMap(`điểm tham quan tại ${trip.destination}`)}>Tìm điểm tham quan trên Maps <ToolIcon name="external" className="inline-icon"/></button></>}</section></section>;
}

function ChecklistProgress({ done, total }) {
  const percent = total ? Math.round(done / total * 100) : 0;
  const color = percent >= 70 ? '#0f6745' : percent >= 50 ? '#eab308' : '#dc2626';
  return <>
    <div className="bar" role="progressbar" aria-label="Checklist hoàn thành" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100">
      <i style={{ width: `${percent}%`, backgroundColor: color }} />
    </div>
    <p>{done}/{total} mục checklist đã hoàn thành · <strong>{percent}%</strong></p>
  </>;
}

export function Journey({ trip, setTrip, view, setView, onEdit, onFinish, setPage, journal }) {
  const location = useLocation();
  const [mapOpen, setMapOpen] = useState(false);
  const [riding, setRiding] = useNavigationState(`riding.${trip.id}`, () => { try { return sessionStorage.getItem(`ridemate.riding.${trip.id}`) === 'yes' && !trip.completedAt; } catch { return false; } });
  const isRiding = riding && !trip.completedAt;
  const isJournal = view === 'journal';
  const changePhase = value => { if (value && trip.completedAt) return; setRiding(value); setView('overview'); try { sessionStorage.setItem(`ridemate.riding.${trip.id}`, value ? 'yes' : 'no'); } catch {} };
  const completed = trip.checklist.filter(item => item.done).length;
  const places = trip.itinerary.reduce((total, day) => total + day.places.length, 0);
  return <main className={`page journey-page ${isRiding ? 'is-riding' : ''}`}>
    <div className="title trip-heading"><div><p className="phase-eyebrow">CHUYẾN ĐI CỦA BẠN</p><h1>{trip.origin} → {trip.destination}</h1><p>{dateRange(trip)} · {trip.days} ngày</p></div><button className="soft" onClick={onEdit}>Chỉnh sửa</button></div>
    <nav className="journey-phases" aria-label="Giai đoạn chuyến đi">
      <button aria-current={!isJournal && !isRiding ? 'page' : undefined} onClick={() => changePhase(false)}>1. Chuẩn bị</button>
      <button disabled={!!trip.completedAt} aria-current={!isJournal && isRiding ? 'page' : undefined} onClick={() => changePhase(true)}>2. Đang đi</button>
      <button aria-current={isJournal ? 'page' : undefined} onClick={() => setView('journal')}>3. Nhật ký</button>
    </nav>
    {isJournal ? journal : isRiding ? <RidingView trip={trip}/> : <>
      <nav className="subnav" aria-label="Các phần hành trình">{[['overview', 'Tổng quan'], ['itinerary', 'Lịch trình'], ['checklist', 'Checklist'], ['notes', 'Ghi chú']].map(([key, label]) => <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)}>{label}</button>)}</nav>
      {view === 'checklist' ? <TripChecklist trip={trip} setTrip={setTrip} embedded/> : view === 'notes' ? <section className="card trip-notes"><h2>Ghi chú chuyến đi</h2><p className="muted-copy">Thay đổi được lưu tự động trên trình duyệt này.</p><label>Ghi chú chung<textarea aria-label="Ghi chú chung" value={trip.notes} onChange={e => setTrip(current => ({ ...current, notes: e.target.value }))} placeholder="Địa chỉ chỗ nghỉ, ngân sách, điều cần nhớ..." /></label>{trip.itinerary.map((day, index) => <label key={day.id}>Ghi chú ngày {index + 1} — {day.title}<textarea aria-label={`Ghi chú ngày ${index + 1}`} value={day.note} onChange={e => setTrip(current => ({ ...current, itinerary: current.itinerary.map(item => item.id === day.id ? { ...item, note: e.target.value } : item) }))} placeholder="Ghi chú riêng cho ngày này..." /></label>)}</section> : view === 'itinerary' ? <>{!trip.completedAt && <details className="journey-disclosure"><summary>Chọn vị trí các điểm dừng</summary><TripLocations trip={trip} setTrip={setTrip}/></details>}<Itinerary trip={trip} setTrip={setTrip}/></> : <>
        <section className="card preparation-card"><h2>Sẵn sàng cho chuyến đi</h2><p>{trip.days} ngày · {places} điểm trong lịch trình</p><ChecklistProgress done={completed} total={trip.checklist.length}/><div className="preparation-actions"><button className="soft" onClick={() => setView('checklist')}>Mở checklist</button><button className="soft" onClick={() => setView('itinerary')}>Xem lịch trình</button></div>{!trip.completedAt && <button className="green start-journey" onClick={() => { changePhase(true); if (!location.tracking) location.start(); }}>Bắt đầu chuyến đi →</button>}</section>
        <>{trip.completedAt ? <p className="route-message">Chuyến đi đã hoàn thành. Bản đồ và thông tin tuyến không tự tải để giảm gọi dịch vụ.</p> : <details className="journey-disclosure" open={mapOpen} onToggle={event => setMapOpen(event.currentTarget.open)}><summary>Bản đồ, thời tiết và thông tin tuyến</summary>{mapOpen && <RouteOverview trip={trip}/>}</details>}</>
        <details className="journey-disclosure"><summary>Chỗ nghỉ theo từng đêm</summary><StayNightPlan trip={trip} onFind={date=>setPage('stays',date)}/></details>
        <details className="journey-disclosure"><summary>Ghi chú chuyến đi</summary><p>{trip.notes || 'Chưa có ghi chú.'}</p><button className="soft" onClick={() => setView('notes')}>Viết ghi chú</button></details>
      </>}
    </>}
    {!isJournal && (riding || view === 'overview') && <div className="trip-completion">{trip.completedAt ? <><b><ToolIcon name="check" className="inline-icon"/> Đã hoàn thành chuyến đi</b><p>Ngày hoàn thành: {new Date(`${trip.completedAt}T12:00:00`).toLocaleDateString("vi-VN")}</p><button className="green" onClick={() => { location.stop(); onFinish(); }}>Xem nhật ký chuyến đi</button></> : <><p>Đã kết thúc hành trình? Ghi lại số km thực tế và những nơi bạn đã đến.</p><button className="green" onClick={() => { location.stop(); onFinish(); }}><ToolIcon name="check" className="inline-icon"/> Hoàn thành chuyến đi</button><small>Chuyến đi được đánh dấu hoàn thành sau khi bạn lưu nhật ký.</small></>}</div>}
  </main>;
}

export function TripChecklist({ trip, setTrip, embedded = false, onBack }) {
  const Container = embedded ? 'section' : 'main';
  const [name, setName] = useState('');
  const done = trip.checklist.filter(item => item.done).length;
  return <Container className={embedded ? "trip-checklist" : "page narrow"}>{onBack && <button className="soft" onClick={onBack}><ToolIcon name="arrowLeft" className="inline-icon"/> Quay lại chuyến đi của bạn</button>}<div className="title"><div>{embedded ? <h2>Checklist</h2> : <h1>Checklist</h1>}<p>Chuẩn bị tốt hơn trước khi lên đường.</p></div><b>{done}/{trip.checklist.length}</b></div><ChecklistProgress done={done} total={trip.checklist.length} /><section className="card checks">{trip.checklist.map(item => <label key={item.id}><input type="checkbox" checked={item.done} onChange={() => setTrip(current => ({ ...current, checklist: current.checklist.map(value => value.id === item.id ? { ...value, done: !value.done } : value) }))} /><span>{item.name}</span></label>)}<form className="add-checklist" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; setTrip(current => ({ ...current, checklist: [...current.checklist, { id: newId(), name: name.trim(), done: false }] })); setName(''); }}><label>Mục cần thêm<input required value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: nước uống" /></label><button className="soft" type="submit"><ToolIcon name="plus" className="inline-icon"/> Thêm mục</button></form></section></Container>;
}
