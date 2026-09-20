import ToolIcon from './ToolIcon.jsx';
import React, { useEffect, useState } from 'react';
import { geocode } from './route-data.js';
import { loadWeather, tripWeatherDays, weatherLabel, weatherIcon, vietnamToday } from './weather-data.js';
import './weather.css';
const format = date => new Date(`${date}T12:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const value = (number, suffix) => Number.isFinite(number) ? `${Math.round(number)}${suffix}` : 'Chưa có';
export default function TripWeather({ trip }) {
  const [state, setState] = useState({}), [retry, setRetry] = useState(0);
  const today = vietnamToday(), days = tripWeatherDays(trip.date, trip.days, today);
  const key = `${trip.destination}:${trip.date}:${trip.days}:${today}`;
  const hasForecast = days.some(day => day.status === 'forecast');
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, loading: hasForecast });
    if (!hasForecast) return () => controller.abort();
    const timer = setTimeout(() => controller.abort(), 30000);
    let disposed = false;
    (async () => {
      try {
        const location = await geocode(trip.destination, controller.signal);
        const forecast = await loadWeather(location.coordinates, controller.signal, retry > 0);
        if (!controller.signal.aborted) setState({ key, location: location.label, ...forecast });
      } catch { if (!disposed) setState({ key, error: 'Chưa tải được thời tiết. Kiểm tra kết nối và thử lại.' }); }
      finally { clearTimeout(timer); }
    })();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [key, retry]);
  const current = state.key === key ? state : { loading: hasForecast };
  return <section className="trip-weather" aria-label="Dự báo thời tiết"><div className="title"><h3><ToolIcon name="cloud" className="inline-icon"/> Thời tiết dự kiến</h3>{hasForecast && <button className="soft" disabled={current.loading} onClick={() => setRetry(n => n + 1)}>Tải lại thời tiết</button>}</div><p className="route-caption">Tại {current.location || trip.destination} · {format(trip.date)} – {format(days.at(-1).date)}. Dự báo tại điểm đến, không đại diện toàn bộ cung đường.</p>{current.loading && <p role="status">Đang tải dự báo…</p>}{current.error && <p role="status">{current.error}</p>}<div className="weather-days">{days.map((day, index) => { const data = current.days?.find(item => item.date === day.date); return <article className="weather-day" key={day.date}><b>Ngày {index + 1} · {format(day.date)}</b>{day.status !== 'forecast' ? <p>{day.status === 'past' ? 'Ngày đã qua — không hiển thị dự báo.' : 'Chưa đến thời hạn dự báo.'}</p> : data ? <><strong><ToolIcon name={weatherIcon(data.code)} className="inline-icon"/> {weatherLabel(data.code)}</strong><span>{value(data.min, '°')} – {value(data.max, '°C')}</span><small>Khả năng mưa: {value(data.rain, '%')}</small><small>Gió tối đa: {value(data.wind, ' km/h')}</small></> : <p>{current.loading ? 'Đang tải…' : 'Chưa có dữ liệu.'}</p>}</article>; })}</div><p className="route-caption">Dự báo tối đa 16 ngày tính từ hôm nay và có thể thay đổi. Nên kiểm tra lại sát ngày khởi hành.{current.fetchedAt && ` Lấy dữ liệu lúc ${new Date(current.fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })} (giờ Việt Nam).`} Nguồn: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>.</p></section>;
}
