import ToolIcon, { createToolIconElement } from './ToolIcon.jsx';
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadRoute, loadPlaces, supportTypes, mapServices, directionsUrl, placeDirectionsUrl } from './route-data.js';
import './route-map.css';
import TripWeather from './TripWeather.jsx';

export function RouteMap({ route, places = [], visible = {}, selected }) {
  const container = useRef(null), map = useRef(null), markers = useRef(new Map());
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    const instance = L.map(container.current, { scrollWheelZoom: false });
    map.current = instance;
    setTileError(false);
    L.tileLayer(mapServices.tiles, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).on('tileerror', () => setTileError(true)).addTo(instance);
    const latlngs = route.coordinates.map(([lon, lat]) => [lat, lon]);
    L.polyline(latlngs, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(instance);
    L.polyline(latlngs, { color: '#0f6745', weight: 5, opacity: 0.95 }).addTo(instance);
    for (const [point, title, color] of [[route.start, 'Điểm đi', '#0f6745'], [route.end, 'Điểm đến', '#ff6738']]) {
      const label = document.createElement('span');
      label.textContent = `${title}: ${point.label}`;
      L.circleMarker([point.coordinates[1], point.coordinates[0]], { color: '#fff', fillColor: color, fillOpacity: 1, weight: 3, radius: 9 }).bindTooltip(label).bindPopup(label.cloneNode(true)).addTo(instance);
    }
    const fit = () => instance.fitBounds(L.latLngBounds(latlngs), { padding: [28, 28], maxZoom: 14 });
    fit();
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
      const button = L.DomUtil.create('button', 'route-fit');
      button.type = 'button'; button.textContent = 'Toàn tuyến';
      L.DomEvent.disableClickPropagation(button); L.DomEvent.on(button, 'click', fit);
      return button;
    };
    control.addTo(instance);
    return () => { resize.disconnect(); instance.remove(); map.current = null; markers.current.clear(); };
  }, [route]);
  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    markers.current.clear();
    for (const place of places.filter(place => visible[place.type])) {
      const config = supportTypes[place.type];
      const pinContent = document.createElement('span');
      pinContent.style.background = config.color;
      pinContent.append(createToolIconElement(config.icon));
      const pin = L.divIcon({ className: 'support-pin', html: pinContent, iconSize: [34, 34], iconAnchor: [17, 17] });
      const marker = L.marker([place.coordinates[1], place.coordinates[0]], { icon: pin, title: `${config.label}: ${place.name}`, keyboard: true }).addTo(layer);
      const popup = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = place.name; popup.append(name);
      const address = document.createElement('p'); address.textContent = place.address || config.label; popup.append(address);
      const distance = document.createElement('p'); distance.textContent = `Cách tuyến khoảng ${Math.round(place.distanceMeters)} m (đường thẳng)`; popup.append(distance);
      const link = document.createElement('a'); link.href = placeDirectionsUrl(place); link.textContent = 'Chỉ đường đến đây'; link.target = '_blank'; link.rel = 'noopener noreferrer'; popup.append(link);
      marker.bindPopup(popup); markers.current.set(place.id, marker);
    }
    if (!selected) map.current.fitBounds(L.latLngBounds(route.coordinates.map(([lon, lat]) => [lat, lon])), { padding: [28, 28], maxZoom: 14 });
    return () => { layer.remove(); markers.current.clear(); };
  }, [route, places, visible]);
  useEffect(() => {
    const marker = markers.current.get(selected?.id);
    if (marker && map.current) { map.current.setView(marker.getLatLng(), Math.max(map.current.getZoom(), 14)); marker.openPopup(); }
  }, [selected, visible, route]);
  return <>{tileError && <p className="route-message" role="status">Ảnh nền bản đồ chưa tải được. Bạn vẫn có thể xem danh sách địa điểm và mở Google Maps.</p>}<div ref={container} className="route-canvas" role="region" aria-label={`Cung đường ${route.start.label} đến ${route.end.label}`} /></>;
}

export default function RouteOverview({ trip, children }) {
  const [state, setState] = useState({ loading: true, route: null, places: [], placesLoading: false, error: '', placesError: '' });
  const [retry, setRetry] = useState(0), [selected, setSelected] = useState(null);
  const [visible, setVisible] = useState({ fuel: false, food: false, rest: false });
  const mapSection = useRef(null);
  const requestKey = `${trip.origin.trim()}\u0000${trip.destination.trim()}`;
  useEffect(() => {
    const controller = new AbortController();
    setState({ key: requestKey, loading: true, route: null, places: [], placesLoading: false, error: '', placesError: '' });
    setSelected(null);
    (async () => {
      let route;
      try {
        route = await loadRoute(trip.origin, trip.destination, controller.signal);
        if (controller.signal.aborted) return;
        setState(current => ({ ...current, route, loading: false, placesLoading: true }));
      } catch (error) {
        if (!controller.signal.aborted) setState(current => ({ ...current, loading: false, error: error.message || 'Không tải được cung đường.' }));
        return;
      }
      try {
        const places = await loadPlaces(route, controller.signal);
        if (!controller.signal.aborted) setState(current => ({ ...current, places, placesLoading: false }));
      } catch {
        if (!controller.signal.aborted) setState(current => ({ ...current, placesLoading: false, placesError: 'Chưa tải được các điểm hỗ trợ dọc đường. Bạn có thể thử lại hoặc tìm trên Google Maps bên dưới.' }));
      }
    })();
    return () => controller.abort();
  }, [requestKey, retry]);
  // Do not display a previous trip's route during the render before the effect runs.
  const current = state.key === requestKey ? state : { loading: true, route: null, places: [] };
  const select = place => { setVisible(value => ({ ...value, [place.type]: true })); setSelected({ ...place }); mapSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const maps = current.route ? directionsUrl(current.route.start, current.route.end) : null;
  const toggleType = key => { setSelected(null); setVisible(value => ({ ...value, [key]: !value[key] })); };
  return <div className="tripgrid route-overview"><section className="card quick-information">{children}<section className="route-quick"><h3>Thông tin nhanh</h3><p className="route-caption">Chặng đi: {trip.origin} <ToolIcon name="arrowRight" className="inline-icon"/> {trip.destination}</p>{current.route && <><div className="route-metrics"><span><b>{Math.round(current.route.distanceKm).toLocaleString('vi-VN')} km</b><small>Quãng đường dự kiến</small></span><span><b>{Math.floor(Math.round(current.route.durationSeconds / 60) / 60)} giờ {Math.round(current.route.durationSeconds / 60) % 60} phút</b><small>Chưa gồm thời gian dừng nghỉ</small></span></div><p className="route-caption">Định vị: {current.route.start.label} <ToolIcon name="arrowRight" className="inline-icon"/> {current.route.end.label}</p></>}
      <TripWeather trip={trip} /><h4>Điểm hỗ trợ gần cung đường</h4><p className="route-caption">Tối đa 30 điểm mỗi loại, phân bố dọc tuyến trong phạm vi khoảng 1,5 km theo đường thẳng. Bấm ghim để xem tên và chỉ đường; dữ liệu có thể chưa đầy đủ.</p>{(current.loading || current.placesLoading) && <p role="status" className="route-message">{current.loading ? 'Đang tìm cung đường…' : 'Đang tìm cây xăng, quán ăn và điểm nghỉ…'}</p>}{current.placesError && <p role="status" className="route-message">{current.placesError}</p>}
      {Object.entries(supportTypes).map(([key, type]) => <section className={`support-group support-${key}`} key={key}><h4><button className="support-toggle" aria-pressed={visible[key]} onClick={() => { toggleType(key); mapSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><ToolIcon name={type.icon} className="inline-icon"/> {type.label} ({current.places.filter(place => place.type === key).length}) · {visible[key] ? "Ẩn ghim" : "Hiện ghim"}</button></h4><div role="list" aria-label={type.label}>{current.places.filter(place => place.type === key).map(place => <div key={place.id} className="support-row" role="listitem"><button type="button" className="support-place" onClick={() => select(place)} aria-label={`Xem trên bản đồ: ${place.name}`} title={[place.name, place.address].filter(Boolean).join(' — ')}><span className="support-name">{place.name}</span><span className="support-distance">{place.distanceMeters < 1000 ? `${Math.max(10, Math.round(place.distanceMeters / 10) * 10)} m` : `${(place.distanceMeters / 1000).toFixed(1)} km`}</span></button><a className="support-map-link" href={placeDirectionsUrl(place)} target="_blank" rel="noreferrer" aria-label={`Chỉ đường đến ${place.name}`} title="Chỉ đường đến đây"><ToolIcon name="external" className="inline-icon"/></a></div>)}</div>{!current.loading && !current.placesLoading && !current.places.some(place => place.type === key) && <p className="route-caption">{current.placesError || current.error ? 'Chưa có dữ liệu để hiển thị.' : 'Chưa tìm thấy điểm phù hợp trong dữ liệu bản đồ.'}</p>}<a className="support-search" href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${type.label} gần ${trip.destination}` })}`} target="_blank" rel="noreferrer">Tìm thêm quanh {trip.destination} <ToolIcon name="external" className="inline-icon"/></a></section>)}
      <p className="route-caption">Nguồn: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>. Danh sách có thể chưa đầy đủ; giờ mở cửa chưa được xác minh.</p></section></section>
      <section ref={mapSection} className="card journey-route-map">
        <div className="title"><h3>Cung đường trên bản đồ</h3>{maps && <a href={maps} target="_blank" rel="noreferrer">Mở Google Maps <ToolIcon name="external" className="inline-icon"/></a>}</div>
        <p className="route-caption">Tuyến nối hai điểm đi–đến. Google Maps nhận đúng tọa độ hai điểm đang hiển thị; chưa bao gồm điểm tham quan trong lịch trình.</p>
        {current.route ? <>
          <div className="route-legend" aria-label="Hiển thị điểm hỗ trợ dọc tuyến">
            {Object.entries(supportTypes).map(([key, type]) => <button key={key} aria-pressed={visible[key]} onClick={() => toggleType(key)}><ToolIcon name={type.icon} className="inline-icon"/> {type.label} ({current.places.filter(place => place.type === key).length})</button>)}
          </div>
          <p className="route-caption" role="status">{current.placesLoading ? 'Đang tìm điểm hỗ trợ dọc toàn tuyến…' : current.placesError || (Object.values(visible).some(Boolean) ? 'Bấm ghim để xem tên và chọn “Chỉ đường đến đây”.' : 'Chọn Cây xăng, Quán ăn hoặc Điểm nghỉ để hiện ghim dọc đường.')}</p>
          <RouteMap route={current.route} places={current.places} visible={visible} selected={selected} />
          <p className="route-caption">Điểm đi: {current.route.start.label}. Điểm đến: {current.route.end.label}. Tỉnh/thành được định vị bằng điểm đại diện, không phải địa chỉ cụ thể của bạn.</p>
          <p className="route-caption">Google Maps có thể chọn đường khác dù cùng hai đầu tuyến. Khi mở chỉ đường, kiểm tra lại chế độ xe máy và tránh cao tốc.</p>
        </> : <div className="route-placeholder" role="status">{current.loading ? 'Đang xác định điểm đi–đến và tải cung đường…' : current.error || 'Chưa tải được bản đồ.'}</div>}
        {!current.loading && (current.error || current.placesError) && <button className="soft" onClick={() => setRetry(value => value + 1)}>Thử tải lại</button>}
        <p className="route-caption">Dữ liệu cần kết nối mạng · Tuyến: Valhalla / OpenStreetMap</p>
      </section></div>;
}
