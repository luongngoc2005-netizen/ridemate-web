import { createBoundaryGuard } from './boundary-geometry.js';

let _vietnam = null;
async function loadBoundary() {
  if (_vietnam) return _vietnam;
  const res = await fetch('/data/vietnam-boundary.json');
  const boundary = await res.json();
  _vietnam = createBoundaryGuard(boundary);
  return _vietnam;
}

export const DOMESTIC_ROUTE_ERROR = 'Chưa tìm được tuyến hoàn toàn trong Việt Nam. Tuyến đi qua nước ngoài đã bị chặn. Hãy thêm điểm dừng trong nước hoặc đổi vị trí đã chọn.';

export async function getVietnamGuard() {
  return loadBoundary();
}

export async function isDomesticRoute(route) {
  const vietnam = await loadBoundary();
  return vietnam.containsLine(route?.coordinates) && Array.isArray(route?.legs) && route.legs.length > 0 &&
    route.legs.every(leg => vietnam.containsLine(leg.coordinates)) &&
    Array.isArray(route.points) && route.points.every(point => vietnam.containsPoint(point.coordinates));
}
