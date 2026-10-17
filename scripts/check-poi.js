import { readFile } from 'node:fs/promises';
import { fetchNearbyPois } from '../src/poi-client.js';
import { selectPlaces } from '../src/places-data.js';

// Read only the two public frontend settings; do not print keys or load secrets
// into generated files. Environment variables override a local .env.local.
const values = {};
try {
  for (const line of (await readFile('.env.local', 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let args = process.argv.slice(2);
let config = { url: process.env.VITE_SUPABASE_URL || values.VITE_SUPABASE_URL,
  key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || values.VITE_SUPABASE_PUBLISHABLE_KEY };
if (args[0] === '--site' || /^https:\/\//.test(args[0] || '')) {
  // These are the public settings already shipped to every browser, not an
  // administrative credential. This option only calls the public POI RPC.
  const flagged = args[0] === '--site';
  const site = new URL(args[flagged ? 1 : 0]); args = args.slice(flagged ? 2 : 1);
  const html = await (await fetch(site, { signal: AbortSignal.timeout(15000) })).text();
  const src = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(match => new URL(match[1], site)).find(url => url.origin === site.origin && /\/assets\/index-.*\.js$/.test(url.pathname));
  if (!src) throw new Error('Cannot identify the deployed Vite application bundle.');
  const bundle = await (await fetch(src, { signal: AbortSignal.timeout(15000) })).text();
  const urls = [...new Set(bundle.match(/https:\/\/[a-z0-9-]+\.supabase\.co/g) || [])];
  const keys = [...new Set(bundle.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]{20,}/g) || [])];
  config = null;
  for (const url of urls) for (const key of keys) {
    if (key.startsWith('eyJ')) {
      try {
        const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
        if (claims.role === 'anon' && claims.ref === new URL(url).hostname.split('.')[0]) config = { url, key };
      } catch { /* Not an anon-key JWT. */ }
    } else if (urls.length === 1) config = { url, key };
  }
  if (!config) throw new Error('Cannot identify public Supabase settings. Use .env.local instead.');
  console.log(JSON.stringify({ site: site.origin, supabaseHost: new URL(config.url).hostname }));
}
if (!config.url || !config.key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Set the existing public settings in .env.local or environment.');
  process.exitCode = 1;
} else {
  const point = args.length ? args.slice(0, 2).map(Number) : [106.2587824, 22.665781];
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = performance.now();
    try {
      const data = await fetchNearbyPois(config, point);
      if (!data) throw new Error('POI snapshot is not published or nearby_pois migration is missing.');
      const places = selectPlaces(data.elements, [point, point], 30);
      console.log(JSON.stringify({ attempt: attempt + 1, elapsedMs: Math.round(performance.now() - start), dataset: data.dataset,
        sourceDate: data.sourceDate, complete: data.complete, counts: Object.fromEntries(['fuel', 'rest', 'repair'].map(type => [type, places.filter(p => p.type === type).length])) }));
    } catch (error) { console.error(error.message); process.exitCode = 1; break; }
  }
}
