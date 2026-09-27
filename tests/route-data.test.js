import test from 'node:test';
import assert from 'node:assert/strict';
import { geocode, searchPlannedCandidates } from '../src/route-data.js';
test('English browser language cannot translate Vietnamese endpoint and saved-place results', async context => {
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    const name = url.searchParams.get('lang') === 'default' ? 'Hà Nội' : 'Hanoi';
    return { ok: true, json: async () => ({ features: [
      { properties: { name, osm_key: 'railway', osm_value: 'station', countrycode: 'VN' }, geometry: { coordinates: [105.84, 21.02] } },
      { properties: { name, osm_key: 'place', osm_value: 'city', countrycode: 'VN' }, geometry: { coordinates: [105.854041, 21.0283334] } },
    ] }) };
  });
  const city = await geocode('Hà Nội');
  assert.equal(city.label, 'Hà Nội');
  assert.deepEqual(city.coordinates, [105.854041, 21.0283334]);
  const candidates = await searchPlannedCandidates('Hà Nội', { end: city, coordinates: [[105, 21], [106, 22]] });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(place => place.name === 'Hà Nội'));
});
import { chooseLocation, routePosition, selectPlaces, placesQuery, directionsUrl, placeUrl, placeDirectionsUrl, simplifyRoute, placeSearchSegments } from '../src/route-data.js';
test('Geocoding preserves exact match instead of choosing a different city', () => {
  const feature = (name, osm_value, point = [105, 22]) => ({ properties: { name, osm_key: 'place', osm_value, countrycode: 'VN' }, geometry: { coordinates: point } });
  assert.equal(chooseLocation([feature('Hà Giang', 'state'), feature('Hà Tiên', 'city')], 'Hà Giang').properties.name, 'Hà Giang');
  assert.equal(chooseLocation([feature('Invalid', 'city', [NaN, 22])], 'Invalid'), undefined);
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

test('Province matches reject railway, buildings and other non-area features', () => {
  const feature = (osm_key, osm_value, name = 'Hà Nội') => ({ properties: { name, osm_key, osm_value, countrycode: 'VN' }, geometry: { coordinates: [105, 21] } });
  for (const [key, value] of [['railway', 'station'], ['building', 'yes'], ['tourism', 'hotel'], ['shop', 'city'], ['natural', 'water']]) {
    assert.equal(chooseLocation([feature(key, value)], 'Hà Nội'), undefined);
  }
  const boundary = feature('boundary', 'administrative', 'Thành phố Hà Nội');
  assert.equal(chooseLocation([feature('railway', 'station'), boundary], 'Hà Nội'), boundary);
  const island = feature('place', 'island', 'Cát Bà');
  assert.equal(chooseLocation([island], 'Cát Bà'), island);
  const cafe = feature('amenity', 'cafe', 'Cafe A');
  assert.equal(chooseLocation([cafe], 'Cafe A'), cafe);
});

test('Location search remains available when routing fails, without invented distance', async context => {
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.equal(url.searchParams.has('lon'), false);
    assert.equal(url.searchParams.has('lat'), false);
    return { ok: true, json: async () => ({ features: [{ properties: { name: 'Quán A', countrycode: 'VN', osm_type: 'N', osm_id: 1 }, geometry: { coordinates: [105, 21] } }] }) };
  });
  const result = await searchPlannedCandidates('Quán A', null);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].coordinates, [105, 21]);
  assert.equal(result[0].distanceMeters, null);
});

test('Old geocoding and route caches cannot preserve a wrong endpoint after the fix', async context => {
  const endpoint = 'https://photon.komoot.io/api/';
  const cached = data => ({ expires: Date.now() + 60000, data });
  const oldEntries = [
    [`geo:v3:${endpoint}:hà nội`, cached({ label: 'Wrong station', coordinates: [105.7, 21] })],
    ['osrm:v2:https://router.project-osrm.org/route/v1/driving:["Hà Nội","Hải Phòng",[]]', cached({ wrong: true })],
  ];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify(oldEntries), setItem() {} } });
  context.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  let requests = 0;
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input); requests++;
    if (url.hostname === 'photon.komoot.io') {
      const name = url.searchParams.get('q');
      return { ok: true, json: async () => ({ features: [{ properties: { name, countrycode: 'VN', osm_key: 'place', osm_value: 'city' }, geometry: { coordinates: name === 'Hà Nội' ? [105.85, 21.03] : [106.688, 20.844] } }] }) };
    }
    const coordinates = [[105.85, 21.03], [106.688, 20.844]];
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1000, duration: 100, geometry: { coordinates }, legs: [{ distance: 1000, duration: 100, steps: [{ geometry: { coordinates } }] }] }] }) };
  });
  const { loadRoute } = await import('../src/route-data.js?cache-regression');
  const result = await loadRoute('Hà Nội', 'Hải Phòng');
  assert.equal(requests, 3);
  assert.deepEqual(result.start.coordinates, [105.85, 21.03]);
  assert.equal(result.wrong, undefined);
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
  assert.equal(place.searchParams.has('dir_action'), false);
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
    assert.match(placesQuery(segment), /out body center;/);
  }
});
test('Food and drinks are separate; only actual repair shops match the repair category', () => {
  const tags = [{ amenity: 'restaurant' }, { amenity: 'cafe' }, { amenity: 'ice_cream' }, { shop: 'motorcycle_repair' }, { shop: 'motorcycle', 'service:motorcycle:repair': 'yes' }, { shop: 'motorcycle' }];
  const elements = tags.map((tags, id) => ({ type: 'node', id, lon: 105, lat: 21, tags: { ...tags, name: `Place ${id}` } }));
  const places = selectPlaces(elements, [[105, 20], [105, 22]]);
  assert.equal(places.filter(p => p.type === 'food').length, 1);
  assert.equal(places.filter(p => p.type === 'drink').length, 2);
  assert.equal(places.filter(p => p.type === 'repair').length, 2);
  assert.ok(!places.some(p => p.id === 'node/5'));
  const query = placesQuery([[105, 20], [105, 22]]);
  assert.match(query, /motorcycle_repair/);
  // Body is required to include node coordinates, while center supplies way/relation coordinates.
  assert.match(query, /out body center;/);
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
