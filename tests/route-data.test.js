import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseLocation, routeRequest, decodePolyline, parseRoute, routePosition, selectPlaces, placesQuery, directionsUrl, placeUrl } from '../src/route-data.js';
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
test('Support places are near route segments, deduplicated and limited to 3 per type', () => {
  const route = [[105, 20], [105, 22]];
  const close = routePosition([105.001, 21], route);
  assert.ok(close.distance < 150);
  assert.ok(close.progress > 100000);
  const elements = Array.from({ length: 8 }, (_, i) => ({ type: 'node', id: i, lon: 105.001, lat: 20.1 + i / 5, tags: { amenity: 'fuel', name: `Fuel ${i}` } }));
  elements.push({ type: 'node', id: 99, lon: 108, lat: 21, tags: { amenity: 'fuel', name: 'Far away' } });
  elements.push({ type: 'way', id: 100, center: { lon: 105, lat: 21 }, tags: { amenity: 'restaurant', name: '<img src=x onerror=alert(1)>' } });
  elements.push({ type: 'node', id: 101, lon: 105, lat: 21.2, tags: { tourism: 'hotel', name: 'Rest' } });
  const result = selectPlaces(elements, route);
  assert.equal(result.filter(p => p.type === 'fuel').length, 3);
  assert.ok(!result.some(p => p.name === 'Far away'));
  assert.equal(result.filter(p => p.type === 'food').length, 1);
  assert.equal(result.filter(p => p.type === 'rest').length, 1);
  assert.equal(selectPlaces([elements[0], elements[0]], route).length, 1);
  assert.match(placesQuery(route), /19\.97754,104\./);
});
test('Google Maps links encode Vietnamese addresses and coordinates safely', () => {
  const url = new URL(directionsUrl('Hà Nội & hồ', 'Hà Giang'));
  assert.equal(url.searchParams.get('origin'), 'Hà Nội & hồ');
  assert.equal(url.searchParams.get('avoid'), 'highways');
  assert.equal(new URL(placeUrl({ coordinates: [105, 21] })).searchParams.get('query'), '21,105');
});
