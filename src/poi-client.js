import { validPoint } from './places-data.js';

// The key here is the existing public/publishable key, never a service-role key.
// Missing migration/data is cached briefly to allow a gradual rollout.
const unavailableUntil = new Map();
const available = (config, method, now) => config?.url && config?.key && !(unavailableUntil.get(config.url + '/' + method) > now());
export async function fetchNearbyPois(config, point, signal, { fetchImpl = fetch, now = Date.now } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!available(config, 'nearby_pois', now)) return null;
  if (!validPoint(point)) throw new Error('Vị trí tìm địa điểm không hợp lệ.');
  return fetchPoiRpc(config, 'nearby_pois', { lon: point[0], lat: point[1], radius_m: 2000 }, signal, { fetchImpl, now, timeout: 4000, maxPlaces: 900 });
}

export async function fetchRoutePois(config, coordinates, category, signal, { fetchImpl = fetch, now = Date.now } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!['fuel', 'rest', 'repair'].includes(category)) return null;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 5000 || !coordinates.every(validPoint)) throw new Error('Tuyến tìm địa điểm không hợp lệ.');
  if (!available(config, 'route_pois', now)) return null;
  return fetchPoiRpc(config, 'route_pois', { route_geojson: { type: 'LineString', coordinates }, category_name: category, radius_m: 1700 }, signal, { fetchImpl, now, timeout: 8000, maxPlaces: 180 });
}

async function fetchPoiRpc(config, method, body, signal, { fetchImpl, now, timeout, maxPlaces }) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const key = config?.url + '/' + method;
  if (!config?.url || !config?.key || unavailableUntil.get(key) > now()) return null;
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeout);
  try {
    const headers = { apikey: config.key, 'Content-Type': 'application/json' };
    // Legacy anon keys are JWTs; new publishable keys are not bearer tokens.
    if (config.key.startsWith('eyJ')) headers.Authorization = `Bearer ${config.key}`;
    const response = await fetchImpl(`${config.url.replace(/\/$/, '')}/rest/v1/rpc/${method}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
    });
    controller.signal.throwIfAborted();
    if (response.status === 404) { unavailableUntil.set(key, now() + 300000); return null; }
    if (!response.ok) throw new Error('Chưa kết nối được dữ liệu địa điểm. Bạn có thể thử lại hoặc tìm trên Google Maps.');
    const data = await response.json();
    controller.signal.throwIfAborted();
    if (data?.ready === false) { unavailableUntil.set(key, now() + 300000); return null; }
    if (data?.ready !== true || !Array.isArray(data.places) || data.places.length > maxPlaces || typeof data.complete !== 'boolean') throw new Error('Dữ liệu địa điểm chưa đầy đủ. Vui lòng thử lại.');
    const elements = data.places.map(place => {
      if (!['node', 'way', 'relation'].includes(place.type) || !Number.isSafeInteger(place.id) || place.id <= 0 || !validPoint([place.lon, place.lat]) || !['fuel', 'rest', 'repair'].includes(place.category) || typeof place.name !== 'string') throw new Error('Dữ liệu địa điểm chưa đầy đủ. Vui lòng thử lại.');
      const categoryTags = { fuel: { amenity: 'fuel' }, rest: { tourism: 'hotel' }, repair: { shop: 'motorcycle_repair' } };
      return { type: place.type, id: place.id, lon: place.lon, lat: place.lat, tags: {
        ...categoryTags[place.category], name: place.name,
        'addr:street': place.address || '', opening_hours: place.hours || '',
      } };
    });
    return { elements, complete: data.complete, dataset: data.dataset, sourceDate: data.sourceDate };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const message = controller.signal.aborted ? 'Dữ liệu địa điểm phản hồi chậm. Bạn có thể thử lại hoặc tìm trên Google Maps.'
      : error instanceof TypeError || error instanceof SyntaxError || !error.message
        ? 'Chưa kết nối được dữ liệu địa điểm. Bạn có thể thử lại hoặc tìm trên Google Maps.' : error.message;
    throw Object.assign(new Error(message), { code: 'POI_REQUEST_FAILED' });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
