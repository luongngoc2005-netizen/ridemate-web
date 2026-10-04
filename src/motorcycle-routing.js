export function motorcycleUrl(endpoint, points, alternatives = false, exclusions = []) {
  const url = new URL(endpoint);
  url.searchParams.set('json', JSON.stringify({
    locations: points.map(p => ({ lon: p.coordinates[0], lat: p.coordinates[1], type: 'break' })),
    // Neutral preferences keep legal trunk/national roads usable. A zero highway
    // preference penalizes trunk roads too; motorway exclusion is separate.
    costing: 'motorcycle', costing_options: { motorcycle: { exclude_highways: true, use_highways: 0.5, use_trails: 0, use_tolls: 0.5, top_speed: 60 } },
    format: 'osrm', shape_format: 'geojson', units: 'kilometers', alternates: alternatives ? 2 : 0,
    exclude_locations: exclusions.map(([lon, lat]) => ({ lon, lat })),
  }));
  return url;
}
export function highwaySteps(route) {
  return (route.legs || []).flatMap(leg => leg.steps || []).filter(step =>
    step.intersections?.some(i => i.classes?.includes('motorway')) ||
    /cao\s*tốc|expressway|motorway/i.test(step.name || '') || /(?:^|[;\s])CT[.\s]?\d/i.test(step.ref || ''));
}
export function exclusionPoints(routes) {
  return routes.flatMap(route => highwaySteps(route).flatMap(step => {
    const coords = step.geometry?.coordinates || [];
    return [0.25, 0.5, 0.75].map(f => coords[Math.floor((coords.length - 1) * f)]).filter(Boolean);
  }));
}
// Planning assumptions, not observed speeds or a claim of real-time traffic accuracy.
export function ridingEstimate(km, providerSeconds) {
  const moving = Math.max(providerSeconds, km / 40 * 3600);
  const rest = Math.max(0, Math.ceil(moving / 7200) - 1) * 900;
  return { moving, rest, total: moving + rest, upper: moving * 1.25 + rest };
}
export function applyRidingEstimate(route) {
  const legs = route.legs.map(leg => ({ ...leg, providerDurationSeconds: leg.durationSeconds,
    planningDurationSeconds: ridingEstimate(leg.distanceKm, leg.durationSeconds).moving }));
  const moving = legs.reduce((sum, leg) => sum + leg.planningDurationSeconds, 0);
  const estimate = ridingEstimate(route.distanceKm, moving);
  return { ...route, provider: 'Valhalla', mode: 'motorcycle', legs, providerDurationSeconds: route.durationSeconds,
    estimate };
}
export function travelTime(seconds) {
  const minutes = Math.ceil(seconds / 300) * 5;
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}
