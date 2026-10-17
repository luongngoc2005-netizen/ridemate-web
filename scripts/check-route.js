import { loadRoute, directionsUrl } from '../src/route-data.js';
import { travelTime, highwaySteps } from '../src/motorcycle-routing.js';
import { vietnam } from '../src/vietnam-guard.js';

// Direct city-to-city leg only, with no itinerary stops or return journey.
// Endpoints may also be exact longitude,latitude pairs from a failing request.
const [originArg = 'Hà Nội', destinationArg = 'Cao Bằng'] = process.argv.slice(2);
const endpoint = value => /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)
  ? { label: value, coordinates: value.split(',').map(Number) } : value;
const origin = endpoint(originArg), destination = endpoint(destinationArg);
const started = performance.now(), requests = [];
{
  const fetchImpl = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const request = { service: new URL(input).hostname }, start = performance.now();
    const payload = new URL(input).searchParams.get('json');
    if (payload) {
      const routeRequest = JSON.parse(payload);
      request.locations = routeRequest.locations?.length;
      request.alternates = routeRequest.alternates;
      request.exclusions = routeRequest.exclude_locations?.length;
    }
    requests.push(request);
    try {
      const response = await fetchImpl(input, options);
      request.status = response.status;
      request.allowOrigin = response.headers.get('access-control-allow-origin');
      if (!response.ok) request.providerError = await response.clone().json().catch(() => null);
      const readJson = response.json.bind(response);
      response.json = async () => {
        try {
          const data = await readJson();
          if (payload) request.routes = data.routes?.map(route => ({
            distanceKm: route.distance / 1000,
            domestic: vietnam.containsLine(route.geometry?.coordinates),
            highways: highwaySteps(route).length,
          }));
          return data;
        }
        finally { request.elapsedMs = Math.round(performance.now() - start); }
      };
      return response;
    } catch (error) {
      request.error = error.cause?.code || error.name;
      throw error;
    } finally { request.elapsedMs = Math.round(performance.now() - start); }
  };
}
const timings = () => ({ elapsedMs: Math.round(performance.now() - started), requests });
try {
  const route = await loadRoute(origin, destination);
  const routeTimings = timings(), beforeRepeat = requests.length, repeatStarted = performance.now();
  await loadRoute(origin, destination);
  routeTimings.cachedRepeat = { elapsedMs: Math.round(performance.now() - repeatStarted), requests: requests.length - beforeRepeat };
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    origin: route.start, destination: route.end,
    distanceKm: route.distanceKm,
    provider: route.provider, mode: route.mode,
    durationSeconds: route.durationSeconds,
    ridingTime: travelTime(route.durationSeconds),
    planningWithRest: travelTime(route.estimate.total),
    planningWithBuffer: travelTime(route.estimate.upper),
    googleMaps: directionsUrl(route.start, route.end),
    note: 'Valhalla chưa có giao thông trực tiếp; link Google Maps tính tuyến riêng, chưa lấy ETA Google tự động.',
    timings: routeTimings,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  console.error(JSON.stringify(timings(), null, 2));
  process.exitCode = 1;
}
