import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poiRecord } from '../src/poi-data.js';
import { vietnam } from '../src/vietnam-guard.js';

const columns = ['osm_type', 'osm_id', 'category', 'name', 'longitude', 'latitude', 'address', 'hours'];
const literal = value => typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const csvValue = value => '"' + String(value).replaceAll('"', '""') + '"';
const registrationSql = (records, metadata, datasetId) => `insert into public.poi_imports(id, source_url, source_date, expected_count) values (${literal(datasetId)}, ${literal(metadata.sourceUrl)}, ${literal(metadata.sourceDate)}, ${records.length}) on conflict (id) do nothing;`;
const insertSql = (records, datasetId) => `insert into public.osm_pois(dataset_id, ${columns.join(', ')}) values\n${records.map(row => '(' + [literal(datasetId), ...columns.map(key => literal(row[key]))].join(',') + ')').join(',\n')}\non conflict (dataset_id, osm_type, osm_id) do nothing;`;
const activationSql = (records, datasetId) => `do $$ begin
  if (select count(*) from public.osm_pois where dataset_id = '${datasetId}') <> ${records.length} then
    raise exception 'Incomplete POI snapshot; active dataset unchanged';
  end if;
end $$;
update public.poi_imports set ready = true where id = '${datasetId}';
insert into public.poi_catalog(singleton, dataset_id) values (true, '${datasetId}') on conflict (singleton) do update set dataset_id = excluded.dataset_id;`;
const transactionStart = `begin;
set local standard_conforming_strings = on;
select pg_advisory_xact_lock(hashtextextended('ridemate-poi-import', 0));`;

export function datasetSql(records, metadata, datasetId) {
  if (!records.length || !/^[a-f0-9]{24}$/.test(datasetId)) throw new Error('A nonempty verified POI snapshot is required.');
  const sql = [
    '-- Public OSM POIs only. Large export: run through a direct database connection.',
    '-- Import is transactional; existing active data remains visible on failure.',
    'begin;', "set local standard_conforming_strings = on;",
    "select pg_advisory_xact_lock(hashtextextended('ridemate-poi-import', 0));",
    registrationSql(records, metadata, datasetId),
  ];
  for (let i = 0; i < records.length; i += 400) {
    sql.push(insertSql(records.slice(i, i + 400), datasetId));
  }
  sql.push(activationSql(records, datasetId),
  'commit;', 'analyze public.osm_pois;',
  "select category, count(*) from public.osm_pois where dataset_id = (select dataset_id from public.poi_catalog where singleton) group by category;",
  "select pg_size_pretty(pg_total_relation_size('public.osm_pois')) as poi_table_with_indexes, pg_size_pretty(pg_database_size(current_database())) as database_size;",
  '');
  return sql.join('\n');
}

export function editorSql(records, metadata, datasetId, migration, maxBytes = 64000) {
  // Validate the same snapshot as the direct-connection SQL export.
  if (!records.length || !/^[a-f0-9]{24}$/.test(datasetId)) throw new Error('A nonempty verified POI snapshot is required.');
  const setup = migration + '\n' + transactionStart + '\n' + registrationSql(records, metadata, datasetId) + '\ncommit;\n';
  const activate = transactionStart + '\n' + activationSql(records, datasetId) + `
commit;
analyze public.osm_pois;
select (public.nearby_pois(106.2587824, 22.665781, 1500)->>'ready') as ready,
  (select count(*) from public.osm_pois where dataset_id = '${datasetId}') as imported_count,
  pg_size_pretty(pg_total_relation_size('public.osm_pois')) as poi_with_indexes;\n`;
  const parts = [], wrap = rows => transactionStart + '\n' + insertSql(rows, datasetId) + '\ncommit;\n';
  let current = [];
  for (const record of records) {
    if (Buffer.byteLength(wrap([record]), 'utf8') > maxBytes) throw new Error('A POI row exceeds the SQL Editor chunk limit.');
    if (current.length && Buffer.byteLength(wrap([...current, record]), 'utf8') > maxBytes) {
      parts.push(wrap(current)); current = [];
    }
    current.push(record);
  }
  if (current.length) parts.push(wrap(current));
  return { setup, activate, parts };
}

export async function preparePoi({ input = 'output/poi/poi-elements.jsonl', outputDir = 'output/poi', containsPoint = vietnam.containsPoint } = {}) {
  const metadata = JSON.parse(await readFile(join(dirname(input), 'source.json'), 'utf8'));
  if (!metadata.sourceUrl || !metadata.sourceDate) throw new Error('Missing OSM source metadata.');
  const rows = new Map(), counts = { fuel: 0, rest: 0, repair: 0 }, rejected = { invalidOrOutsideVietnam: 0, duplicates: 0 };
  const reader = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    const record = poiRecord(JSON.parse(line), containsPoint);
    if (!record) { rejected.invalidOrOutsideVietnam++; continue; }
    const key = `${record.osm_type}/${record.osm_id}`;
    if (rows.has(key)) { rejected.duplicates++; continue; }
    rows.set(key, record); counts[record.category]++;
  }
  const records = [...rows.values()].sort((a, b) => a.osm_type.localeCompare(b.osm_type) || a.osm_id - b.osm_id);
  if (Object.values(counts).some(count => !count)) throw new Error('Missing a POI category; refusing publication.');
  const datasetId = createHash('sha256').update(JSON.stringify([metadata.sourceMd5 || metadata.sourceUrl, records])).digest('hex').slice(0, 24);
  await mkdir(outputDir, { recursive: true });
  const sql = datasetSql(records, metadata, datasetId);
  const routeMigration = await readFile(new URL('../supabase/migrations/202610170002_route_pois.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/202610170001_osm_pois.sql', import.meta.url), 'utf8') + '\n' + routeMigration;
  await writeFile(join(outputDir, '04-route-search.sql'), routeMigration);
  await writeFile(join(outputDir, 'import.sql'), sql);
  await writeFile(join(outputDir, 'setup-and-import.sql'), migration + '\n' + sql);
  await writeFile(join(outputDir, 'pois.csv'), ['dataset_id,' + columns.join(','), ...records.map(row => [datasetId, ...columns.map(key => row[key])].map(csvValue).join(',')), ''].join('\n'));
  const editor = editorSql(records, metadata, datasetId, migration);
  await writeFile(join(outputDir, '01-setup.sql'), editor.setup);
  await writeFile(join(outputDir, '03-activate.sql'), editor.activate);
  const partsDir = join(outputDir, 'sql-editor', datasetId);
  await mkdir(partsDir, { recursive: true });
  for (let i = 0; i < editor.parts.length; i++) await writeFile(join(partsDir, `02-data-${String(i + 1).padStart(3, '0')}.sql`), editor.parts[i]);
  await writeFile(join(outputDir, 'IMPORT-README.txt'), `NHAP DU LIEU POI VAO SUPABASE\n\n1. SQL Editor: chay toan bo file 01-setup.sql (nho).\n2. Table Editor: chon bang public.osm_pois -> Insert -> Import data from CSV. Chon file pois.csv. Cho import hoan tat.\n3. SQL Editor: chay toan bo file 03-activate.sql. Ket qua can ready=true va imported_count=${records.length}.\n\nNeu da nhap va kich hoat du lieu truoc day: chi chay 04-route-search.sql de them tim doc tuyen; khong nhap lai CSV.\n\nKhong dan setup-and-import.sql/import.sql vao SQL Editor: cac file do danh cho ket noi database truc tiep.\nNeu CSV bao trung khoa do da nhap mot phan, dung cac file 02-data-*.sql trong sql-editor/${datasetId}/ theo thu tu, roi chay 03-activate.sql. Cac phan SQL co the chay lai an toan. Khong xoa bang hay tat RLS.\n`);
  const report = { datasetId, source: metadata, counts, total: records.length, rejected,
    sqlBytes: (await stat(join(outputDir, 'setup-and-import.sql'))).size,
    csvBytes: (await stat(join(outputDir, 'pois.csv'))).size,
    sqlEditor: { setupBytes: Buffer.byteLength(editor.setup), activateBytes: Buffer.byteLength(editor.activate), fallbackParts: editor.parts.length, largestPartBytes: Math.max(...editor.parts.map(sql => Buffer.byteLength(sql))) },
    note: 'File sizes are not database/index sizes. Measure these after import. OSM coverage may be incomplete.',
  };
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await preparePoi({ input: process.argv[2], outputDir: process.argv[3] }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
