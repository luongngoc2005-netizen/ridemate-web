export const vietnamToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
export function addDays(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function tripWeatherDays(date, days, today = vietnamToday()) {
  const last = addDays(today, 15);
  return Array.from({ length: Number(days) }, (_, i) => { const day = addDays(date, i); return { date: day, status: day < today ? 'past' : day > last ? 'future' : 'forecast' }; });
}
export function weatherLabel(code) {
  if (code === 0) return '☀️ Trời quang';
  if ([1,2,3].includes(code)) return '⛅ Có mây';
  if ([45,48].includes(code)) return '🌫️ Sương mù';
  if ([51,53,55,56,57].includes(code)) return '🌦️ Mưa phùn';
  if ([61,63,65,66,67,80,81,82].includes(code)) return '🌧️ Có mưa';
  if ([71,73,75,77,85,86].includes(code)) return '❄️ Có tuyết';
  if ([95,96,99].includes(code)) return '⛈️ Dông';
  return 'Chưa rõ trạng thái';
}
const cache = new Map();
export async function loadWeather(coordinates, signal, refresh = false) {
  const key = `${coordinates.join(',')}:${vietnamToday()}`;
  const saved = cache.get(key);
  if (!refresh && saved && Date.now() - saved.fetchedAt < 30 * 60000) return saved;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: coordinates[1], longitude: coordinates[0], daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max', timezone: 'Asia/Ho_Chi_Minh', forecast_days: '16', temperature_unit: 'celsius', wind_speed_unit: 'kmh' });
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Dịch vụ thời tiết đang bận. Vui lòng thử lại.');
  const result = await response.json();
  if (!Array.isArray(result.daily?.time) || !result.daily.time.length) throw new Error('Chưa có dữ liệu dự báo.');
  const daily = result.daily;
  const data = { fetchedAt: Date.now(), days: daily.time.map((date, i) => ({ date, code: daily.weather_code?.[i], min: daily.temperature_2m_min?.[i], max: daily.temperature_2m_max?.[i], rain: daily.precipitation_probability_max?.[i], wind: daily.wind_speed_10m_max?.[i] })) };
  cache.set(key, data); if (cache.size > 8) cache.delete(cache.keys().next().value);
  return data;
}
