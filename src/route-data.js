import { validPoint, routePosition, selectPlaces } from './places-data.js';
export { supportTypes, markerTypes, validPoint, routePosition, selectPlaces } from './places-data.js';
import { createPlaceProcessor } from './places-processor.js';
import { parseOsrm, routePoints, itineraryStops } from './osrm-data.js';
import { provinces, travelDestinations } from './provinces.js';
import {provinceLocation} from './province-locations.js';
import { domesticShapingPoints, domesticRequestChunks } from './domestic-routing.js';
import { tripOrigin } from './origin-data.js';
import { motorcycleUrl, highwaySteps, exclusionPoints, applyRidingEstimate } from './motorcycle-routing.js';
import { withRouteDeadline } from './route-deadline.js';
import { canLoadTripMap } from './trip-map-state.js';
import { fetchNearbyPois, fetchRoutePois } from './poi-client.js';
const env = import.meta.env || {};
export const mapServices = {
  geocode: env.VITE_GEOCODER_URL || 'https://photon.komoot.io/api/',
  route: env.VITE_MOTORCYCLE_ROUTER_URL || 'https://valhalla1.openstreetmap.de/route',
  places: env.VITE_PLACES_URL || 'https://overpass-api.de/api/interpreter',
  style: env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
  nearbyProvider: env.VITE_NEARBY_PROVIDER || 'auto',
  poi: env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY } : null,
};
const cache = new Map();
// Keep completed legs during this session so a failed final leg does not make
// a retry recompute every successful part of a cross-country route.
const routeLegCache = new Map();
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
async function request(url, { signal, timeout = 25000, ...options } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = response.status === 400 ? await response.json().catch(() => null) : null;
      if (detail?.code === 'DistanceExceeded') {
        const error = new Error('Tuyến vượt giới hạn chiều dài của dịch vụ bản đồ. Hãy chia thành các chặng ngắn hơn.');
        error.code = 'ROUTE_DISTANCE_EXCEEDED';
        throw error;
      }
      const error = new Error(response.status === 429 ? 'Dịch vụ bản đồ đang bận. Vui lòng thử lại sau.' : 'Dịch vụ bản đồ tạm thời chưa trả được dữ liệu.');
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (controller.signal.aborted) {
      const timeoutError = new Error('Dịch vụ bản đồ phản hồi chậm. Vui lòng thử lại sau.');
      timeoutError.code = 'MAP_REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
export function chooseLocation(features, name = '') {
  const candidates = (features || []).filter(item => validPoint(item.geometry?.coordinates) && item.properties?.countrycode?.toUpperCase() === 'VN');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/^(tinh|thanh pho|tp\.?)\s+/, '').trim();
  const target = normalize(name);
  const exact = candidates.filter(item => normalize(item.properties.name || '') === target);
  const province = provinces.some(value => normalize(value) === target);
  // Require a geographic area, not just a matching name or OSM value.
  const area = exact.find(({ properties: p }) =>
    (p.osm_key === 'place' && (province ? ['city', 'state', 'province', 'municipality'] : ['city', 'town', 'state', 'province', 'municipality', 'island', 'village', 'district', 'county']).includes(p.osm_value)) ||
    (p.osm_key === 'boundary' && p.osm_value === 'administrative' && (!province || ['4', '6'].includes(String(p.extra?.admin_level)))));
  const known = [...provinces, ...travelDestinations].some(value => normalize(value) === target);
  if (known) return area;
  return area || exact.find(item => !['highway', 'shop', 'amenity'].includes(item.properties.osm_key)) || candidates[0];
}
export async function geocode(name, signal) {
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const known=provinceLocation(name);
  // Bundled pins are source-backed and checked against the country geometry in tests.
  // Avoid loading the large boundary file merely to center a province's map.
  if(known)return {...known,representative:true};
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
export async function loadRoute(origin, destination, signal, stops = [], onProgress = () => {}) {
  return withRouteDeadline(boundedSignal => calculateRoute(origin, destination, boundedSignal, stops, onProgress), signal);
}
async function calculateRoute(origin, destination, signal, stops, onProgress) {
  const { vietnam, isDomesticRoute, DOMESTIC_ROUTE_ERROR } = await import('./vietnam-guard.js');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const key = 'motorcycle:vn-v4:' + mapServices.route + ':' + JSON.stringify([origin, destination, stops]);
  const saved = cached(key);
  if (saved && isDomesticRoute(saved)) return saved;
  onProgress('Đang xác định điểm đi–đến…');
  const [start, end] = await Promise.all([resolveRoutePoint(origin, signal), resolveRoutePoint(destination, signal)]);
  const points = routePoints(start, end, stops);
  const outside = points.find(point => !vietnam.containsPoint(point.coordinates));
  if (outside) throw new Error(`Vị trí “${outside.label || outside.name || 'đã chọn'}” nằm ngoài phạm vi Việt Nam. Hãy đổi hoặc xóa vị trí này trong lịch trình.`);
  async function motorcycleRequest(chunk, alternatives = false) {
    let exclusions = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await request(motorcycleUrl(mapServices.route, chunk, alternatives, exclusions), { signal, timeout: chunk.length > 2 ? 8000 : 25000 });
      const routes = result.routes || [];
      const safe = routes.filter(route => !highwaySteps(route).length);
      if (safe.length) return { ...result, routes: safe };
      if (!routes.length) throw new Error('Chưa tìm được tuyến xe máy. Hãy kiểm tra lại điểm đi và điểm đến.');
      exclusions = [...new Map([...exclusions, ...exclusionPoints(routes)].map(p => [p.join(','), p])).values()].slice(0, 50);
    }
    throw new Error('Tuyến trả về vẫn có đoạn cao tốc nên chưa được hiển thị. Hãy chọn lại điểm hoặc thử lại sau.');
  }
  async function domesticPart(chunk, alternatives = false, inWorker = false) {
    const legKey = mapServices.route + ':' + JSON.stringify(chunk);
    const savedLeg = routeLegCache.get(legKey);
    if (savedLeg?.expires > Date.now() && isDomesticRoute(savedLeg.route)) return [savedLeg.route];
    if (chunk.length > 2) {
      const savedParts = chunk.slice(1).map((point, index) => routeLegCache.get(mapServices.route + ':' + JSON.stringify([chunk[index], point])));
      if (savedParts.every(part => part?.expires > Date.now() && isDomesticRoute(part.route))) return savedParts.map(part => part.route);
    }
    // Avoid a cross-country search followed by another oversized corridor
    // request. Each short leg is still checked for highways and borders.
    let distance = 0;
    const shaped = [chunk[0]], via = [];
    for (let i = 1; i < chunk.length; i++) {
      const length = routePosition(chunk[i - 1].coordinates, [chunk[i - 1].coordinates, chunk[i].coordinates]).total;
      distance += length;
      const middle = length > 600000 ? domesticShapingPoints(chunk[i - 1], chunk[i]) : [];
      via.push(...middle); shaped.push(...middle, chunk[i]);
    }
    if (!inWorker && distance > 600000 && shaped.length > 2) {
      const parts = await domesticLegs(shaped, 2, true);
      if (via.length) parts[0] = { ...parts[0], routingVia: [...via.map(p => p.label), ...(parts[0].routingVia || [])] };
      return parts;
    }
    // Alternative searches can be much slower on long motorcycle routes.
    // Ask for one route first; only seek alternatives after border rejection.
    let result;
    try { result = await motorcycleRequest(chunk, alternatives); }
    catch (error) {
      if (['ROUTE_DISTANCE_EXCEEDED', 'MAP_REQUEST_TIMEOUT'].includes(error.code) && chunk.length > 2) return domesticLegs(chunk, inWorker ? 1 : 2);
      throw error;
    }
    if (Array.isArray(result.waypoints) && result.waypoints.some(point => !vietnam.containsPoint(point.location))) throw new Error(DOMESTIC_ROUTE_ERROR);
    let boundaryRejected = false, parseError;
    for (const candidate of result.routes || []) {
      try {
        const parsed = parseOsrm({ ...result, routes: [candidate] }, chunk);
        if (isDomesticRoute(parsed)) {
          routeLegCache.set(legKey, { route: parsed, expires: Date.now() + 86400000 });
          while (routeLegCache.size > 32) routeLegCache.delete(routeLegCache.keys().next().value);
          return [parsed];
        }
        boundaryRejected = true;
      } catch (error) { parseError = error; }
    }
    // OSRM alternatives are supported for two-point requests. A rejected
    // multi-stop route is retried leg by leg, preserving the itinerary order.
    if (boundaryRejected && chunk.length > 2) {
      return domesticLegs(chunk, inWorker ? 1 : 2);
    }
    if (boundaryRejected) {
      const via = domesticShapingPoints(chunk[0], chunk.at(-1));
      if (via.length && via.every(point => vietnam.containsPoint(point.coordinates))) {
        const shaped = [chunk[0], ...via, chunk.at(-1)];
        const parts = await domesticLegs(shaped, inWorker ? 1 : 2);
        parts[0] = { ...parts[0], routingVia: [...via.map(p => p.label), ...(parts[0].routingVia || [])] };
        return parts;
      }
      if (!alternatives) return domesticPart(chunk, true, inWorker);
      throw new Error(DOMESTIC_ROUTE_ERROR);
    }
    throw parseError || new Error('Dịch vụ bản đồ chưa tìm được tuyến qua các điểm đã chọn. Hãy kiểm tra vị trí các điểm hoặc thử lại.');
  }
  async function domesticLegs(points, concurrency = 2, batch = false) {
    const chunks = batch ? domesticRequestChunks(points) : points.slice(1).map((point, index) => [points[index], point]);
    const parts = new Array(chunks.length), total = points.length - 1;
    let next = 0, completed = 0;
    onProgress(`Đang tính tuyến theo chặng: 0/${total} chặng hoàn tất…`);
    // At most two requests in flight; preserve the user's stop order even
    // when later legs finish first. The outer deadline bounds all workers.
    await Promise.all(Array.from({ length: Math.min(concurrency, parts.length) }, async () => {
      while (next < parts.length) {
        signal.throwIfAborted();
        const index = next++;
        parts[index] = await domesticPart(chunks[index], false, true);
        completed += chunks[index].length - 1;
        if (!signal.aborted) onProgress(`Đang tính tuyến theo chặng: ${completed}/${total} chặng hoàn tất…`);
      }
    }));
    return parts.flat();
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
export async function loadTripRoute(trip, signal, onProgress) {
  if (!canLoadTripMap(trip)) return null;
  return loadRoute(tripOrigin(trip), trip.destination, signal, itineraryStops(trip), onProgress);
}
export function sampleRoute(coordinates, limit = 100) {
  if (coordinates.length <= limit) return coordinates;
  return Array.from({ length: limit }, (_, i) => coordinates[Math.round(i * (coordinates.length - 1) / (limit - 1))]);
}
export function placesQuery(coordinates, category) {
  if (coordinates.length < 2 || !coordinates.every(validPoint)) throw new Error('Tuyến không hợp lệ.');
  // Overpass linestring corridor, not isolated circles. The 200 m margin
  // accommodates route simplification; final filtering uses the full route.
  const line = coordinates.map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(',');
  const around = `(around:1700,${line})`;
  const filters = {
    fuel: ['[amenity=fuel]'], rest: ['[highway~"^(rest_area|services)$"]', '[tourism~"^(hotel|guest_house|motel)$"]'],
    repair: ['[shop~"^(motorcycle_repair|car_repair|tyres)$"]', '[shop=motorcycle]["service:motorcycle:repair"=yes]'],
    food: ['[amenity~"^(restaurant|fast_food|food_court)$"]'], drink: ['[amenity~"^(cafe|ice_cream)$"]'],
  };
  if (category) {
    if (!filters[category]) throw new Error('Loại địa điểm không hợp lệ.');
    return `[out:json][timeout:20];(${filters[category].map(filter => `nwr${filter}${around};`).join('')});out body center;`;
  }
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
const placesCooldown = new Map();
async function requestPlaces(query, signal, timeout = 25000) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const endpoint = mapServices.places;
  if (placesCooldown.get(endpoint) > Date.now()) {
    const error = new Error('Dịch vụ địa điểm đang giới hạn lượt tìm. Vui lòng chờ khoảng 30 giây hoặc tìm trên Google Maps.');
    error.code = 'PLACES_COOLDOWN';
    throw error;
  }
  try {
    return await request(endpoint, { signal, timeout, method: 'POST', body: new URLSearchParams({ data: query }) });
  } catch (error) {
    // Public Overpass asks clients to pause after these responses, rather than
    // sending the remaining corridor queries or repeated category searches.
    if ([406, 429].includes(error.status)) placesCooldown.set(endpoint, Date.now() + 30000);
    throw error;
  }
}
export async function loadPlaces(route, signal, onProgress = () => {}, { category } = {}) {
  const { vietnam } = await import('./vietnam-guard.js');
  const domesticPlaces = elements => elements.filter(item => vietnam.containsPoint([item.lon ?? item.center?.lon, item.lat ?? item.center?.lat]));
  const queries = placeSearchSegments(route.coordinates).map(segment => placesQuery(segment, category));
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
      places = (await processor.add(domesticPlaces(cachedElements.flat()))).filter(p => !category || p.type === category);
      onProgress(snapshot());
    }
    for (const query of missing) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const key = mapServices.places + ':' + query;
      let data = segmentCache.get(key);
      try {
        if (!data || data.expires <= Date.now()) {
          const response = await requestPlaces(query, signal);
          if (!Array.isArray(response.elements) || response.remark) throw new Error('Incomplete places response');
          data = { elements: response.elements, expires: Date.now() + 6 * 3600000 };
          segmentCache.set(key, data);
          while (segmentCache.size > 150) segmentCache.delete(segmentCache.keys().next().value);
        }
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if ([406, 429].includes(error.status) || error.code === 'PLACES_COOLDOWN') {
          failed = queries.length - completed; onProgress(snapshot()); break;
        }
        failed++; onProgress(snapshot()); continue;
      }
      places = (await processor.add(domesticPlaces(data.elements))).filter(p => !category || p.type === category); completed++;
      onProgress(snapshot());
    }
    return snapshot();
  } finally { processor.dispose(); }
}

const routePoiCache = new WeakMap();
export async function loadRoutePlaces(route, category, signal, onProgress = () => {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!['fuel', 'rest', 'repair', 'food', 'drink'].includes(category)) throw new Error('Loại địa điểm không hợp lệ.');
  if (!route?.coordinates || route.coordinates.length < 2 || !route.coordinates.every(validPoint)) throw new Error('Tuyến không hợp lệ.');
  if (!['auto', 'supabase', 'overpass'].includes(mapServices.nearbyProvider)) throw new Error('Cấu hình dịch vụ địa điểm không hợp lệ.');
  const key = JSON.stringify([mapServices.nearbyProvider, mapServices.poi?.url, mapServices.places, category]);
  const cache = routePoiCache.get(route) || new Map();
  routePoiCache.set(route, cache);
  const saved = cache.get(key);
  if (saved?.expires > Date.now()) { onProgress(saved.result); return saved.result; }
  const useDatabase = mapServices.nearbyProvider !== 'overpass' && ['fuel', 'rest', 'repair'].includes(category);
  const line = simplifyRoute(route.coordinates, 100);
  let data = null;
  // Large, intricate itineraries are queried in overlapping vertex chunks;
  // no uniformly sampled straight shortcuts are substituted for the route.
  if (useDatabase) {
    const elements = [];
    for (let i = 0; i < line.length - 1; i += 4999) {
      const part = await fetchRoutePois(mapServices.poi, line.slice(i, i + 5000), category, signal);
      if (!part) { data = null; break; }
      elements.push(...part.elements); data = { elements };
    }
    if (!data && mapServices.nearbyProvider === 'supabase') throw new Error('Dữ liệu điểm dọc tuyến chưa sẵn sàng. Vui lòng cập nhật truy vấn tuyến trên Supabase.');
  }
  let result;
  if (data) {
    const { vietnam } = await import('./vietnam-guard.js');
    const processor = createPlaceProcessor(route.coordinates, signal);
    try {
      const places = (await processor.add(data.elements.filter(p => vietnam.containsPoint([p.lon, p.lat])))).filter(p => p.type === category);
      result = { places, completed: 1, total: 1, failed: 0 };
      onProgress(result);
    } finally { processor.dispose(); }
  } else result = await loadPlaces(route, signal, onProgress, { category });
  if (!result.failed && !signal?.aborted) cache.set(key, { result, expires: Date.now() + 300000 });
  return result;
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

// Nearby searches use an explicit GPS snapshot, never the destination or route.
// Fetch all three categories together. Retain raw elements in RAM so each GPS
// snapshot gets its own distance/radius filtering, including points at the edge.
// A 2 km search fully covers a new 1.5 km circle after a move of up to 450 m.
const nearbyCache = [], nearbyPending = [];
const nearbyCovered = (entry, point, endpoint) => entry.endpoint === endpoint && routePosition(point, [entry.point, entry.point]).distance <= (entry.maxMove ?? 450);
function joinNearby(entry, signal) {
  entry.users++;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (callback, value) => {
      if (done) return;
      done = true; signal?.removeEventListener('abort', abort); entry.users--;
      // React cleans up the old category before subscribing to the new one.
      // Allow that handoff to reuse the same request, while still cancelling
      // when the user closes the search or leaves this screen.
      queueMicrotask(() => { if (!entry.users) entry.controller.abort(); });
      callback(value);
    };
    const abort = () => finish(reject, new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    entry.promise.then(data => finish(resolve, data), error => finish(reject, error));
    if (signal?.aborted) abort();
  });
}
export async function loadNearbyPlaces(point, category, signal, { refresh = false } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!validPoint(point)) throw new Error('Cần vị trí hiện tại để tìm quanh bạn.');
  if (!['fuel', 'rest', 'repair'].includes(category)) throw new Error('Loại địa điểm không hợp lệ.');
  const mode = mapServices.nearbyProvider;
  if (!['auto', 'supabase', 'overpass'].includes(mode)) throw new Error('Cấu hình dịch vụ địa điểm không hợp lệ.');
  const endpoint = JSON.stringify([mode, mapServices.poi?.url, mapServices.places]);
  const select = elements => selectPlaces(elements, [point, point], 30).filter(place => place.type === category).sort((a, b) => a.distanceMeters - b.distanceMeters);
  const saved = nearbyCache.find(entry => entry.expires > Date.now() && nearbyCovered(entry, point, endpoint));
  if (!refresh && saved) return select(saved.elements);
  const [lon, lat] = point;
  const around = `(around:2000,${lat},${lon})`;
  const query = `[out:json][timeout:8];(nwr[amenity=fuel]${around};nwr[tourism~"^(hotel|guest_house|motel)$"]${around};nwr[highway~"^(rest_area|services)$"]${around};nwr[shop~"^(motorcycle_repair|car_repair|tyres)$"]${around};nwr[shop=motorcycle]["service:motorcycle:repair"=yes]${around};);out body center;`;
  let pending = nearbyPending.find(entry => !entry.controller.signal.aborted && nearbyCovered(entry, point, endpoint));
  if (!pending) {
    pending = { point: point.slice(0, 2), endpoint, controller: new AbortController(), users: 0 };
    const entry = pending;
    entry.promise = (async () => {
      try {
        let data = mode === 'overpass' ? null : await fetchNearbyPois(mapServices.poi, entry.point, entry.controller.signal);
        if (!data && mode === 'supabase') throw Object.assign(new Error('Dữ liệu địa điểm chưa sẵn sàng. Bạn có thể tìm trên Google Maps.'), { code: 'POI_NOT_READY' });
        if (!data) data = { ...await requestPlaces(query, entry.controller.signal, 10000), complete: true };
        entry.controller.signal.throwIfAborted();
        if (!Array.isArray(data?.elements) || data.remark) {
          const error = new Error('Chưa tải đủ điểm gần bạn. Vui lòng thử lại.');
          error.code = 'INCOMPLETE_NEARBY';
          throw error;
        }
        for (let i = nearbyCache.length - 1; i >= 0; i--) {
          if (nearbyCache[i].expires <= Date.now() || nearbyCovered(nearbyCache[i], entry.point, endpoint)) nearbyCache.splice(i, 1);
        }
        entry.maxMove = data.complete ? 450 : 0;
        nearbyCache.unshift({ point: entry.point, endpoint, maxMove: entry.maxMove, elements: data.elements, expires: Date.now() + 300000 });
        if (nearbyCache.length > 30) nearbyCache.pop();
        return { elements: data.elements, maxMove: entry.maxMove };
      } finally {
        nearbyPending.splice(nearbyPending.indexOf(entry), 1);
      }
    })();
    nearbyPending.push(entry);
  }
  let data;
  try {
    data = await joinNearby(pending, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (['PLACES_COOLDOWN', 'INCOMPLETE_NEARBY'].includes(error.code)) throw error;
    if (error.code?.startsWith('POI_')) throw error;
    throw new Error(error.code === 'MAP_REQUEST_TIMEOUT'
      ? 'Dịch vụ tìm địa điểm phản hồi chậm. Bạn có thể thử lại hoặc tìm trên Google Maps.'
      : 'Chưa kết nối được dịch vụ tìm địa điểm. Bạn có thể thử lại hoặc tìm trên Google Maps.');
  }
  // Dense areas can hit the server cap. Their nearest results are usable at
  // the exact query center, but a moved subscriber needs its own query.
  if (routePosition(point, [pending.point, pending.point]).distance > data.maxMove) return loadNearbyPlaces(point, category, signal, { refresh });
  return select(data.elements);
}
