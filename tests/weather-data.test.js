import test from 'node:test';
import assert from 'node:assert/strict';
import { tripWeatherDays, addDays, weatherLabel } from '../src/weather-data.js';
test('Weather dates preserve trip days, excluding past and beyond 16 day horizon', () => {
  const days = tripWeatherDays('2026-09-15', 30, '2026-09-16');
  assert.equal(days[0].status, 'past');
  assert.equal(days[1].status, 'forecast');
  assert.equal(days[16].status, 'forecast');
  assert.equal(days[17].status, 'future');
  assert.equal(days.length,30);
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.equal(tripWeatherDays('2027-01-01',1,'2026-09-16')[0].status,'future');
});
test('WMO codes distinguish missing data, zero and storms',()=>{
  assert.match(weatherLabel(0),/Trời quang/);
  assert.match(weatherLabel(95),/Dông/);
  assert.match(weatherLabel(null),/Chưa rõ/);
});
