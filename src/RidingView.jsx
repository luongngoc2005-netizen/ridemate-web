import React, { useRef, useState } from 'react';
import RouteMap from './RouteMap.jsx';
import ToolIcon from './ToolIcon.jsx';
import { useTripRoute } from './TripRouteContext.jsx';
import { placeDirectionsUrl, directionsUrl } from './route-data.js';

const categories = [['fuel', 'Xăng', 'fuel'], ['rest', 'Nghỉ', 'bed'], ['repair', 'Sửa xe', 'repair']];
export default function RidingView({ trip }) {
  const [visible, setVisible] = useState({}), [selected, setSelected] = useState(null);
  const types = Object.keys(visible).filter(type => visible[type]);
  const route = useTripRoute({ places: types }), resultsPanel = useRef(null);
  const items = route.places.filter(place => visible[place.type]);
  return <section className="riding-view">
    <div className="riding-caption"><b>Điểm hỗ trợ dọc hành trình</b><span>{trip.origin} → {trip.destination}</span></div>
    <nav className="nearby-actions" aria-label="Chọn điểm hỗ trợ dọc tuyến">{categories.map(([key, label, icon]) => <button key={key} aria-pressed={!!visible[key]} onClick={() => { setVisible(current => ({ ...current, [key]: !current[key] })); setSelected(null); }}><ToolIcon name={icon} className="inline-icon"/>{label}</button>)}</nav>
    <div className="nearby-feedback" aria-busy={route.placesLoading}>
      <p role="status">{!types.length ? 'Chọn Xăng, Nghỉ hoặc Sửa xe để tải và hiện các điểm rải dọc tuyến đi–đến.'
        : route.loading ? (route.routeProgress || 'Đang tải tuyến đi–đến trước khi tìm các điểm dọc đường…')
          : route.error || route.placesLoading ? (route.error || `Đang tìm các điểm dọc tuyến… ${route.progress}`)
            : route.placesError || (items.length ? `Đã hiện ${items.length} điểm dọc tuyến. Bấm ghim để xem tên và chỉ đường.` : 'Chưa tìm thấy điểm phù hợp dọc tuyến trong dữ liệu bản đồ.')}</p>
      {!!items.length && <button type="button" onClick={() => resultsPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Xem danh sách ({items.length})</button>}
      {(route.error || route.placesError) && <button className="soft" onClick={route.retry}>Thử tải lại</button>}
    </div>
    <RouteMap riding route={route.route} places={route.places} visible={visible} selected={selected} onSelectPlace={setSelected}/>
    {!types.length && !route.route && <p role="status">{route.loading ? (route.routeProgress || 'Đang tải tuyến dự kiến…') : route.error}{route.error && <button className="soft" onClick={route.retry}>Tải lại tuyến</button>}</p>}
    {!!types.length && <section ref={resultsPanel} aria-label="Danh sách điểm dọc hành trình">
      <p>Trong phạm vi khoảng 1,5 km hai bên đường, tối đa 30 điểm mỗi loại được chọn rải dọc toàn tuyến. Dữ liệu OpenStreetMap có thể thiếu; hãy kiểm tra giờ mở cửa và dịch vụ xe máy.</p>
      {categories.filter(([type]) => visible[type]).map(([type, label]) => <details className="nearby-sheet" key={type}><summary>{label} dọc tuyến ({items.filter(place => place.type === type).length})</summary>
        {items.filter(place => place.type === type).map(place => <article className="nearby-result" key={place.id}><button onClick={() => setSelected({ ...place })}><b>{place.name}</b><span>Cách tuyến {Math.round(place.distanceMeters)} m · {place.address || 'Chưa có địa chỉ chi tiết'}</span></button><a href={placeDirectionsUrl(place)} target="_blank" rel="noreferrer">Chỉ đường</a></article>)}
      </details>)}
    </section>}
    {route.route && <a className="riding-directions" href={directionsUrl(route.route.start, route.route.end)} target="_blank" rel="noreferrer">Mở Google Maps để dẫn đường</a>}
    <p className="riding-footnote">Google Maps tự tính tuyến riêng. Kiểm tra chế độ xe máy và các điểm dừng trước khi đi.</p>
  </section>;
}
