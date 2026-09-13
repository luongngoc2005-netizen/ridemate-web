const env = import.meta.env || {};
export const mapServices = {
  geocode: env.VITE_GEOCODER_URL || 'https://photon.komoot.io/api/',
  route: env.VITE_ROUTER_URL || 'https://valhalla1.openstreetmap.de/route',
  places: env.VITE_PLACES_URL || 'https://overpass-api.de/api/interpreter',
  tiles: env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};
export const supportTypes = {
  fuel: { label: 'Cây xăng', icon: '⛽', color: '#c04f19' },
  food: { label: 'Quán ăn', icon: '🍜', color: '#805bb0' },
  rest: { label: 'Điểm nghỉ / chỗ ở', icon: '🛏', color: '#14728c' },
};
const cache = new Map();
const CACHE_KEY = 'ridemate.map-cache.v1';
function cached(key) {
  try {
    if (!cache.size && typeof localStorage !== 'undefined') {
      const entries = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      if (Array.isArray(entries)) for (const [k, value] of entries.slice(-8)) cache.set(k, value);
    }
  } catch { /* Browsing without storage is supported. */ }
  const value = cache.get(key);
  return value?.expires > Date.now() ? value.data : null;
}
function remember(key, data, ttl) {
  cache.delete(key);
  cache.set(key, { expires: Date.now() + ttl, data });
  while (cache.size > 8) cache.delete(cache.keys().next().value);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify([...cache])); } catch { /* Keep the in-memory cache when quota is unavailable. */ }
  return data;
}
async function request(url, { signal, ...options } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 25000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 429 ? 'Dịch vụ bản đồ đang bận. Vui lòng thử lại sau.' : 'Dịch vụ bản đồ tạm thời chưa trả được dữ liệu.');
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (controller.signal.aborted) throw new Error('Dịch vụ bản đồ phản hồi chậm. Vui lòng thử lại sau.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
export function validPoint(point) {
  return Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}
export function chooseLocation(features, name = '') {
  const candidates = (features || []).filter(item => validPoint(item.geometry?.coordinates) && item.properties?.countrycode?.toUpperCase() === 'VN');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
  // Preserve provider relevance. Never replace an exact match with an unrelated city.
  return candidates.find(item => normalize(item.properties.name || '') === normalize(name)) || candidates[0];
}
export async function geocode(name, signal) {
  const key = `geo:${mapServices.geocode}:${name.trim().toLowerCase()}`;
  const saved = cached(key);
  if (saved && validPoint(saved.coordinates)) return saved;
  const url = new URL(mapServices.geocode);
  url.search = new URLSearchParams({ q: name.trim(), limit: '5', bbox: '102,8,110,24' });
  const result = chooseLocation((await request(url, { signal })).features, name);
  if (!result) throw new Error(`Không xác định được “${name}” tại Việt Nam. Hãy nhập tên địa điểm cụ thể hơn.`);
  const properties = result.properties;
  return remember(key, { coordinates: result.geometry.coordinates, label: [...new Set([properties.name, properties.city, properties.state].filter(Boolean))].join(', ') }, 7 * 86400000);
}
export function routeRequest(start, end) {
  return { locations: [start, end].map(([lon, lat]) => ({ lon, lat, type: 'break' })), costing: 'motorcycle', costing_options: { motorcycle: { exclude_highways: true, use_highways: 0, use_trails: 0, use_tolls: 0 } }, units: 'kilometers', shape_format: 'geojson', directions_type: 'none' };
}
export function parseRoute(result, start, end) {
  const trip = result.trip;
  const coordinates = trip?.legs?.flatMap(leg => typeof leg.shape === 'string' ? decodePolyline(leg.shape) : leg.shape?.coordinates || []);
  if (trip?.status !== 0 || !coordinates?.length || !coordinates.every(validPoint) || !Number.isFinite(trip.summary?.length) || !Number.isFinite(trip.summary?.time)) throw new Error('Chưa tìm được cung đường phù hợp. Hãy kiểm tra lại điểm đi và điểm đến.');
  return { coordinates, distanceKm: trip.summary.length, durationSeconds: trip.summary.time, start, end, fetchedAt: Date.now() };
}
export function decodePolyline(shape) {
  let cursor = 0, lat = 0, lon = 0;
  const coordinates = [];
  function delta() {
    let result = 0, shift = 0, byte;
    do {
      if (cursor >= shape.length || shift > 30) throw new Error('Dữ liệu đường đi không hợp lệ.');
      byte = shape.charCodeAt(cursor++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Dữ liệu đường đi không hợp lệ.');
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
  while (cursor < shape.length) { lat += delta(); lon += delta(); coordinates.push([lon / 1e6, lat / 1e6]); }
  return coordinates;
}
export async function loadRoute(origin, destination, signal) {
  const key = `route:${mapServices.route}:${origin.trim().toLowerCase()}:${destination.trim().toLowerCase()}`;
  const saved = cached(key);
  if (saved?.coordinates?.length && saved.coordinates.every(validPoint)) return saved;
  const start = await geocode(origin, signal);
  const end = await geocode(destination, signal);
  const url = new URL(mapServices.route);
  url.searchParams.set('json', JSON.stringify(routeRequest(start.coordinates, end.coordinates)));
  const result = await request(url, { signal, headers: { 'X-Client-Id': 'ridemate-pka.onrender.com' } });
  return remember(key, parseRoute(result, start, end), 86400000);
}
// Coordinates are [longitude, latitude]; distances are approximate ground distances.
export function routePosition(point, coordinates) {
  const scaleX = 111320 * Math.cos(point[1] * Math.PI / 180), scaleY = 111320;
  let distance = Infinity, progress = 0, traversed = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i];
    const ax = (a[0] - point[0]) * scaleX, ay = (a[1] - point[1]) * scaleY;
    const dx = (b[0] - a[0]) * scaleX, dy = (b[1] - a[1]) * scaleY;
    const squared = dx * dx + dy * dy;
    const t = squared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / squared)) : 0;
    const current = Math.hypot(ax + t * dx, ay + t * dy);
    if (current < distance) { distance = current; progress = traversed + Math.sqrt(squared) * t; }
    traversed += Math.sqrt(squared);
  }
  return { distance, progress, total: traversed };
}
export function sampleRoute(coordinates, limit = 100) {
  if (coordinates.length <= limit) return coordinates;
  return Array.from({ length: limit }, (_, i) => coordinates[Math.round(i * (coordinates.length - 1) / (limit - 1))]);
}
export function placesQuery(coordinates) {
  // A few small searches are lighter than scanning a corridor hundreds of km long.
  // Results are still checked against every segment of the actual route below.
  const areas = sampleRoute(coordinates, 5).map(([lon, lat]) => {
    const dy = 2500 / 111320, dx = dy / Math.cos(lat * Math.PI / 180);
    const area = `(${(lat - dy).toFixed(5)},${(lon - dx).toFixed(5)},${(lat + dy).toFixed(5)},${(lon + dx).toFixed(5)})`;
    // Search each area once, then limit each category locally before returning it.
    return `nwr[~"^(amenity|highway|tourism)$"~"^(fuel|restaurant|cafe|fast_food|rest_area|services|hotel|guest_house|motel)$"]${area}->.near;nwr.near[amenity=fuel];out tags center 12;nwr.near[amenity~"^(restaurant|cafe|fast_food)$"];out tags center 12;(nwr.near[highway~"^(rest_area|services)$"];nwr.near[tourism~"^(hotel|guest_house|motel)$"];);out tags center 12;`;
  }).join('');
  return `[out:json][timeout:15];${areas}`;
}
export function selectPlaces(elements, coordinates) {
  const seen = new Set(), candidates = [];
  for (const item of elements || []) {
    const tags = item.tags || {};
    const type = tags.amenity === 'fuel' ? 'fuel' : ['restaurant', 'cafe', 'fast_food'].includes(tags.amenity) ? 'food' : ['rest_area', 'services'].includes(tags.highway) || ['hotel', 'guest_house', 'motel'].includes(tags.tourism) ? 'rest' : null;
    const point = [item.lon ?? item.center?.lon, item.lat ?? item.center?.lat];
    if (!type || !validPoint(point)) continue;
    const position = routePosition(point, coordinates);
    if (position.distance > 1500) continue;
    const name = tags['name:vi'] || tags.name || tags.brand || tags.operator || `${supportTypes[type].label} chưa có tên trên bản đồ`;
    const duplicate = `${type}:${name}:${point.map(n => n.toFixed(3)).join(',')}`;
    if (seen.has(duplicate)) continue;
    seen.add(duplicate);
    candidates.push({ id: `${item.type}/${item.id}`, name, type, coordinates: point, distanceMeters: position.distance, progressMeters: position.progress, totalMeters: position.total, address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(', '), hours: tags.opening_hours || '', source: `https://www.openstreetmap.org/${item.type}/${item.id}` });
  }
  const result = [];
  for (const type of Object.keys(supportTypes)) {
    const pool = candidates.filter(place => place.type === type);
    for (const fraction of [0.25, 0.5, 0.75]) {
      if (!pool.length) break;
      pool.sort((a, b) => Math.abs(a.progressMeters - fraction * a.totalMeters) + a.distanceMeters - (Math.abs(b.progressMeters - fraction * b.totalMeters) + b.distanceMeters));
      result.push(pool.shift());
    }
  }
  return result.sort((a, b) => a.progressMeters - b.progressMeters);
}
export async function loadPlaces(route, signal) {
  const query = placesQuery(route.coordinates);
  const key = `places:${mapServices.places}:${query}`;
  const saved = cached(key);
  if (Array.isArray(saved)) return saved;
  const response = await request(mapServices.places, { signal, method: 'POST', body: new URLSearchParams({ data: query }) });
  if (!Array.isArray(response.elements) || response.remark) throw new Error('Nguồn địa điểm chưa trả đủ dữ liệu. Bạn có thể thử lại hoặc tìm trên Google Maps.');
  return remember(key, selectPlaces(response.elements, route.coordinates), 6 * 3600000);
}
export function directionsUrl(origin, destination) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving', avoid: 'highways' })}`;
}
export function placeUrl(place) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${place.coordinates[1]},${place.coordinates[0]}` })}`;
}
