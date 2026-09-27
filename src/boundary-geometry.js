const EPS = 1e-10;
const valid = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

// Latitude buckets keep detailed border checks cheap without simplifying away
// small border bends. Polygon holes and disconnected islands are preserved.
export function createBoundaryGuard(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length) throw new Error('Missing country boundary');
  const buckets = new Map(), size = 0.025;
  const bucket = y => Math.floor(y / size);
  for (const [polygon, rings] of polygons.entries()) {
    for (const ring of rings) {
      if (ring.length < 4 || ring.some(p => !valid(p))) throw new Error('Invalid country boundary');
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const edge = { a, b, polygon, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) };
        for (let row = bucket(edge.minY); row <= bucket(edge.maxY); row++) {
          if (!buckets.has(row)) buckets.set(row, []);
          buckets.get(row).push(edge);
        }
      }
    }
  }
  function containsPoint(point) {
    if (!valid(point)) return false;
    const [x, y] = point, inside = new Set();
    for (const edge of buckets.get(bucket(y)) || []) {
      const { a, b, polygon } = edge;
      if (y < edge.minY - EPS || y > edge.maxY + EPS || x > edge.maxX + EPS) continue;
      if (x >= edge.minX - EPS && Math.abs(cross(b[0] - a[0], b[1] - a[1], x - a[0], y - a[1])) < EPS) return true;
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) {
        if (inside.has(polygon)) inside.delete(polygon); else inside.add(polygon);
      }
    }
    return inside.size > 0;
  }
  function containsSegment(a, b) {
    if (!containsPoint(a) || !containsPoint(b)) return false;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return true;
    const cuts = [0, 1], seen = new Set();
    const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
    for (let row = bucket(Math.min(a[1], b[1])); row <= bucket(Math.max(a[1], b[1])); row++) {
      for (const edge of buckets.get(row) || []) {
        if (seen.has(edge) || edge.maxX < minX || edge.minX > maxX) continue;
        seen.add(edge);
        const ex = edge.b[0] - edge.a[0], ey = edge.b[1] - edge.a[1];
        const qx = edge.a[0] - a[0], qy = edge.a[1] - a[1];
        const denominator = cross(dx, dy, ex, ey);
        if (Math.abs(denominator) > 1e-16) {
          const t = cross(qx, qy, ex, ey) / denominator, u = cross(qx, qy, dx, dy) / denominator;
          if (t > 0 && t < 1 && u >= -EPS && u <= 1 + EPS) cuts.push(t);
        } else if (Math.abs(cross(qx, qy, dx, dy)) < EPS) {
          const squared = dx * dx + dy * dy;
          for (const p of [edge.a, edge.b]) {
            const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squared;
            if (t > 0 && t < 1) cuts.push(t);
          }
        }
      }
    }
    cuts.sort((x, y) => x - y);
    // Endpoints alone miss a foreign excursion across a concave border/hole.
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] <= EPS) continue;
      const t = (cuts[i] + cuts[i - 1]) / 2;
      if (!containsPoint([a[0] + dx * t, a[1] + dy * t])) return false;
    }
    return true;
  }
  return {
    containsPoint,
    containsLine: points => Array.isArray(points) && points.length >= 2 && points.every(valid) && points.slice(1).every((p, i) => containsSegment(points[i], p)),
  };
}
