import boundary from './data/vietnam-boundary.json' with { type: 'json' };
import { createBoundaryGuard } from './boundary-geometry.js';

export const vietnam = createBoundaryGuard(boundary);
export const DOMESTIC_ROUTE_ERROR = 'Chưa tìm được tuyến hoàn toàn trong Việt Nam. Tuyến đi qua nước ngoài đã bị chặn. Hãy thêm điểm dừng trong nước hoặc đổi vị trí đã chọn.';
export function isDomesticRoute(route) {
  return vietnam.containsLine(route?.coordinates) && Array.isArray(route?.legs) && route.legs.length > 0 &&
    route.legs.every(leg => vietnam.containsLine(leg.coordinates)) &&
    Array.isArray(route.points) && route.points.every(point => vietnam.containsPoint(point.coordinates));
}
