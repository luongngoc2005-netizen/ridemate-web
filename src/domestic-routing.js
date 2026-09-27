// Domestic corridor used only after the router's alternatives cross a border.
// These are shaping points, not user itinerary stops. Every returned road
// segment still has to pass the detailed Vietnam boundary guard.
const corridor = [
  { label: 'Vinh', coordinates: [105.681, 18.679] },
  { label: 'Đồng Hới', coordinates: [106.623, 17.469] },
  { label: 'Đà Nẵng', coordinates: [108.202, 16.054] },
  { label: 'Nha Trang', coordinates: [109.19, 12.24] },
  { label: 'Phan Thiết', coordinates: [108.102, 10.928] },
];

export function domesticShapingPoints(start, end) {
  const a = start.coordinates[1], b = end.coordinates[1];
  if (Math.abs(a - b) < 2) return [];
  const between = corridor.filter(p => p.coordinates[1] > Math.min(a, b) + 0.2 && p.coordinates[1] < Math.max(a, b) - 0.2);
  const ordered = a > b ? between : [...between].reverse();
  return ordered.map(p => ({ ...p, dayNumber: end.dayNumber || 1, routingOnly: true }));
}
