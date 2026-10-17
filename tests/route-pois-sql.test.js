import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { datasetSql } from '../scripts/prepare-poi.js';
import { selectPlaces } from '../src/places-data.js';
import { fetchRoutePois } from '../src/poi-client.js';

test('PostGIS route RPC follows bends and samples the beginning, middle and end rather than only a dense starting area', async () => {
  const db = new PGlite({ extensions: { postgis } });
  try {
    await db.exec('create role anon nologin; create role authenticated nologin;');
    for (const file of ['202610170001_osm_pois.sql', '202610170002_route_pois.sql']) await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    const line = [[106, 20.8], [106, 21.8]];
    const rpc = async (coordinates, category = 'fuel') => (await db.query('select public.route_pois($1::jsonb, $2, 1700) as data', [JSON.stringify({ type: 'LineString', coordinates }), category])).rows[0].data;
    assert.equal((await rpc(line)).ready, false);
    const record = (id, lat, lon = 106, category = 'fuel') => ({ osm_type: 'node', osm_id: id, category, name: `POI ${id}`, longitude: lon, latitude: lat, address: '', hours: '' });
    const records = Array.from({ length: 600 }, (_, i) => record(i + 1, 20.80001 + i * 0.000002));
    records.push(record(9001, 21.3), record(9002, 21.8), record(9003, 21.2, 106, 'rest'), record(9004, 20.9, 106.1), record(9005, 20.9, 106.2));
    await db.exec(datasetSql(records, { sourceUrl: 'test fixture', sourceDate: '2026-10-17' }, 'f'.repeat(24)));
    await db.exec('set role anon');
    const data = await rpc(line);
    assert.equal(data.places.length, 180); assert.equal(data.complete, false);
    assert.ok(data.places.some(p => p.id === 9001)); assert.ok(data.places.some(p => p.id === 9002));
    assert.ok(!data.places.some(p => [9003, 9004, 9005].includes(p.id)));
    const decoded = await fetchRoutePois({ url: 'https://sql-test.invalid', key: 'sb_publishable_test' }, line, 'fuel', undefined, { fetchImpl: async () => ({ ok: true, json: async () => data }) });
    const pins = selectPlaces(decoded.elements, line, 30);
    assert.equal(pins.length, 30); assert.equal(pins.at(-1).id, 'node/9002');
    assert.ok(pins.some(p => p.id === 'node/9001'));
    const bend = await rpc([[106, 20.8], [106.2, 20.8], [106.2, 21]]);
    assert.ok(bend.places.some(p => p.id === 9005));
    assert.ok(!bend.places.some(p => p.id === 9004));
    assert.equal((await rpc(line, 'rest')).places.length, 1);
    await assert.rejects(rpc(line, 'food'), /Invalid route POI search/);
    await assert.rejects(rpc([[106, 21], [106, 21]]), /Invalid route POI search/);
    await assert.rejects(db.query('select * from public.osm_pois'), /permission denied/);
    await assert.rejects(db.query("delete from public.poi_catalog"), /permission denied/);
  } finally { await db.close(); }
});
