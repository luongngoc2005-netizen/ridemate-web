import { validPoint, routePosition } from './places-data.js';
export { supportTypes, markerTypes, validPoint, routePosition, selectPlaces } from './places-data.js';
import { createPlaceProcessor } from './places-processor.js';
import { parseOsrm, routePoints, itineraryStops } from './osrm-data.js';
import { provinces, travelDestinations } from './provinces.js';
import { domesticShapingPoints } from './domestic-routing.js';
import { tripOrigin } from './origin-data.js';
import { motorcycleUrl, highwaySteps, exclusionPoints, applyRidingEstimate } from './motorcycle-routing.js';
import { withRouteDeadline } from './route-deadline.js';
const env = import.meta.env || {};
export const mapServices = {
  geocode: env.VITE_GEOCODER_URL || 'https://photon.komoot.io/api/',
  route: env.VITE_MOTORCYCLE_ROUTER_URL || 'https://valhalla1.openstreetmap.de/route',
  places: env.VITE_PLACES_URL || 'https://overpass-api.de/api/interpreter',
  style: env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
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
export function chooseLocation(features, name = '') {
  const candidates = (features || []).filter(item => validPoint(item.geometry?.coordinates) && item.properties?.countrycode?.toUpperCase() === 'VN');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/^(tinh|thanh pho|tp\.?)\s+/, '').trim();
  const target = normalize(name);
  const exact = candidates.filter(item => normalize(item.properties.name || '') === target);
  // Require a geographic area, not just a matching name or OSM value.
  const area = exact.find(({ properties: p }) =>
    (p.osm_key === 'place' && ['city', 'town', 'state', 'province', 'island', 'village', 'district', 'county'].includes(p.osm_value)) ||
    (p.osm_key === 'boundary' && p.osm_value === 'administrative'));
  const known = [...provinces, ...travelDestinations].some(value => normalize(value) === target);
  if (known) return area;
  return area || exact.find(item => !['highway', 'shop', 'amenity'].includes(item.properties.osm_key)) || candidates[0];
}
export async function geocode(name, signal) {
  const { vietnam } = await import('./vietnam-guard.js');
  const key = `geo:v5:${mapServices.geocode}:${name.trim().toLowerCase()}`;
  const saved = cached(key);
  if (saved && vietnam.containsPoint(saved.coordinates)) return saved;
  const url = new URL(mapServices.geocode);
  // Without lang, Photon translates names using the browser's Accept-Language
  // (e.g. Hà Nội -> Hanoi), which breaks matching the Vietnamese select values.
  url.search = new URLSearchParams({ q: name.trim(), lang: 'default', limit: '15', bbox: '102,8,110,24' });
  const features = (await request(url, { signal })).features || [];
  const result = chooseLocation(features.filter(item => vietnam.containsPoint(item.geometry?.coordinates)), name);
  if (!result) throw new Error(`Không xác định được “${name}” tại Việt Nam. Hãy nhập tên địa điểm cụ thể hơn.`);
  const properties = result.properties;
  return remember(key, { coordinates: result.geometry.coordinates, label: [...new Set([properties.name, properties.city, properties.state].filter(Boolean))].join(', ') }, 7 * 86400000);
}
export async function resolveRoutePoint(value,signal) {
  if(typeof value==='string')return geocode(value,signal);
  const {vietnam}=await import('./vietnam-guard.js');
  if(!validPoint(value?.coordinates)||!vietnam.containsPoint(value.coordinates))throw new Error('Điểm xuất phát đã chọn không hợp lệ hoặc nằm ngoài Việt Nam. Hãy chọn lại vị trí.');
  return {coordinates:value.coordinates.slice(0,2),label:value.label||'Vị trí đã chọn'};
}
export async function loadRoute(origin, destination, signal, stops = []) {
  return withRouteDeadline(boundedSignal => calculateRoute(origin, destination, boundedSignal, stops), signal);
}
async function calculateRoute(origin, destination, signal, stops) {
  const { vietnam, isDomesticRoute, DOMESTIC_ROUTE_ERROR } = await import('./vietnam-guard.js');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const key = 'motorcycle:vn-v3:' + mapServices.route + ':' + JSON.stringify([origin, destination, stops]);
  const saved = cached(key);
  if (saved && isDomesticRoute(saved)) return saved;
  const [start, end] = await Promise.all([resolveRoutePoint(origin, signal), resolveRoutePoint(destination, signal)]);
  const points = routePoints(start, end, stops);
  const outside = points.find(point => !vietnam.containsPoint(point.coordinates));
  if (outside) throw new Error(`Vị trí “${outside.label || outside.name || 'đã chọn'}” nằm ngoài phạm vi Việt Nam. Hãy đổi hoặc xóa vị trí này trong lịch trình.`);
  async function motorcycleRequest(chunk, alternatives = false) {
    let exclusions = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await request(motorcycleUrl(mapServices.route, chunk, alternatives, exclusions), { signal });
      const routes = result.routes || [];
      const safe = routes.filter(route => !highwaySteps(route).length);
      if (safe.length) return { ...result, routes: safe };
      if (!routes.length) throw new Error('Chưa tìm được tuyến xe máy. Hãy kiểm tra lại điểm đi và điểm đến.');
      exclusions = [...new Map([...exclusions, ...exclusionPoints(routes)].map(p => [p.join(','), p])).values()].slice(0, 50);
    }
    throw new Error('Tuyến trả về vẫn có đoạn cao tốc nên chưa được hiển thị. Hãy chọn lại điểm hoặc thử lại sau.');
  }
  async function domesticPart(chunk, alternatives = false) {
    // Alternative searches can be much slower on long motorcycle routes.
    // Ask for one route first; only seek alternatives after border rejection.
    const result = await motorcycleRequest(chunk, alternatives);
    if (Array.isArray(result.waypoints) && result.waypoints.some(point => !vietnam.containsPoint(point.location))) throw new Error(DOMESTIC_ROUTE_ERROR);
    let boundaryRejected = false, parseError;
    for (const candidate of result.routes || []) {
      try {
        const parsed = parseOsrm({ ...result, routes: [candidate] }, chunk);
        if (isDomesticRoute(parsed)) return [parsed];
        boundaryRejected = true;
      } catch (error) { parseError = error; }
    }
    // OSRM alternatives are supported for two-point requests. A rejected
    // multi-stop route is retried leg by leg, preserving the itinerary order.
    if (boundaryRejected && chunk.length > 2) {
      const legs = [];
      for (let i = 1; i < chunk.length; i++) legs.push(...await domesticPart(chunk.slice(i - 1, i + 1)));
      return legs;
    }
    if (boundaryRejected) {
      const via = domesticShapingPoints(chunk[0], chunk.at(-1));
      if (via.length && via.every(point => vietnam.containsPoint(point.coordinates))) {
        const shaped = [chunk[0], ...via, chunk.at(-1)];
        const retry = await motorcycleRequest(shaped);
        if (!retry.waypoints?.some(point => !vietnam.containsPoint(point.location))) {
          for (const candidate of retry.routes || []) {
            try {
              const parsed = parseOsrm({ ...retry, routes: [candidate] }, shaped);
              if (isDomesticRoute(parsed)) return [{ ...parsed, routingVia: via.map(p => p.label) }];
            } catch { /* Never display an unverified fallback. */ }
          }
        }
      }
      if (!alternatives) return domesticPart(chunk, true);
      throw new Error(DOMESTIC_ROUTE_ERROR);
    }
    throw parseError || new Error('Dịch vụ bản đồ chưa tìm được tuyến qua các điểm đã chọn. Hãy kiểm tra vị trí các điểm hoặc thử lại.');
  }
  // Bound request size and preserve every stop, including shared chunk endpoints.
  const parts = [];
  for (let i = 0; i < points.length - 1; i += 24) {
    const chunk = points.slice(i, i + 25);
    parts.push(...await domesticPart(chunk));
  }
  const route = { ...parts[0], start, end, points: parts.flatMap((part, index) => index ? part.points.slice(1) : part.points),
    routingVia: parts.flatMap(part => part.routingVia || []),
    coordinates: parts.flatMap(p => p.coordinates), legs: parts.flatMap(p => p.legs),
    distanceKm: parts.reduce((n, p) => n + p.distanceKm, 0), durationSeconds: parts.reduce((n, p) => n + p.durationSeconds, 0),
    unresolved: stops.filter(p => !validPoint(p.coordinates)).map(p => ({ id: p.id, name: p.name })),
  };
  if (!isDomesticRoute(route)) throw new Error(DOMESTIC_ROUTE_ERROR);
  return remember(key, applyRidingEstimate(route), 86400000);
}
export async function loadTripRoute(trip, signal) {
  return loadRoute(tripOrigin(trip), trip.destination, signal, itineraryStops(trip));
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
// Completed segments remain cached; retry only fetches failed/expired segments.
const segmentCache = new Map();
export async function loadPlaces(route, signal, onProgress = () => {}) {
  const { vietnam } = await import('./vietnam-guard.js');
  const domesticPlaces = elements => elements.filter(item => vietnam.containsPoint([item.lon ?? item.center?.lon, item.lat ?? item.center?.lat]));
  const queries = placeSearchSegments(route.coordinates).map(placesQuery);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const processor = createPlaceProcessor(route.coordinates, signal);
  let places = [], completed = 0, failed = 0;
  const snapshot = () => ({ places, completed, failed, total: queries.length });
  try {
    const missing = [], cachedElements = [];
    for (const query of queries) {
      const saved = segmentCache.get(mapServices.places + ':' + query);
      if (saved?.expires > Date.now()) { cachedElements.push(saved.elements); completed++; }
      else missing.push(query);
    }
    if (completed) {
      places = await processor.add(domesticPlaces(cachedElements.flat()));
      onProgress(snapshot());
    }
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
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        failed++; onProgress(snapshot()); continue;
      }
      places = await processor.add(domesticPlaces(data.elements)); completed++;
      onProgress(snapshot());
    }
    return snapshot();
  } finally { processor.dispose(); }
}
export function pointText(point) {
  const coordinates = Array.isArray(point) ? point : point?.coordinates;
  if (validPoint(coordinates)) return `${coordinates[1]},${coordinates[0]}`;
  if (typeof point === 'string' && point.trim()) return point.trim();
  throw new Error('Vị trí chỉ đường không hợp lệ.');
}
export async function searchPlannedCandidates(name, route, signal) {
  if (!name.trim()) return [];
  const { vietnam } = await import('./vietnam-guard.js');
  const url = new URL(mapServices.geocode);
  const params = new URLSearchParams({ q: name.trim(), lang: 'default', limit: '8', bbox: '102,8,110,24' });
  if (validPoint(route?.end?.coordinates)) {
    params.set('lon', String(route.end.coordinates[0])); params.set('lat', String(route.end.coordinates[1]));
  }
  url.search = params;
  const hasRoute = route?.coordinates?.length >= 2 && route.coordinates.every(validPoint);
  const result = await request(url, { signal });
  return (result.features || []).filter(item => validPoint(item.geometry?.coordinates) && item.properties?.countrycode?.toUpperCase() === 'VN' && vietnam.containsPoint(item.geometry.coordinates)).map(item => {
    const properties = item.properties, coordinates = item.geometry.coordinates;
    return { id: `${properties.osm_type}/${properties.osm_id}`, name: properties.name || name.trim(), coordinates,
      source: `https://www.openstreetmap.org/${({N:'node',W:'way',R:'relation'})[properties.osm_type] || properties.osm_type}/${properties.osm_id}`,
      kind: properties.osm_key, subtype: properties.osm_value,
      address: [...new Set([properties.housenumber, properties.street, properties.city, properties.state].filter(Boolean))].join(', '),
      distanceMeters: hasRoute ? routePosition(coordinates, route.coordinates).distance : null };
  }).sort((a, b) => hasRoute ? a.distanceMeters - b.distanceMeters : 0);
}
export function directionsUrl(origin, destination) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: pointText(origin), destination: pointText(destination), travelmode: 'two-wheeler', avoid: 'highways' })}`;
}
export function placeDirectionsUrl(place) {
  // External Maps recalculates its own route; do not auto-start navigation.
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: pointText(place), travelmode: 'two-wheeler', avoid: 'highways' })}`;
}
export function placeUrl(place) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${place.coordinates[1]},${place.coordinates[0]}` })}`;
}
