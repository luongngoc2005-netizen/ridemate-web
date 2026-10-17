import React from 'react';
import { tripOrigin } from './origin-data.js';
import { directionsUrl } from './route-data.js';
import ToolIcon from './ToolIcon.jsx';

// Journals describe completed journeys: never mount a map or calculate a route.
export default function JournalRoute({ entry, onEdit }) {
  const origin = entry.origin?.trim(), destination = entry.destination?.trim();
  return <section className="journal-route">
    <div className="title"><h3>Cung đường đã hoàn thành</h3>{origin && destination && <a href={directionsUrl(tripOrigin(entry), destination)} target="_blank" rel="noreferrer">Mở Google Maps <ToolIcon name="external" className="inline-icon"/></a>}</div>
    {origin && destination ? <p><b>{origin} → {destination}</b></p> : <button className="soft" onClick={onEdit}>Bổ sung cung đường</button>}
    <p className="muted-copy">Quãng đường thực tế bạn ghi nhận: {Number(entry.km).toLocaleString('vi-VN')} km. Bản đồ không tự tải cho chuyến đi đã hoàn thành.</p>
  </section>;
}
