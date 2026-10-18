import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { datasetSql, editorSql } from '../scripts/prepare-poi.js';
import { poiRecord, poiCategory } from '../src/poi-data.js';

test('OSM import classification rejects foreign/invalid points and keeps documented repair services', () => {
  assert.equal(poiCategory({ shop: 'motorcycle' }), null);
  assert.equal(poiCategory({ shop: 'motorcycle', 'service:motorcycle:repair': 'yes' }), 'repair');
  assert.equal(poiRecord({ type: 'node', id: 1, lon: 105, lat: 21, tags: { amenity: 'fuel' } }, () => false), null);
  assert.equal(poiRecord({ type: 'node', id: NaN, lon: 105, lat: 21, tags: { amenity: 'fuel' } }, () => true), null);
  const record = poiRecord({ type: 'way', id: 2, center: { lon: 105, lat: 21 }, tags: { tourism: 'hotel', 'name:vi': 'Nhà nghỉ', name: 'Hotel' } }, () => true);
  assert.equal(record.name, 'Nhà nghỉ'); assert.equal(record.category, 'rest');
});

test('PostGIS searches real distances and enforces read-only guest access, bounded results and atomic publication', async () => {
  const db = new PGlite({ extensions: { postgis } });
  try {
    await db.exec('create role anon nologin; create role authenticated nologin;');
    const migration = await readFile(new URL('../supabase/migrations/202610170001_osm_pois.sql', import.meta.url), 'utf8') + '\n' + await readFile(new URL('../supabase/migrations/202610180001_food_drink_pois.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const search = async (lon = 105, lat = 21, radius = 1500) => (await db.query('select public.nearby_pois($1, $2, $3) as data', [lon, lat, radius])).rows[0].data;
    await db.exec('set role anon'); assert.deepEqual(await search(), { ready: false });
    await assert.rejects(db.query('select * from public.osm_pois'), /permission denied/);
    await assert.rejects(db.query("insert into public.poi_imports values ('bad', 'x', 'x', 1, true, now())"), /permission denied/);
    await assert.rejects(search(105, 21, 5000), /Invalid nearby/);
    await assert.rejects(search(NaN), /Invalid nearby/);
    await db.exec('reset role');
    const id = 'a'.repeat(24), source = { sourceUrl: 'https://download.geofabrik.de/asia/vietnam-latest.osm.pbf', sourceDate: '2026-10-17' };
    const row = (category, osm_id, latitude = 21.001) => ({ osm_type: 'node', osm_id, category, name: "O'Brien'); drop table public.osm_pois; --", longitude: 105, latitude, address: 'Đường A\\B', hours: '24/7' });
    const sql = datasetSql([row('fuel', 1), row('rest', 2), row('repair', 3), row('fuel', 4, 22)], source, id);
    await db.exec(sql);
    await db.exec('set role anon');
    const nearby = await search();
    assert.equal(nearby.ready, true); assert.equal(nearby.complete, true);
    assert.deepEqual(nearby.places.map(p => p.id).sort(), [1, 2, 3]);
    assert.equal(nearby.places[0].name, row('fuel', 1).name);
    assert.equal(nearby.places[0].address, 'Đường A\\B');
    assert.deepEqual((await search(105, 23)).places, []);
    await db.exec('reset role');
    await db.exec(migration); await db.exec(sql);
    assert.equal((await db.query('select count(*) as count from public.osm_pois')).rows[0].count, 4);
    const staged = editorSql(Array.from({ length: 12 }, (_, i) => ({ ...row('fuel', 100 + i), name: 'Xăng nghỉ sửa 🛵 '.repeat(8) })), source, 'c'.repeat(24), migration, 1200);
    assert.ok(staged.parts.length > 1);
    assert.ok(staged.parts.every(sql => Buffer.byteLength(sql, 'utf8') <= 1200));
    await db.exec(staged.setup);
    await db.exec(staged.parts[0]);
    await assert.rejects(db.exec(staged.activate), /Incomplete POI snapshot/); await db.exec('rollback');
    assert.equal((await search()).dataset, id);
    for (const part of staged.parts) { await db.exec(part); await db.exec(part); }
    await db.exec(staged.activate);
    assert.equal((await search()).dataset, 'c'.repeat(24));
    assert.equal((await db.query("select count(*) as count from public.osm_pois where dataset_id = $1", ['c'.repeat(24)])).rows[0].count, 12);
    await db.query('update public.poi_catalog set dataset_id = $1', [id]);
    // An unfinished snapshot is invisible until the final transaction switches it.
    await db.exec("insert into public.poi_imports(id, source_url, source_date, expected_count) values ('pending', 'osm', 'today', 3);");
    assert.equal((await search()).dataset, id);
    await db.exec(`insert into public.osm_pois(dataset_id, osm_type, osm_id, category, name, longitude, latitude)
      select '${id}', 'node', 1000 + n, 'fuel', 'Fuel ' || n, 105, 21.001 from generate_series(1, 301) n;`);
    const dense = await search(); assert.equal(dense.complete, false);
    assert.equal(dense.places.filter(p => p.category === 'fuel').length, 300);
    await db.exec('set role authenticated'); assert.equal((await search()).ready, true);
    await assert.rejects(db.query("update public.poi_catalog set dataset_id = 'pending'"), /permission denied/);
    await db.exec('reset role');
    const broken = datasetSql([row('fuel', 1)], source, 'b'.repeat(24)).replace(') <> 1 then', ') <> 2 then');
    await assert.rejects(db.exec(broken), /Incomplete POI snapshot/); await db.exec('rollback');
    assert.equal((await search()).dataset, id);
  } finally { await db.close(); }
});
