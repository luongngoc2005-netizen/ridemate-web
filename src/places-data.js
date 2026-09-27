export const supportTypes = {
  fuel: { label: 'Cây xăng', icon: 'fuel', color: '#c04f19' },
  food: { label: 'Quán ăn', icon: 'food', color: '#805bb0' },
  drink: { label: 'Đồ uống', icon: 'drink', color: '#2573a6' },
  repair: { label: 'Sửa xe', icon: 'repair', color: '#a54a35' },
  rest: { label: 'Điểm nghỉ / chỗ ở', icon: 'bed', color: '#14728c' },
};
export const markerTypes = { ...supportTypes, planned: { label: 'Điểm trong lịch trình', icon: 'flag', color: '#126745' } };
export function validPoint(point) {
  return Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
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
export function createPlaceAccumulator(coordinates, locate = routePosition) {
  const seen = new Set(), candidates = [], positions = new Map();
  function add(elements) {
    for (const item of elements || []) {
      const tags = item.tags || {};
      const type = tags.amenity === 'fuel' ? 'fuel' : ['cafe', 'ice_cream'].includes(tags.amenity) ? 'drink' : ['restaurant', 'fast_food', 'food_court'].includes(tags.amenity) ? 'food' : ['motorcycle_repair', 'car_repair', 'tyres'].includes(tags.shop) || (tags.shop === 'motorcycle' && tags['service:motorcycle:repair'] === 'yes') ? 'repair' : ['rest_area', 'services'].includes(tags.highway) || ['hotel', 'guest_house', 'motel'].includes(tags.tourism) ? 'rest' : null;
      const point = [item.lon ?? item.center?.lon, item.lat ?? item.center?.lat];
      if (!type || !validPoint(point)) continue;
      const key = point.join(',');
      let position = positions.get(key);
      if (!position) { position = locate(point, coordinates); positions.set(key, position); }
      if (position.distance > 1500) continue;
      const name = tags['name:vi'] || tags.name || tags.brand || tags.operator || `${supportTypes[type].label} chưa có tên trên bản đồ`;
      const duplicate = `${type}:${name}:${point.map(n => n.toFixed(3)).join(',')}`;
      if (seen.has(duplicate)) continue;
      seen.add(duplicate);
      candidates.push({ id: `${item.type}/${item.id}`, name, type, coordinates: point, distanceMeters: position.distance, progressMeters: position.progress, totalMeters: position.total, address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(', '), hours: tags.opening_hours || '', source: `https://www.openstreetmap.org/${item.type}/${item.id}` });
    }
  }
  return { add, snapshot: (limit = 30) => distributePlaces(candidates, limit) };
}
export function selectPlaces(elements, coordinates, limit = 30) {
  const accumulator = createPlaceAccumulator(coordinates);
  accumulator.add(elements);
  return accumulator.snapshot(limit);
}
function distributePlaces(candidates, limit) {
  const result = [];
  for (const type of Object.keys(supportTypes)) {
    const pool = candidates.filter(place => place.type === type);
    const count = Math.min(limit, pool.length);
    for (let index = 0; index < count; index++) {
      const fraction = count === 1 ? 0.5 : index / (count - 1);
      if (!pool.length) break;
      // Select one minimum in O(n), rather than sorting the full pool 30 times.
      let best = 0, score = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const current = Math.abs(pool[i].progressMeters - fraction * pool[i].totalMeters) + pool[i].distanceMeters;
        if (current < score) { best = i; score = current; }
      }
      result.push(pool.splice(best, 1)[0]);
    }
  }
  return result.sort((a, b) => a.progressMeters - b.progressMeters);
}
