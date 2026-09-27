import React, { useEffect, useMemo, useRef, useState } from 'react';
import ToolIcon from './ToolIcon.jsx';
import RouteMap from './RouteMap.jsx';
import { LocationControls } from './Location.jsx';
import { useTripRoute } from './TripRouteContext.jsx';
import { markerTypes, placeDirectionsUrl, searchPlannedCandidates, validPoint } from './route-data.js';
import { plannedPlaces, addPlannedPlace, locatePlannedPlace, clearPlannedLocation } from './planned-places.js';
import './trip-companion.css';

function ResolvePlace({ place, route, onChoose, onCancel }) {
  const [query, setQuery] = useState(place.name), [state, setState] = useState({}), [term, setTerm] = useState(null);
  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    setState({ loading: true });
    searchPlannedCandidates(term.query, route, controller.signal).then(results => { if (!controller.signal.aborted) setState({ results }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [term, route]);
  return <section className="companion-action">
    <form onSubmit={e => { e.preventDefault(); setTerm({ query: query.trim() }); }}><label>Chọn vị trí cho {place.name}<input autoFocus required value={query} onChange={e => setQuery(e.target.value)} placeholder="Tên quán, đường, tỉnh/thành"/></label><button type="submit" disabled={!query.trim() || state.loading}>Tìm vị trí</button><button type="button" onClick={onCancel}>Hủy</button></form>
    <p>Tên có thể trùng nhau. Hãy kiểm tra địa chỉ trước khi chọn.</p>
    {state.loading && <p role="status">Đang tìm…</p>}{state.error && <p role="status">{state.error}</p>}
    {state.results?.length === 0 && <p role="status">Chưa tìm thấy. Thử thêm tên đường hoặc tỉnh/thành.</p>}
    {!route && <p>Vẫn có thể tìm và sửa vị trí khi tuyến chưa tải được. Thêm tên đường, tỉnh/thành để tìm chính xác hơn.</p>}
    {state.results?.map((candidate, index) => <button className="candidate-result" key={`${candidate.id}:${index}`} onClick={() => onChoose(candidate)}><b>{candidate.name}</b><span>{candidate.address || 'Chưa có địa chỉ'}</span><small>{Number.isFinite(candidate.distanceMeters) && <>Cách tuyến khoảng {(candidate.distanceMeters / 1000).toFixed(1)} km · </>}{candidate.coordinates[1].toFixed(5)}, {candidate.coordinates[0].toFixed(5)}</small><span>Chọn vị trí này</span></button>)}
  </section>;
}

function CompanionPanel({ trip, setTrip, onClose }) {
  const data = useTripRoute();
  const [category, setCategory] = useState('planned'), [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(null), [resolving, setResolving] = useState(null), [message, setMessage] = useState('');
  const [dayId, setDayId] = useState(trip.itinerary[0]?.id);
  const close = useRef(null), action = useRef(null);
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => { if (adding || resolving) action.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [adding, resolving]);
  const saved = useMemo(() => plannedPlaces(trip), [trip.itinerary]);
  const items = category === 'planned' ? saved : data.places.filter(place => place.type === category);
  const pins = useMemo(() => [...data.places, ...saved.filter(place => validPoint(place.coordinates))], [data.places, saved]);
  const visible = useMemo(() => ({ [category]: true }), [category]);
  const chooseCategory = key => { setCategory(key); setSelected(null); setAdding(null); setResolving(null); setMessage(''); };
  const targetDay = trip.itinerary.find(day => day.id === dayId) || trip.itinerary[0];
  const resolved = resolving && saved.find(p => p.id === resolving.id && p.name === resolving.name);
  const add = () => {
    setTrip(current => addPlannedPlace(current, targetDay.id, adding));
    setMessage(`Đã lưu ${adding.name} vào ngày ${trip.itinerary.indexOf(targetDay) + 1}.`); setAdding(null);
  };
  return <section id="trip-companion-panel" className="companion-panel" role="dialog" aria-modal="false" aria-labelledby="companion-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="companion-header"><div><small>ĐỒNG HÀNH CÙNG BẠN</small><h2 id="companion-title">Theo dõi hành trình</h2><p>{trip.origin} → {trip.destination}</p></div><button ref={close} type="button" onClick={onClose} aria-label="Thu gọn theo dõi hành trình"><ToolIcon name="close"/></button></header>
    <div className="companion-content">
      <nav className="companion-categories" aria-label="Loại điểm dọc hành trình">{['planned', 'food', 'drink', 'fuel', 'repair', 'rest'].map(key => <button type="button" key={key} aria-pressed={key === category} onClick={() => chooseCategory(key)}><ToolIcon name={markerTypes[key].icon}/><span>{key === 'planned' ? 'Lịch trình' : markerTypes[key].label}</span></button>)}</nav>
      <p className="companion-help">{category === 'planned' ? 'Các điểm đã thêm trong lịch trình. Điểm có tọa độ sẽ hiện ghim trên bản đồ.' : 'Tìm điểm trong khoảng 1,5 km dọc tuyến đi–đến. Bấm ghim để xem tên, chỉ đường hoặc lưu vào lịch trình.'}</p>
      {data.route ? <RouteMap route={data.route} places={pins} visible={visible} selected={selected} onPick={place => { setAdding(place); setResolving(null); }}/> : <><LocationControls/><div className="route-placeholder" role="status">{data.loading ? 'Đang tải cung đường…' : data.error}</div></>}
      {category !== 'planned' && (data.placesLoading || data.placesError) && <p className="route-message" role="status">{data.placesLoading ? `Đang tìm các điểm dọc tuyến… ${data.progress}` : data.placesError}</p>}
      {!data.loading && (data.error || data.placesError) && <button className="soft" onClick={data.retry}>Thử tải lại</button>}
      <div ref={action}>
        {adding && <section className="companion-action"><b>Thêm {adding.name}</b><label>Chọn ngày<select value={targetDay.id} onChange={e => setDayId(e.target.value)}>{trip.itinerary.map((day, index) => <option value={day.id} key={day.id}>Ngày {index + 1}: {day.title}</option>)}</select></label><button onClick={add}>Lưu vào lịch trình</button><button onClick={() => setAdding(null)}>Hủy</button></section>}
        {resolved && <ResolvePlace key={resolved.id} place={resolved} route={data.route} onCancel={() => setResolving(null)} onChoose={candidate => {
          setTrip(current => locatePlannedPlace(current, resolved.dayId, resolved.placeId, candidate, resolved.name));
          setSelected({ ...resolved, coordinates: candidate.coordinates }); setResolving(null); setMessage(`Đã chọn vị trí cho ${resolved.name}.`);
        }}/>}
      </div>
      {message && <p className="save-feedback" role="status">{message}</p>}
      <div className="companion-results"><h3>{category === 'planned' ? 'Điểm trong lịch trình' : markerTypes[category].label} ({items.length})</h3>
        {!items.length && <p>{category === 'planned' ? 'Chưa có điểm đã lưu. Chọn nhóm bên trên và thêm ghim vào lịch trình.' : data.placesLoading ? 'Đang tải dữ liệu…' : data.placesError || data.error ? 'Chưa có dữ liệu để hiển thị.' : 'Chưa tìm thấy điểm phù hợp trong dữ liệu bản đồ.'}</p>}
        {items.map(place => <article className="companion-place" key={place.id}>
          <button className="companion-place-name" disabled={!data.route} onClick={() => { if (validPoint(place.coordinates)) { setSelected({ ...place }); } else { setResolving(place); setAdding(null); } }}><b>{place.name}</b><small>{place.dayNumber ? `Ngày ${place.dayNumber} · ` : ''}{place.address || markerTypes[place.type].label}</small></button>
          <div className="companion-place-actions">
            {validPoint(place.coordinates) && <a href={placeDirectionsUrl(place)} target="_blank" rel="noreferrer">Chỉ đường</a>}
            {place.type === 'planned' ? <>
              <button onClick={() => { setResolving(place); setAdding(null); }}>{validPoint(place.coordinates) ? 'Đổi vị trí' : 'Chọn vị trí'}</button>
              {validPoint(place.coordinates) && <button onClick={() => {
                setTrip(current => clearPlannedLocation(current, place.dayId, place.placeId, place.name));
                setSelected(null); setResolving(null); setMessage(`Đã xóa vị trí của ${place.name}. Điểm vẫn được giữ trong lịch trình.`);
              }}>Xóa vị trí</button>}
            </> : <button onClick={() => setAdding(place)}>Thêm vào lịch trình</button>}
          </div>
        </article>)}
      </div>
      <p className="companion-help">OSRM nối các điểm đã có tọa độ theo thứ tự lịch trình. Điểm chưa có tọa độ cần Chọn vị trí. Tuyến ô tô có thể đi cao tốc, không phải tuyến dành riêng cho xe máy. Dữ liệu OpenStreetMap có thể thiếu; hãy kiểm tra cửa hàng sửa xe có nhận xe máy. Định vị chỉ cập nhật khi trình duyệt cho phép.</p>
    </div>
  </section>;
}

export default function TripCompanion({ trip, setTrip }) {
  const [open, setOpen] = useState(false), trigger = useRef(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="trip-companion">{open && <CompanionPanel trip={trip} setTrip={setTrip} onClose={close}/>}<button className="companion-launcher" ref={trigger} type="button" aria-expanded={open} aria-controls="trip-companion-panel" onClick={() => open ? close() : setOpen(true)}><ToolIcon name={open ? 'close' : 'assistant'}/><span>{open ? 'Thu gọn' : 'Hành trình'}</span></button></div>;
}
