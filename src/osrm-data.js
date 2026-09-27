export const dayColors = ['#126745', '#ed7434', '#7257b5', '#247caf', '#b14b74'];
export const dayColor = day => dayColors[Math.max(0, (day || 1) - 1) % dayColors.length];
const valid = p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

export function itineraryStops(trip) {
  return (trip.itinerary || []).flatMap((day, index) => day.places.map(place => ({ ...place, label: place.name, dayNumber: index + 1, dayId: day.id })));
}
export function routePoints(start, end, stops = []) {
  const points = [{ ...start, dayNumber: stops[0]?.dayNumber || 1 }];
  for (const stop of stops) {
    if (!valid(stop.coordinates)) continue;
    if (points.at(-1).coordinates.slice(0, 2).every((n, i) => n === stop.coordinates[i])) continue;
    points.push(stop);
  }
  if (!points.at(-1).coordinates.slice(0, 2).every((n, i) => n === end.coordinates[i]) || points.length === 1) points.push({ ...end, dayNumber: points.at(-1).dayNumber });
  return points;
}
export function osrmUrl(endpoint, points, alternatives = false) {
  if (points.length < 2 || points.some(p => !valid(p.coordinates))) throw new Error('Cần ít nhất hai vị trí hợp lệ để tìm tuyến.');
  const url = new URL(`${endpoint.replace(/\/$/, '')}/${points.map(p => p.coordinates.slice(0, 2).join(',')).join(';')}`);
  url.search = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' });
  if (alternatives) url.searchParams.set('alternatives', 'true');
  return url;
}
export function parseOsrm(result, points) {
  const route = result.routes?.[0];
  if (result.code !== 'Ok' || !route || !Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0 || route.geometry?.coordinates?.length < 2 || !route.geometry?.coordinates?.every(valid) || route.legs?.length !== points.length - 1) throw new Error('OSRM chưa tìm được tuyến qua các điểm đã chọn. Hãy kiểm tra vị trí các điểm hoặc thử lại.');
  const legs = route.legs.map((leg, i) => {
    const coordinates = leg.steps?.flatMap(step => step.geometry?.coordinates || []) || [];
    if (coordinates.length < 2 || !coordinates.every(valid) || !Number.isFinite(leg.distance) || !Number.isFinite(leg.duration)) throw new Error('OSRM trả về chặng đường không đầy đủ.');
    return { coordinates, distanceKm: leg.distance / 1000, durationSeconds: leg.duration, start: points[i], end: points[i + 1], dayNumber: points[i + 1].dayNumber || 1 };
  });
  return { coordinates: route.geometry.coordinates, distanceKm: route.distance / 1000, durationSeconds: route.duration, legs, points, start: points[0], end: points.at(-1), provider: 'OSRM', mode: 'driving', fetchedAt: Date.now() };
}
export function routeGeoJSON(route) {
  return { type: 'FeatureCollection', features: (route?.legs || (route ? [{ coordinates: route.coordinates, dayNumber: 1 }] : [])).map((leg, index) => ({ type: 'Feature', properties: { index, day: leg.dayNumber, color: dayColor(leg.dayNumber) }, geometry: { type: 'LineString', coordinates: leg.coordinates } })) };
}
export function accuracyGeoJSON(position) {
  if (!position) return { type: 'FeatureCollection', features: [] };
  const [lon, lat] = position.coordinates, radius = position.accuracy / 6371008.8, phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180;
  const ring = Array.from({ length: 65 }, (_, i) => {
    const angle = (i % 64) * 2 * Math.PI / 64;
    const p = Math.asin(Math.sin(phi) * Math.cos(radius) + Math.cos(phi) * Math.sin(radius) * Math.cos(angle));
    const l = lambda + Math.atan2(Math.sin(angle) * Math.sin(radius) * Math.cos(phi), Math.cos(radius) - Math.sin(phi) * Math.sin(p));
    return [l * 180 / Math.PI, p * 180 / Math.PI];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
