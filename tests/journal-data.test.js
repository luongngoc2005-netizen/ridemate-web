import test from 'node:test';
import assert from 'node:assert/strict';
import { annualStats, placeNames, validEntry } from '../src/journal-data.js';
test('Annual achievements separate years and deduplicate visited places', () => {
  const entries = [{date:'2025-12-31',km:100,places:['Hà Giang']},{date:'2026-01-01',km:120.5,places:['Hà Giang','Lũng Cú']},{date:'2026-06-01',km:200,places:[' hà giang ', 'Mã Pí Lèng']}];
  assert.deepEqual(annualStats(entries,2026),{trips:2,km:320.5,places:3});
  assert.deepEqual(annualStats(entries,2024),{trips:0,km:0,places:0});
  assert.deepEqual(placeNames(' Hà Giang\nhà giang\n\nLũng Cú'),['hà giang','Lũng Cú']);
});
test('Journal rejects missing title, distance and negative distance', () => {
  const value = {title:'Trip',date:'2026-01-01',km:'0'};
  assert.equal(validEntry(value),true);
  for (const change of [{title:' '},{km:''},{km:-1},{km:Infinity},{date:'invalid'}]) assert.equal(validEntry({...value,...change}),false);
});
