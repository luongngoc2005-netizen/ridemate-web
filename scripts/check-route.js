import { loadRoute, directionsUrl } from '../src/route-data.js';
import { travelTime } from '../src/motorcycle-routing.js';

// Direct city-to-city leg only, with no itinerary stops or return journey.
const [origin = 'Hà Nội', destination = 'Cao Bằng'] = process.argv.slice(2);
try {
  const route = await loadRoute(origin, destination);
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
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
