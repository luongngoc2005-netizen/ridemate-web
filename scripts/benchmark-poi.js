// Actual PostgreSQL/PostGIS via WASM, running locally. This is not a measurement
// of Supabase hosting, Render, GPS acquisition or browser/network latency.
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const csvMode = process.argv.includes('--csv');
const directory = process.argv.slice(2).find(arg => arg !== '--csv') || 'output/poi';
const db = new PGlite({ extensions: { postgis } });
try {
  const started = performance.now();
  await db.exec('create role anon nologin; create role authenticated nologin;');
  if (csvMode) {
    await db.exec(await readFile(join(directory, '01-setup.sql'), 'utf8'));
    await db.query("copy public.osm_pois(dataset_id, osm_type, osm_id, category, name, longitude, latitude, address, hours) from '/dev/blob' with (format csv, header true)", [], { blob: new Blob([await readFile(join(directory, 'pois.csv'))]) });
    await db.exec(await readFile(join(directory, '03-activate.sql'), 'utf8'));
  } else await db.exec(await readFile(join(directory, 'setup-and-import.sql'), 'utf8'));
  console.log('Snapshot imported into local PostGIS; measuring searches...');
  const importedMs = Math.round(performance.now() - started), searches = [];
  await db.exec('set role anon');
  for (const [name, lon, lat] of [
    ['Cao Bang', 106.2587824, 22.665781], ['Ha Noi', 105.804817, 21.028511],
    ['Ho Chi Minh', 106.700981, 10.776889], ['Da Lat', 108.4419, 11.9404],
  ]) {
    const times = []; let data;
    for (let attempt = 0; attempt < 6; attempt++) {
      const start = performance.now();
      data = (await db.query('select public.nearby_pois($1, $2, 2000) as data', [lon, lat])).rows[0].data;
      times.push(Math.round((performance.now() - start) * 100) / 100);
    }
    searches.push({ name, point: [lon, lat], radiusMeters: 2000, firstMs: times[0], repeatMs: times.slice(1),
      complete: data.complete, counts: Object.fromEntries(['fuel', 'rest', 'repair'].map(type => [type, data.places.filter(p => p.category === type).length])) });
  }
  await db.exec('reset role');
  const sizes = (await db.query("select pg_total_relation_size('public.osm_pois') as poi_bytes_with_indexes, pg_database_size(current_database()) as database_bytes")).rows[0];
  const explain = (await db.query(`explain (analyze, buffers, format json)
    select osm_id from public.osm_pois where dataset_id = (select dataset_id from public.poi_catalog where singleton)
      and category = 'fuel' and extensions.st_dwithin(location, extensions.st_setsrid(extensions.st_makepoint(106.2587824, 22.665781), 4326)::extensions.geography, 1500)
    order by location operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(106.2587824, 22.665781), 4326)::extensions.geography limit 30`)).rows;
  const report = { environment: 'Local PGlite + real PostGIS (WASM); not Supabase/network latency', importMode: csvMode ? 'Small setup SQL + actual CSV COPY + activation SQL' : 'Combined SQL', importedMs, sizes, searches };
  await writeFile(join(directory, csvMode ? 'benchmark-csv.json' : 'benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(directory, csvMode ? 'query-plan-csv.json' : 'query-plan.json'), JSON.stringify(explain, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await db.close(); }
