import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { requestLocation } from './geolocation.js';
import ToolIcon from './ToolIcon.jsx';

const LocationContext = createContext(null);
export const useLocation = () => useContext(LocationContext);

export function LocationProvider({ children }) {
  const [state, setState] = useState({ tracking: false, position: null, error: '', pending: false });
  const dispose = useRef(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => () => dispose.current?.(), []);
  useEffect(() => {
    if (!state.tracking) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [state.tracking]);
  const stop = () => {
    dispose.current?.(); dispose.current = null;
    setState({ tracking: false, position: null, error: '', pending: false });
  };
  const start = () => {
    dispose.current?.();
    setState({ tracking: true, position: null, pending: true, error: '' });
    dispose.current = requestLocation({ watch: true,
      onPosition: position => { setNow(Date.now()); setState({ tracking: true, position, pending: false, error: '' }); },
      onError: (error, details) => setState(current => ({ ...current, tracking: !details?.fatal, pending: false, error, position: details?.fatal ? null : current.position })),
    });
  };
  const stale = !!state.position && now - state.position.timestamp > 30000;
  return <LocationContext.Provider value={{ ...state, stale, start, stop }}>{children}</LocationContext.Provider>;
}

export function LocationControls({ onCenter, follow, onFollow }) {
  const location = useLocation();
  if (!location) return null;
  return <div className="location-controls">
    <div className="location-buttons">
      <button type="button" aria-pressed={location.tracking} onClick={location.tracking ? location.stop : location.start}><ToolIcon name="locate" className="inline-icon"/> {location.tracking ? 'Tắt định vị' : 'Bật định vị'}</button>
      {onCenter && <button type="button" disabled={!location.position} onClick={onCenter}>Về vị trí tôi</button>}
      {onFollow && <button type="button" aria-pressed={follow} disabled={!location.tracking} onClick={onFollow}>{follow ? 'Dừng bám vị trí' : 'Bám theo tôi'}</button>}
    </div>
    <p className="location-status" role="status">{location.error || (location.pending ? 'Đang lấy vị trí… Hãy cho phép trình duyệt truy cập vị trí.' : location.position ? `${location.stale ? 'Vị trí lần cuối' : 'Vị trí của bạn'} · sai số khoảng ${Math.round(location.position.accuracy)} m · ${new Date(location.position.timestamp).toLocaleTimeString('vi-VN')}` : 'Bật định vị để thấy vị trí của bạn trên bản đồ.')}</p>
  </div>;
}

export function LocationStatus() {
  const location = useLocation();
  if (!location?.tracking) return null;
  return <div className="location-banner"><span><ToolIcon name="locate" className="inline-icon"/> {location.error ? 'Định vị đang gián đoạn' : location.pending ? 'Đang lấy vị trí' : location.stale ? 'Đang chờ vị trí mới' : 'Định vị đang bật'} · Giữ trang mở để cập nhật</span><button type="button" onClick={location.stop}>Tắt định vị</button></div>;
}
