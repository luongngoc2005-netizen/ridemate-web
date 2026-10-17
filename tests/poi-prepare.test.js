import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { preparePoi } from '../scripts/prepare-poi.js';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';

test('POI preparation produces reproducible SQL/CSV, rejects foreign data, and refuses incomplete snapshots', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ridemate-poi-'));
  t.after(async () => {
    // Delete only the exact temporary directory allocated by this test.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('ridemate-poi-'));
    await rm(directory, { recursive: true, force: true });
  });
  const input = join(directory, 'elements.jsonl');
  const node = (id, tags, lon = 105, lat = 21) => ({ type: 'node', id, tags, lon, lat });
  const rows = [node(1, { amenity: 'fuel', name: "Xăng O'Brien" }), node(2, { tourism: 'hotel', name: 'Nghỉ "A"' }),
    node(3, { shop: 'motorcycle_repair', name: 'Sửa xe' }), node(1, { amenity: 'fuel' }),
    node(4, { amenity: 'fuel' }, 102, 15), node(5, { amenity: 'fuel' }, null), node(6, { shop: 'motorcycle' })];
  await writeFile(join(directory, 'source.json'), JSON.stringify({ sourceUrl: 'test-fixture.osm', sourceDate: '2026-10-17', sourceMd5: 'fixture' }));
  await writeFile(input, rows.map(row => JSON.stringify(row)).join('\n'));
  const report = await preparePoi({ input, outputDir: directory });
  assert.deepEqual(report.counts, { fuel: 1, rest: 1, repair: 1 });
  assert.equal(report.total, 3);
  assert.deepEqual(report.rejected, { invalidOrOutsideVietnam: 3, duplicates: 1 });
  const sql = await readFile(join(directory, 'setup-and-import.sql'), 'utf8');
  assert.match(sql, /Xăng O''Brien/);
  assert.match(await readFile(join(directory, 'pois.csv'), 'utf8'), /Nghỉ ""A""/);
  const repeated = await preparePoi({ input, outputDir: directory });
  assert.equal(repeated.datasetId, report.datasetId);
  assert.equal(await readFile(join(directory, 'setup-and-import.sql'), 'utf8'), sql);
  const db = new PGlite({ extensions: { postgis } });
  try {
    await db.exec('create role anon nologin; create role authenticated nologin;');
    await db.exec(await readFile(join(directory, '01-setup.sql'), 'utf8'));
    const activate = await readFile(join(directory, '03-activate.sql'), 'utf8');
    await assert.rejects(db.exec(activate), /Incomplete POI snapshot/);
    await db.exec('rollback');
    const ready = async () => (await db.query("select public.nearby_pois(105, 21, 1500)->>'ready' as ready")).rows[0].ready;
    assert.equal(await ready(), 'false');
    // Import the actual generated CSV, omitting the generated geography column.
    const csv = await readFile(join(directory, 'pois.csv'), 'utf8');
    await db.query("copy public.osm_pois(dataset_id, osm_type, osm_id, category, name, longitude, latitude, address, hours) from '/dev/blob' with (format csv, header true)", [], { blob: new Blob([csv]) });
    assert.equal(await ready(), 'false');
    assert.equal((await db.query('select count(*) as count from public.osm_pois where location is not null')).rows[0].count, 3);
    await db.exec(activate);
    assert.equal(await ready(), 'true');
    assert.deepEqual((await db.query('select name from public.osm_pois order by osm_id')).rows.map(row => row.name), ["Xăng O'Brien", 'Nghỉ "A"', 'Sửa xe']);
  } finally { await db.close(); }
  await writeFile(input, JSON.stringify(rows[0]));
  await assert.rejects(preparePoi({ input, outputDir: directory }), /Missing a POI category/);
  assert.equal(await readFile(join(directory, 'setup-and-import.sql'), 'utf8'), sql);
});
