import { loadNearbyPlaces, mapServices } from '../src/route-data.js';

// Use a public reference point unless exact coordinates are supplied explicitly.
const [lon = '106.2587824', lat = '22.665781', endpoint] = process.argv.slice(2);
if (endpoint) mapServices.places = endpoint;
const point = [Number(lon), Number(lat)], requests = [];
const fetchImpl = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const record = { service: new URL(input).hostname }, start = performance.now();
  requests.push(record);
  try {
    const response = await fetchImpl(input, { ...options, headers: {
      ...options.headers,
      'User-Agent': 'RideMate diagnostics (+https://ridemate-pka.onrender.com/)',
      Referer: 'https://ridemate-pka.onrender.com/',
      Origin: 'https://ridemate-pka.onrender.com',
    } });
    record.status = response.status;
    record.allowOrigin = response.headers.get('access-control-allow-origin');
    const read = response.json.bind(response);
    response.json = async () => {
      try { return await read(); }
      finally { record.elapsedMs = Math.round(performance.now() - start); }
    };
    return response;
  } finally { record.elapsedMs = Math.round(performance.now() - start); }
};
for (const category of ['fuel', 'rest']) {
  const start = performance.now(), before = requests.length;
  try {
    const places = await loadNearbyPlaces(point, category);
    console.log(JSON.stringify({ category, point, elapsedMs: Math.round(performance.now() - start),
      count: places.length, requests: requests.slice(before),
      sample: places.slice(0, 3).map(p => ({ name: p.name, distanceMeters: Math.round(p.distanceMeters) })),
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ category, elapsedMs: Math.round(performance.now() - start), error: error.message, requests: requests.slice(before) }, null, 2));
    process.exitCode = 1;
    // Respect the main provider's cooldown rather than issuing another query.
    if ([406, 429].includes(requests.at(-1)?.status)) break;
  }
}
