import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createToolIconElement } from './ToolIcon.jsx';
import { mapServices, markerTypes, placeDirectionsUrl, validPoint } from './route-data.js';
import { routeGeoJSON, accuracyGeoJSON, dayColor } from './osrm-data.js';
import { useLocation, LocationControls } from './Location.jsx';
import { reconcilePlaceMarkers, clearPlaceMarkers } from './map-markers.js';
import './route-map.css';

const emptyPlaces = [], emptyVisibility = {};
// MapLibre 6 ships an external worker: let Vite bundle its dependencies too.
maplibregl.setWorkerUrl(mapWorkerUrl);
function fitPoints(map, points) {
  if (!points.length) return;
  const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
  for (const point of points) bounds.extend(point);
  map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
}
function popupContent(place, label) {
  const root = document.createElement('div');
  const name = document.createElement('strong'); name.textContent = place.name || place.label; root.append(name);
  const address = document.createElement('p'); address.textContent = place.address || label; root.append(address);
  const link = document.createElement('a'); link.href = placeDirectionsUrl(place); link.textContent = 'Chỉ đường đến đây'; link.target = '_blank'; link.rel = 'noopener noreferrer'; root.append(link);
  const notice = document.createElement('small'); notice.textContent = 'Google Maps tự tính tuyến riêng; kiểm tra tuyến không qua biên giới trước khi đi.'; root.append(notice);
  return root;
}
export default function RouteMap({ route, center, places = emptyPlaces, visible = emptyVisibility, selected, onPick, onSelectPlace, onMapPick }) {
  const container = useRef(null), map = useRef(null), markers = useRef(new Map());
  const pick = useRef(onPick); pick.current = onPick;
  const selectPlace = useRef(onSelectPlace); selectPlace.current = onSelectPlace;
  const mapPick = useRef(onMapPick); mapPick.current = onMapPick;
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [follow, setFollow] = useState(false), [activeLeg, setActiveLeg] = useState(null);
  const location = useLocation(), position = location?.position;
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setError('Nền bản đồ phản hồi chậm. Kiểm tra kết nối hoặc bấm tải lại nền.'), 20000);
    return () => clearTimeout(timer);
  }, [ready]);
  useEffect(() => {
    let instance;
    try {
      instance = new maplibregl.Map({ container: container.current, style: mapServices.style, center: [106.2, 16.2], zoom: 5, cooperativeGestures: true, attributionControl: { compact: true } });
    } catch {
      setError('Không khởi tạo được bản đồ WebGL. Hãy bật tăng tốc đồ họa hoặc thử trình duyệt khác.'); return;
    }
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl(), 'top-left');
    instance.addControl(new maplibregl.FullscreenControl(), 'top-right');
    instance.on('load', () => { setReady(true); setError(''); });
    instance.on('error', () => setError('Một phần bản đồ chưa tải được. Kiểm tra kết nối hoặc bấm tải lại nền.'));
    instance.on('dragstart', () => setFollow(false));
    instance.on('click', event => { if(event.originalEvent?.target?.closest?.('.maplibregl-marker, .maplibregl-popup'))return; mapPick.current?.([event.lngLat.lng,event.lngLat.lat]); });
    const resize = new ResizeObserver(() => instance.resize()); resize.observe(container.current);
    return () => { resize.disconnect(); clearPlaceMarkers(markers.current); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current, geojson = routeGeoJSON(route);
    if (!instance.getSource('trip-route')) {
      instance.addSource('trip-route', { type: 'geojson', data: geojson });
      instance.addLayer({ id: 'trip-route-outline', type: 'line', source: 'trip-route', paint: { 'line-color': '#fff', 'line-width': 9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      instance.addLayer({ id: 'trip-route-line', type: 'line', source: 'trip-route', paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      instance.addLayer({ id: 'trip-route-selected', type: 'line', source: 'trip-route', filter: ['==', ['get', 'index'], -1], paint: { 'line-color': '#ffb629', 'line-width': 8 } });
    } else instance.getSource('trip-route').setData(geojson);
    setActiveLeg(null);
    const points = route?.points || (route ? [route.start, route.end] : center ? [center] : []);
    const endpoints = points.filter(p => validPoint(p.coordinates)).map((point, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'route-stop-marker'; button.style.background = dayColor(point.dayNumber);
      button.textContent = String(index + 1); button.title = point.label || point.name; button.setAttribute('aria-label', `${index + 1}. ${point.label || point.name}`);
      const popup = new maplibregl.Popup({ offset: 18 }).setDOMContent(popupContent(point, point.dayNumber ? `Ngày ${point.dayNumber}` : 'Địa điểm'));
      return new maplibregl.Marker({ element: button }).setLngLat(point.coordinates).setPopup(popup).addTo(instance);
    });
    if (route) fitPoints(instance, route.coordinates);
    else if (validPoint(center?.coordinates)) instance.flyTo({ center: center.coordinates, zoom: mapPick.current ? Math.max(16,instance.getZoom()) : 12 });
    return () => endpoints.forEach(marker => marker.remove());
  }, [ready, route, center]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    reconcilePlaceMarkers(markers.current, places, visible, place => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'support-pin maplibre-support';
      const marker = new maplibregl.Marker({ element: button }).setLngLat(place.coordinates).setPopup(new maplibregl.Popup({ offset: 22 })).addTo(instance);
      const record = { marker, button, place };
      button.addEventListener('click', () => { setFollow(false); selectPlace.current?.(record.place); });
      marker.getPopup().on('close', () => {
        if (record.retained && markers.current.get(place.id) === record) {
          markers.current.delete(place.id); marker.remove();
        }
      });
      return record;
    }, (record, place) => {
      const signature = JSON.stringify([place, !!pick.current]);
      record.place = place;
      if (signature === record.signature) return;
      record.signature = signature;
      const { marker, button } = record;
      const config = markerTypes[place.type] || markerTypes.planned;
      button.setAttribute('aria-label', `${config.label}: ${place.name}`);
      const icon = document.createElement('span'); icon.style.background = config.color; icon.append(createToolIconElement(config.icon)); button.replaceChildren(icon);
      const root = popupContent(place, config.label);
      if (Number.isFinite(place.distanceMeters)) { const distance = document.createElement('p'); distance.textContent = `Cách tuyến khoảng ${Math.round(place.distanceMeters)} m (đường thẳng)`; root.append(distance); }
      if (pick.current && place.type !== 'planned') {
        const save = document.createElement('button'); save.type = 'button'; save.className = 'pin-save'; save.textContent = 'Thêm vào lịch trình'; save.onclick = () => pick.current?.(place); root.append(save);
      }
      marker.setLngLat(place.coordinates); marker.getPopup().setDOMContent(root);
    });
  }, [ready, places, visible, !!onPick]);
  useEffect(() => {
    if (!ready) return;
    const marker = markers.current.get(selected?.id)?.marker;
    if (!marker || !map.current) return;
    setFollow(false); map.current.flyTo({ center: marker.getLngLat(), zoom: 15 });
    if (!marker.getPopup().isOpen()) marker.togglePopup();
  }, [selected, ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    if (!instance.getSource('my-accuracy')) {
      instance.addSource('my-accuracy', { type: 'geojson', data: accuracyGeoJSON(position) });
      instance.addLayer({ id: 'my-accuracy-fill', type: 'fill', source: 'my-accuracy', paint: { 'fill-color': '#237ed6', 'fill-opacity': 0.15 } });
    } else instance.getSource('my-accuracy').setData(accuracyGeoJSON(position));
    if (!position) return;
    const element = document.createElement('div'); element.className = 'my-location-marker'; element.style.background = location.stale ? '#718078' : '#1976d2'; element.title = location.stale ? 'Vị trí lần cuối' : 'Vị trí của bạn';
    const marker = new maplibregl.Marker({ element }).setLngLat(position.coordinates).addTo(instance);
    if (follow && !location.stale) instance.easeTo({ center: position.coordinates, zoom: Math.max(15, instance.getZoom()), duration: 500 });
    return () => marker.remove();
  }, [ready, position, location?.stale, follow]);
  useEffect(() => { if (!location?.tracking) setFollow(false); }, [location?.tracking]);
  useEffect(() => {
    if (ready && map.current?.getLayer('trip-route-selected')) map.current.setFilter('trip-route-selected', ['==', ['get', 'index'], activeLeg ?? -1]);
  }, [ready, activeLeg, route]);
  const fit = () => { setFollow(false); setActiveLeg(null); if (map.current) fitPoints(map.current, [...(route?.coordinates || []), ...places.filter(p => visible[p.type] && validPoint(p.coordinates)).map(p => p.coordinates)]); };
  return <div className="live-map">
    <LocationControls onCenter={() => { if (position) map.current?.flyTo({ center: position.coordinates, zoom: 16 }); }} follow={follow} onFollow={() => setFollow(value => !value)}/>
    {!!route?.routingVia?.length && <p className="route-message">Đã chọn đường trong nước qua {route.routingVia.join(' → ')} để tránh đi qua nước ngoài. Đây là điểm dẫn tuyến tự động; lịch trình đã lưu không bị thay đổi.</p>}
    {error && <p className="route-message" role="status">{error} <button type="button" onClick={() => { if (map.current) { setReady(false); map.current.once('style.load', () => { setReady(true); setError(''); }); map.current.setStyle(mapServices.style); } }}>Tải lại nền</button></p>}
    <div className="live-map-frame"><div ref={container} className="route-canvas" role="region" aria-label={route ? `Cung đường ${route.start.label} đến ${route.end.label}` : 'Bản đồ vị trí'}/>{(route || places.length>0) && <button className="route-fit map-fit-button" type="button" onClick={fit}>{route?'Toàn tuyến':'Tất cả địa điểm'}</button>}</div>
    {!!route?.legs?.length && <div className="route-stages" aria-label="Các chặng theo lịch trình">{route.legs.map((leg, index) => <button key={index} aria-pressed={activeLeg === index} style={{ borderLeftColor: dayColor(leg.dayNumber) }} onClick={() => { setFollow(false); setActiveLeg(index); if (map.current) fitPoints(map.current, leg.coordinates); }}><small>Ngày {leg.dayNumber}</small><b>{leg.start.label || leg.start.name} → {leg.end.label || leg.end.name}</b><span>{leg.distanceKm.toFixed(1)} km · {Math.round(leg.durationSeconds / 60)} phút</span></button>)}</div>}
  </div>;
}
