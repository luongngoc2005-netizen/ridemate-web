import React, { useEffect, useState } from 'react';
import { RouteMap } from './RouteOverview.jsx';
import { loadRoute, directionsUrl } from './route-data.js';

export default function JournalRoute({ entry, onEdit }) {
  const [state, setState] = useState({}), [retry, setRetry] = useState(0);
  const origin = entry.origin?.trim(), destination = entry.destination?.trim();
  const key = `${entry.id}:${origin}:${destination}`;
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, loading: true });
    if (origin && destination) loadRoute(origin, destination, controller.signal).then(route => {
      if (!controller.signal.aborted) setState({ key, route });
    }).catch(error => { if (!controller.signal.aborted) setState({ key, error: error.message || 'Chưa tải được bản đồ.' }); });
    return () => controller.abort();
  }, [key, retry]);
  const current = state.key === key ? state : { loading: true };
  return <section className="journal-route"><div className="title"><h3>Bản đồ cung đường</h3>{origin && destination && <a href={directionsUrl(origin, destination)} target="_blank" rel="noreferrer">Google Maps ↗</a>}</div>{!origin || !destination ? <div className="route-placeholder"><p>Thêm điểm xuất phát và điểm kết thúc để xem cung đường của hành trình này.</p><button type="button" className="soft" onClick={onEdit}>Thêm cung đường</button></div> : <><p><b>{origin} → {destination}</b></p>{current.route ? <RouteMap route={current.route} /> : <div className="route-placeholder" role="status">{current.loading ? 'Đang tải cung đường…' : current.error}{current.error && <button className="soft" onClick={() => setRetry(n => n + 1)}>Thử tải lại bản đồ</button>}</div>}<p className="muted-copy">Tuyến xe máy tham khảo dựng từ điểm đi và điểm kết thúc, chưa gồm các điểm ghé và không phải bản ghi GPS. Quãng đường thực tế bạn ghi nhận: {Number(entry.km).toLocaleString('vi-VN')} km.</p></>}</section>;
}
