import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseLocation, routeRequest, decodePolyline, parseRoute, routePosition, selectPlaces, placesQuery, directionsUrl, placeUrl, placeDirectionsUrl, simplifyRoute, placeSearchSegments } from '../src/route-data.js';
test('Geocoding preserves exact match instead of choosing a different city', () => {
  const feature = (name, osm_value, point = [105, 22]) => ({ properties: { name, osm_value, countrycode: 'VN' }, geometry: { coordinates: point } });
  assert.equal(chooseLocation([feature('Hà Giang', 'state'), feature('Hà Tiên', 'city')], 'Hà Giang').properties.name, 'Hà Giang');
  assert.equal(chooseLocation([feature('Invalid', 'city', [NaN, 22])], 'Invalid'), undefined);
});
test('Route request uses motorcycle with highway exclusion and parses real geometry', () => {
  const start = [105, 21], end = [105, 22];
  const payload = routeRequest(start, end);
  assert.equal(payload.costing, 'motorcycle');
  assert.equal(payload.costing_options.motorcycle.exclude_highways, true);
  assert.deepEqual(payload.locations[0], { lon: 105, lat: 21, type: 'break' });
  // Standard encoded example decoded at Valhalla's polyline6 precision.
  const decoded = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(decoded[0], [-12.02, 3.85]);
  assert.throws(() => decodePolyline('_'));
  const result = { trip: { status: 0, legs: [{ shape: { coordinates: [start, end] } }], summary: { length: 120, time: 8000 } } };
  assert.equal(parseRoute(result, {}, {}).distanceKm, 120);
  assert.throws(() => parseRoute({ trip: { status: 0, legs: [], summary: {} } }));
});
test('Support places preserve nearby results beyond the old three-place limit', () => {
  const route = [[105, 20], [105, 22]];
  const close = routePosition([105.001, 21], route);
  assert.ok(close.distance < 150);
  assert.ok(close.progress > 100000);
  const elements = Array.from({ length: 8 }, (_, i) => ({ type: 'node', id: i, lon: 105.001, lat: 20.1 + i / 5, tags: { amenity: 'fuel', name: `Fuel ${i}` } }));
  elements.push({ type: 'node', id: 99, lon: 108, lat: 21, tags: { amenity: 'fuel', name: 'Far away' } });
  elements.push({ type: 'way', id: 100, center: { lon: 105, lat: 21 }, tags: { amenity: 'restaurant', name: '<img src=x onerror=alert(1)>' } });
  elements.push({ type: 'node', id: 101, lon: 105, lat: 21.2, tags: { tourism: 'hotel', name: 'Rest' } });
  const result = selectPlaces(elements, route);
  assert.equal(result.filter(p => p.type === 'fuel').length, 8);
  assert.ok(!result.some(p => p.name === 'Far away'));
  assert.equal(result.filter(p => p.type === 'food').length, 1);
  assert.equal(result.filter(p => p.type === 'rest').length, 1);
  assert.equal(selectPlaces([elements[0], elements[0]], route).length, 1);
  assert.match(placesQuery(route), /around:1700,20\.00000,105\.00000,22\.00000,105\.00000/);
});
test('Google Maps links encode Vietnamese addresses and coordinates safely', () => {
  const url = new URL(directionsUrl('Hà Nội & hồ', 'Hà Giang'));
  assert.equal(url.searchParams.get('origin'), 'Hà Nội & hồ');
  assert.equal(url.searchParams.get('avoid'), 'highways');
  assert.equal(new URL(placeUrl({ coordinates: [105, 21] })).searchParams.get('query'), '21,105');
});
test('Known provinces never fall back to an unrelated result or a same-name shop', () => {
  const feature = (name, osm_key, osm_value) => ({ properties: { name, osm_key, osm_value, countrycode: 'VN' }, geometry: { coordinates: [105, 21] } });
  const shop = feature('Hà Nội', 'shop', 'supermarket');
  const city = feature('Thành phố Hà Nội', 'place', 'city');
  assert.equal(chooseLocation([shop, city], 'Hà Nội'), city);
  assert.equal(chooseLocation([shop, feature('Hà Tiên', 'place', 'city')], 'Hà Nội'), undefined);
});
test('Directions reuse the exact overview endpoints without latitude/longitude reversal', () => {
  const start = { coordinates: [105.8342, 21.0278], label: 'Hà Nội' };
  const end = { coordinates: [104.98, 22.82], label: 'Hà Giang' };
  const url = new URL(directionsUrl(start, end));
  assert.equal(url.searchParams.get('origin'), '21.0278,105.8342');
  assert.equal(url.searchParams.get('destination'), '22.82,104.98');
  const place = new URL(placeDirectionsUrl(end));
  assert.equal(place.pathname, '/maps/dir/');
  assert.equal(place.searchParams.get('destination'), '22.82,104.98');
  assert.equal(place.searchParams.has('origin'), false);
  assert.equal(place.searchParams.get('dir_action'), 'navigate');
});
test('Corridor searches preserve route bends and cover continuous segments end to end', () => {
  const points = [[105, 20], [105, 20.5], [106, 20.5], [106, 22]];
  const simplified = simplifyRoute(points);
  assert.deepEqual(simplified, points);
  const segments = placeSearchSegments(points);
  assert.deepEqual(segments[0][0], points[0]);
  assert.deepEqual(segments.at(-1).at(-1), points.at(-1));
  for (let i = 1; i < segments.length; i++) assert.deepEqual(segments[i][0], segments[i - 1].at(-1));
  for (const segment of segments) {
    assert.ok(segment.length <= 40);
    assert.ok(routePosition(segment[0], segment).total < 65000);
    assert.match(placesQuery(segment), /out tags center;/);
  }
});
test('Thirty markers per type are distributed over the route including both ends', () => {
  const points = [[105, 20], [105, 22]];
  const elements = Array.from({ length: 100 }, (_, index) => ({ type: 'node', id: index, lon: 105, lat: 20 + index / 99 * 2, tags: { amenity: 'fuel', name: `Station ${index}` } }));
  const places = selectPlaces(elements, points);
  assert.equal(places.length, 30);
  assert.equal(places[0].id, 'node/0');
  assert.equal(places.at(-1).id, 'node/99');
  assert.ok(places.every((place, index) => index === 0 || place.progressMeters >= places[index - 1].progressMeters));
});
