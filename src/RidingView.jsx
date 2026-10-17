import React, { useEffect, useRef, useState } from 'react';
import RouteMap from './RouteMap.jsx';
import ToolIcon from './ToolIcon.jsx';
import { useLocation } from './Location.jsx';
import { useTripRoute } from './TripRouteContext.jsx';
import { loadNearbyPlaces, placeDirectionsUrl, directionsUrl } from './route-data.js';
import { nearbyStatus, nearbyMapsUrl } from './nearby-search.js';

const categories = [['fuel', 'Xăng', 'fuel'], ['rest', 'Nghỉ', 'bed'], ['repair', 'Sửa xe', 'repair']];
export default function RidingView({ trip }) {
  const route = useTripRoute(), location = useLocation();
  const [category, setCategory] = useState(null), [search, setSearch] = useState(null);
  const [results, setResults] = useState({ items: [], loading: false, error: '' });
  const [selected, setSelected] = useState(null);
  const resultsPanel = useRef(null);
  const refreshSearch = useRef(false);
  const locate = (key, refresh = false) => {
    refreshSearch.current = refresh;
    setCategory(key); setSelected(null); setSearch(null);
    setResults({ items: [], loading: false, error: '' });
    if (!location.position || location.stale || location.error) { location.start(); return; }
    setSearch({ key, point: [...location.position.coordinates], refresh });
  };
  useEffect(() => {
    if (category && !search && location.position && !location.stale && !location.error) {
      setSearch({ key: category, point: [...location.position.coordinates], refresh: refreshSearch.current });
    }
  }, [category, search, location.position, location.stale, location.error]);
  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    setResults({ items: [], loading: true, error: '' });
    loadNearbyPlaces(search.point, search.key, controller.signal, { refresh: search.refresh }).then(items => {
      if (!controller.signal.aborted) setResults({ items: items.map(p => ({ ...p, nearby: true })), loading: false, error: '', ready: true });
    }).catch(error => { if (!controller.signal.aborted) setResults({ items: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, [search]);
  return <section className="riding-view">
    <div className="riding-caption"><b>Tuyến dự kiến</b><span>Không ghi lại đường đã chạy</span></div>
    <nav className="nearby-actions" aria-label="Tìm quanh vị trí hiện tại">{categories.map(([key, label, icon]) => <button key={key} aria-expanded={category === key} onClick={() => category === key ? (setCategory(null), setSearch(null), setSelected(null), setResults({ items: [] })) : locate(key)}><ToolIcon name={icon} className="inline-icon"/>{label}</button>)}</nav>
    {category && <div className="nearby-feedback" aria-busy={location.pending || results.loading || (!!search && !results.ready && !results.error)}>
      <p role="status">{nearbyStatus(location, search, results)}</p>
      <div className="nearby-feedback-actions">
        {!!results.items.length && <button type="button" onClick={() => resultsPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Xem kết quả ({results.items.length})</button>}
        {search && <a href={nearbyMapsUrl(search.point, search.key)} target="_blank" rel="noreferrer">Tìm trên Google Maps</a>}
      </div>
    </div>}
    <RouteMap riding route={route.route} places={results.items} visible={{ [category]: true }} selected={selected} onSelectPlace={setSelected} />
    {!route.route && <p role="status">{route.loading ? (route.routeProgress || 'Đang tải tuyến dự kiến… Bạn vẫn có thể định vị và tìm điểm gần mình.') : route.error}{!route.loading && <button className="soft" onClick={route.retry}>Tải lại tuyến</button>}</p>}

    {category && <section ref={resultsPanel} className="nearby-sheet" aria-label="Địa điểm gần bạn">
      <div className="title"><h3>{categories.find(c => c[0] === category)[1]} gần bạn</h3><button onClick={() => { setCategory(null); setSearch(null); setResults({ items: [] }); setSelected(null); }}>Đóng</button></div>
      <p>Trong bán kính 1,5 km · khoảng cách đường thẳng tại lần tìm kiếm. Dữ liệu OpenStreetMap có thể thiếu; hãy kiểm tra giờ mở cửa và dịch vụ xe máy.</p>
      <button className="soft" disabled={location.pending || results.loading} onClick={() => locate(category, true)}>Tìm lại quanh tôi</button>
      {results.items.map(place => <article className="nearby-result" key={place.id}><button onClick={() => setSelected({ ...place })}><b>{place.name}</b><span>{Math.round(place.distanceMeters)} m · {place.address || 'Chưa có địa chỉ chi tiết'}</span></button><a href={placeDirectionsUrl(place)} target="_blank" rel="noreferrer">Chỉ đường</a></article>)}
    </section>}
    {route.route && <a className="riding-directions" href={directionsUrl(route.route.start, route.route.end)} target="_blank" rel="noreferrer">Mở Google Maps để dẫn đường</a>}
    <p className="riding-footnote">Google Maps tự tính tuyến riêng. Kiểm tra chế độ xe máy và các điểm dừng trước khi đi.</p>
  </section>;
}
