import { validPoint, supportTypes } from './places-data.js';

export function poiCategory(tags = {}) {
  if (tags.amenity === 'fuel') return 'fuel';
  if (['motorcycle_repair', 'car_repair', 'tyres'].includes(tags.shop) || (tags.shop === 'motorcycle' && tags['service:motorcycle:repair'] === 'yes')) return 'repair';
  if (['rest_area', 'services'].includes(tags.highway) || ['hotel', 'guest_house', 'motel'].includes(tags.tourism)) return 'rest';
  return null;
}

const text = (value, limit) => String(value || '').replace(/\0/g, '').trim().slice(0, limit);
export function poiRecord(element, containsPoint) {
  const category = poiCategory(element?.tags), coordinates = [element?.lon ?? element?.center?.lon, element?.lat ?? element?.center?.lat];
  if (!category || !['node', 'way', 'relation'].includes(element?.type) || !Number.isSafeInteger(element.id) || element.id <= 0 || !validPoint(coordinates) || !containsPoint(coordinates)) return null;
  const tags = element.tags;
  const name = [tags['name:vi'], tags.name, tags.brand, tags.operator].map(value => text(value, 300)).find(Boolean);
  return {
    osm_type: element.type, osm_id: element.id, category,
    name: name || `${supportTypes[category].label} chưa có tên trên bản đồ`,
    longitude: coordinates[0], latitude: coordinates[1],
    address: text([tags['addr:housenumber'], tags['addr:street'], tags['addr:city'] || tags['addr:province']].filter(Boolean).join(', '), 600),
    hours: text(tags.opening_hours, 500),
  };
}
