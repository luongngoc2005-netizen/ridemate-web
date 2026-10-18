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
    // Publish the old three-category snapshot before applying the upgrade.
    await db.exec("insert into public.poi_imports(id, source_url, source_date, expected_count, ready) values ('legacy', 'fixture', '2026-10-17', 1, true); insert into public.poi_catalog values (true, 'legacy');");
    const upgrade = await readFile(new URL('../supabase/migrations/202610180001_food_drink_pois.sql', import.meta.url), 'utf8');
    await db.exec(upgrade);
    assert.equal((await rpc(line)).ready, true);
    assert.deepEqual(await rpc(line, 'food'), { ready: false });
    assert.deepEqual(await rpc(line, 'drink'), { ready: false });
    const record = (id, lat, lon = 106, category = 'fuel') => ({ osm_type: 'node', osm_id: id, category, name: `POI ${id}`, longitude: lon, latitude: lat, address: '', hours: '' });
    const records = Array.from({ length: 600 }, (_, i) => record(i + 1, 20.80001 + i * 0.000002));
    records.push(record(9001, 21.3), record(9002, 21.8), record(9003, 21.2, 106, 'rest'), record(9004, 20.9, 106.1), record(9005, 20.9, 106.2));
    records.push(record(9100, 21, 106, 'food'), record(9101, 21.7, 106, 'food'), record(9200, 21.4, 106, 'drink'), record(9201, 21.4, 107, 'drink'));
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
    for (const [category, ids] of [['food', [9100, 9101]], ['drink', [9200]]]) {
      const response = await rpc(line, category);
      assert.deepEqual(response.places.map(p => p.id).sort(), ids);
      const decoded = await fetchRoutePois({ url: 'https://sql-food.invalid', key: 'sb_publishable_test' }, line, category, undefined, { fetchImpl: async () => ({ ok: true, json: async () => response }) });
      assert.deepEqual(selectPlaces(decoded.elements, line).map(p => p.type), ids.map(() => category));
    }
    await assert.rejects(rpc(line, 'planned'), /Invalid route POI search/);
    await assert.rejects(rpc([[106, 21], [106, 21]]), /Invalid route POI search/);
    await assert.rejects(db.query('select * from public.osm_pois'), /permission denied/);
    await assert.rejects(db.query("delete from public.poi_catalog"), /permission denied/);
    await db.exec('reset role');
    await db.exec(upgrade);
    assert.equal((await rpc(line, 'food')).places.length, 2);
  } finally { await db.close(); }
});
