import { validPoint } from './places-data.js';

// The key here is the existing public/publishable key, never a service-role key.
// Missing migration/data is cached briefly to allow a gradual rollout.
const unavailableUntil = new Map();
export async function fetchNearbyPois(config, point, signal, { fetchImpl = fetch, now = Date.now } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!config?.url || !config?.key || unavailableUntil.get(config.url) > now()) return null;
  if (!validPoint(point)) throw new Error('Vị trí tìm địa điểm không hợp lệ.');
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 4000);
  try {
    const headers = { apikey: config.key, 'Content-Type': 'application/json' };
    // Legacy anon keys are JWTs; new publishable keys are not bearer tokens.
    if (config.key.startsWith('eyJ')) headers.Authorization = `Bearer ${config.key}`;
    const response = await fetchImpl(`${config.url.replace(/\/$/, '')}/rest/v1/rpc/nearby_pois`, {
      method: 'POST', headers, body: JSON.stringify({ lon: point[0], lat: point[1], radius_m: 2000 }), signal: controller.signal,
    });
    controller.signal.throwIfAborted();
    if (response.status === 404) { unavailableUntil.set(config.url, now() + 300000); return null; }
    if (!response.ok) throw new Error('Chưa kết nối được dữ liệu địa điểm. Bạn có thể thử lại hoặc tìm trên Google Maps.');
    const data = await response.json();
    controller.signal.throwIfAborted();
    if (data?.ready === false) { unavailableUntil.set(config.url, now() + 300000); return null; }
    if (data?.ready !== true || !Array.isArray(data.places) || data.places.length > 900 || typeof data.complete !== 'boolean') throw new Error('Dữ liệu địa điểm chưa đầy đủ. Vui lòng thử lại.');
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
