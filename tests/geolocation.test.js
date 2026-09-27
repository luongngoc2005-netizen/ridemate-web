import test from 'node:test';
import assert from 'node:assert/strict';
import { requestLocation, locationPoint, locationError } from '../src/geolocation.js';

const position = { coords: { longitude: 105.8, latitude: 21, accuracy: 12 }, timestamp: 123 };
function fakeGeo() {
  const state = { cleared: [] };
  state.getCurrentPosition = (success, error) => { state.success = success; state.error = error; };
  state.watchPosition = (success, error) => { state.success = success; state.error = error; return 0; };
  state.clearWatch = id => state.cleared.push(id);
  return state;
}
test('Device positions retain longitude/latitude order and accuracy', () => {
  assert.deepEqual(locationPoint(position), { coordinates: [105.8, 21], accuracy: 12, timestamp: 123 });
  assert.throws(() => locationPoint({ coords: { longitude: 105, latitude: 91, accuracy: 2 } }));
  assert.throws(() => locationPoint({ coords: { longitude: 105, latitude: 21, accuracy: -1 } }));
});
test('Stopping a watch clears even watch ID zero and ignores late updates', () => {
  const geo = fakeGeo(), updates = [];
  const stop = requestLocation({ geolocation: geo, secure: true, watch: true, onPosition: p => updates.push(p), onError: assert.fail });
  geo.success(position); stop(); stop(); geo.success(position); geo.error({ code: 3 });
  assert.equal(updates.length, 1);
  assert.deepEqual(geo.cleared, [0]);
});
test('A cancelled one-shot cannot update an unmounted map', () => {
  const geo = fakeGeo();
  const stop = requestLocation({ geolocation: geo, secure: true, onPosition: assert.fail, onError: assert.fail });
  stop(); geo.success(position); geo.error({ code: 1 });
  assert.deepEqual(geo.cleared, []);
});
test('A transient failure allows watch recovery; denial stops it', () => {
  const geo = fakeGeo(), errors = [], updates = [];
  requestLocation({ geolocation: geo, secure: true, watch: true, onPosition: p => updates.push(p), onError: e => errors.push(e) });
  geo.error({ code: 3 }); geo.success(position); geo.error({ code: 1 }); geo.success(position);
  assert.equal(updates.length, 1);
  assert.deepEqual(errors, [locationError({ code: 3 }), locationError({ code: 1 })]);
  assert.deepEqual(geo.cleared, [0]);
});
test('An insecure context does not request permission or a location', () => {
  let message;
  requestLocation({ geolocation: { getCurrentPosition: assert.fail }, secure: false, onPosition: assert.fail, onError: e => { message = e; } });
  assert.match(message, /HTTPS/);
});
