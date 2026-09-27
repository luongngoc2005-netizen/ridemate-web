import { osrmUrl, parseOsrm, routePoints, itineraryStops } from './osrm-data.js';
import { provinces, travelDestinations } from './provinces.js';
const env = import.meta.env || {};
export const mapServices = {
  geocode: env.VITE_GEOCODER_URL || 'https://photon.komoot.io/api/',
  route: env.VITE_OSRM_URL || 'https://router.project-osrm.org/route/v1/driving',
  places: env.VITE_PLACES_URL || 'https://overpass-api.de/api/interpreter',
  style: env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
};
export const supportTypes = {
  fuel: { label: 'Cây xăng', icon: 'fuel', color: '#c04f19' },
  food: { label: 'Quán ăn', icon: 'food', color: '#805bb0' },
  drink: { label: 'Đồ uống', icon: 'drink', color: '#2573a6' },
  repair: { label: 'Sửa xe', icon: 'repair', color: '#a54a35' },
  rest: { label: 'Điểm nghỉ / chỗ ở', icon: 'bed', color: '#14728c' },
};
export const markerTypes = { ...supportTypes, planned: { label: 'Điểm trong lịch trình', icon: 'flag', color: '#126745' } };
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
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/^(tinh|thanh pho|tp\.?)\s+/, '').trim();
  const target = normalize(name);
  const exact = candidates.filter(item => normalize(item.properties.name || '') === target);
  // A street/shop with the same name must not win over the actual city/province.
  const area = exact.find(item => ['city', 'town', 'state', 'province', 'administrative', 'island', 'village', 'district'].includes(item.properties.osm_value));
  const known = [...provinces, ...travelDestinations].some(value => normalize(value) === target);
  return area || exact.find(item => !['highway', 'shop', 'amenity'].includes(item.properties.osm_key)) || (known ? undefined : candidates[0]);
}
export async function geocode(name, signal) {
  const key = `geo:v3:${mapServices.geocode}:${name.trim().toLowerCase()}`;
  const saved = cached(key);
  if (saved && validPoint(saved.coordinates)) return saved;
  const url = new URL(mapServices.geocode);
  // Without lang, Photon translates names using the browser's Accept-Language
  // (e.g. Hà Nội -> Hanoi), which breaks matching the Vietnamese select values.
  url.search = new URLSearchParams({ q: name.trim(), lang: 'default', limit: '15', bbox: '102,8,110,24' });
  const result = chooseLocation((await request(url, { signal })).features, name);
  if (!result) throw new Error(`Không xác định được “${name}” tại Việt Nam. Hãy nhập tên địa điểm cụ thể hơn.`);
  const properties = result.properties;
  return remember(key, { coordinates: result.geometry.coordinates, label: [...new Set([properties.name, properties.city, properties.state].filter(Boolean))].join(', ') }, 7 * 86400000);
}
export async function loadRoute(origin, destination, signal, stops = []) {
  const key = 'osrm:v1:' + mapServices.route + ':' + JSON.stringify([origin, destination, stops]);
  const saved = cached(key);
  if (saved) return saved;
  const start = await geocode(origin, signal), end = await geocode(destination, signal);
  const points = routePoints(start, end, stops);
  // Bound request size and preserve every stop, including shared chunk endpoints.
  const parts = [];
  for (let i = 0; i < points.length - 1; i += 24) {
    const chunk = points.slice(i, i + 25);
    parts.push(parseOsrm(await request(osrmUrl(mapServices.route, chunk), { signal }), chunk));
  }
  const route = { ...parts[0], start, end, points,
    coordinates: parts.flatMap(p => p.coordinates), legs: parts.flatMap(p => p.legs),
    distanceKm: parts.reduce((n, p) => n + p.distanceKm, 0), durationSeconds: parts.reduce((n, p) => n + p.durationSeconds, 0),
    unresolved: stops.filter(p => !validPoint(p.coordinates)).map(p => ({ id: p.id, name: p.name })),
  };
  return remember(key, route, 86400000);
}
export async function loadTripRoute(trip, signal) {
  return loadRoute(trip.origin, trip.destination, signal, itineraryStops(trip));
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
  if (coordinates.length < 2 || !coordinates.every(validPoint)) throw new Error('Tuyến không hợp lệ.');
  // Overpass linestring corridor, not isolated circles. The 200 m margin
  // accommodates route simplification; final filtering uses the full route.
  const line = coordinates.map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(',');
  const around = `(around:1700,${line})`;
  return `[out:json][timeout:20];(nwr[amenity~"^(fuel|restaurant|cafe|fast_food|food_court|ice_cream)$"]${around};nwr[highway~"^(rest_area|services)$"]${around};nwr[tourism~"^(hotel|guest_house|motel)$"]${around};nwr[shop~"^(motorcycle_repair|car_repair|tyres)$"]${around};nwr[shop=motorcycle]["service:motorcycle:repair"=yes]${around};);out body center;`;
}
export function simplifyRoute(coordinates, tolerance = 200) {
  if (coordinates.length <= 2) return coordinates;
  const keep = new Set([0, coordinates.length - 1]), stack = [[0, coordinates.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let furthest = -1, distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = routePosition(coordinates[i], [coordinates[first], coordinates[last]]).distance;
      if (d > distance) { distance = d; furthest = i; }
    }
    if (furthest >= 0) { keep.add(furthest); stack.push([first, furthest], [furthest, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(index => coordinates[index]);
}
export function placeSearchSegments(coordinates) {
  if (coordinates.length < 2 || !coordinates.every(validPoint)) throw new Error('Tuyến không hợp lệ.');
  const line = simplifyRoute(coordinates), chunks = [];
  let chunk = [line[0]], length = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const distance = routePosition(a, [a, b]).total;
    const parts = Math.max(1, Math.ceil(distance / 20000));
    for (let part = 1; part <= parts; part++) {
      const point = part === parts ? b : [a[0] + (b[0] - a[0]) * part / parts, a[1] + (b[1] - a[1]) * part / parts];
      chunk.push(point); length += distance / parts;
      if (length >= 40000 || chunk.length >= 40) { chunks.push(chunk); chunk = [point]; length = 0; }
    }
  }
  if (chunk.length > 1) chunks.push(chunk);
  return chunks;
}
export function selectPlaces(elements, coordinates, limit = 30) {
  const seen = new Set(), candidates = [];
  for (const item of elements || []) {
    const tags = item.tags || {};
    const type = tags.amenity === 'fuel' ? 'fuel' : ['cafe', 'ice_cream'].includes(tags.amenity) ? 'drink' : ['restaurant', 'fast_food', 'food_court'].includes(tags.amenity) ? 'food' : ['motorcycle_repair', 'car_repair', 'tyres'].includes(tags.shop) || (tags.shop === 'motorcycle' && tags['service:motorcycle:repair'] === 'yes') ? 'repair' : ['rest_area', 'services'].includes(tags.highway) || ['hotel', 'guest_house', 'motel'].includes(tags.tourism) ? 'rest' : null;
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
    const count = Math.min(limit, pool.length);
    for (let index = 0; index < count; index++) {
      const fraction = count === 1 ? 0.5 : index / (count - 1);
      if (!pool.length) break;
      pool.sort((a, b) => Math.abs(a.progressMeters - fraction * a.totalMeters) + a.distanceMeters - (Math.abs(b.progressMeters - fraction * b.totalMeters) + b.distanceMeters));
      result.push(pool.shift());
    }
  }
  return result.sort((a, b) => a.progressMeters - b.progressMeters);
}
// Completed segments remain cached; retry only fetches failed/expired segments.
const segmentCache = new Map();
export async function loadPlaces(route, signal, onProgress = () => {}) {
  const queries = placeSearchSegments(route.coordinates).map(placesQuery);
  const elements = []; let completed = 0, failed = 0;
  const snapshot = () => ({ places: selectPlaces(elements, route.coordinates), completed, failed, total: queries.length });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const missing = [];
  for (const query of queries) {
    const saved = segmentCache.get(mapServices.places + ':' + query);
    if (saved?.expires > Date.now()) { elements.push(...saved.elements); completed++; }
    else missing.push(query);
  }
  if (completed) onProgress(snapshot());
  for (const query of missing) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const key = mapServices.places + ':' + query;
    let data = segmentCache.get(key);
    try {
      if (!data || data.expires <= Date.now()) {
        const response = await request(mapServices.places, { signal, method: 'POST', body: new URLSearchParams({ data: query }) });
        if (!Array.isArray(response.elements) || response.remark) throw new Error('Incomplete places response');
        data = { elements: response.elements, expires: Date.now() + 6 * 3600000 };
        segmentCache.set(key, data);
        while (segmentCache.size > 150) segmentCache.delete(segmentCache.keys().next().value);
      }
      elements.push(...data.elements); completed++;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      failed++;
    }
    onProgress(snapshot());
  }
  return snapshot();
}
export function pointText(point) {
  const coordinates = Array.isArray(point) ? point : point?.coordinates;
  if (validPoint(coordinates)) return `${coordinates[1]},${coordinates[0]}`;
  if (typeof point === 'string' && point.trim()) return point.trim();
  throw new Error('Vị trí chỉ đường không hợp lệ.');
}
export async function searchPlannedCandidates(name, route, signal) {
  if (!name.trim()) return [];
  const url = new URL(mapServices.geocode);
  url.search = new URLSearchParams({ q: name.trim(), lang: 'default', limit: '8', bbox: '102,8,110,24', lon: String(route.end.coordinates[0]), lat: String(route.end.coordinates[1]) });
  const result = await request(url, { signal });
  return (result.features || []).filter(item => validPoint(item.geometry?.coordinates) && item.properties?.countrycode?.toUpperCase() === 'VN').map(item => {
    const properties = item.properties, coordinates = item.geometry.coordinates;
    return { id: `${properties.osm_type}/${properties.osm_id}`, name: properties.name || name.trim(), coordinates,
      address: [...new Set([properties.housenumber, properties.street, properties.city, properties.state].filter(Boolean))].join(', '),
      distanceMeters: routePosition(coordinates, route.coordinates).distance };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);
}
export function directionsUrl(origin, destination) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: pointText(origin), destination: pointText(destination), travelmode: 'driving', avoid: 'highways' })}`;
}
export function placeDirectionsUrl(place) {
  // Omit origin: Maps lets the rider choose their current/start location.
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: pointText(place), travelmode: 'driving', dir_action: 'navigate' })}`;
}
export function placeUrl(place) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${place.coordinates[1]},${place.coordinates[0]}` })}`;
}
