// Domestic corridor for long routes and routes that otherwise cross a border.
// These are shaping points, not user itinerary stops. Every returned road
// segment still has to pass the detailed Vietnam boundary guard.
import { routePosition } from './places-data.js';
const corridor = [
  { label: 'Hà Nội', coordinates: [105.854041, 21.0283334] },
  { label: 'Vinh', coordinates: [105.681, 18.679] },
  { label: 'Đồng Hới', coordinates: [106.623, 17.469] },
  { label: 'Đà Nẵng', coordinates: [108.202, 16.054] },
  { label: 'Quy Nhơn', coordinates: [109.223, 13.776] },
  { label: 'Nha Trang', coordinates: [109.19, 12.24] },
  { label: 'Phan Thiết', coordinates: [108.102, 10.928] },
  { label: 'TP.HCM', coordinates: [106.7166008, 10.7737261] },
];

export function domesticShapingPoints(start, end) {
  const a = start.coordinates[1], b = end.coordinates[1];
  if (Math.abs(a - b) < 2) return [];
  const between = corridor.filter(p => p.coordinates[1] > Math.min(a, b) + 0.2 && p.coordinates[1] < Math.max(a, b) - 0.2);
  const ordered = a > b ? between : [...between].reverse();
  return ordered.map(p => ({ ...p, dayNumber: end.dayNumber || 1, routingOnly: true }));
}

// Batch several short legs without sending another country-length request.
// Endpoints overlap so merging responses preserves every point and its order.
export function domesticRequestChunks(points) {
  const chunks = [];
  let chunk = [points[0]], distance = 0;
  for (let i = 1; i < points.length; i++) {
    const length = routePosition(points[i - 1].coordinates, [points[i - 1].coordinates, points[i].coordinates]).total;
    if (chunk.length > 1 && (distance + length > 500000 || chunk.length >= 3)) {
      chunks.push(chunk); chunk = [points[i - 1]]; distance = 0;
    }
    chunk.push(points[i]); distance += length;
  }
  if (chunk.length > 1) chunks.push(chunk);
  return chunks;
}
