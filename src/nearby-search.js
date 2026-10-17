import { validPoint } from './places-data.js';

export function nearbyStatus(location, search, results) {
  if (location.error) return location.error;
  if (!search) return location.pending
    ? 'Đang lấy vị trí… Hãy cho phép trình duyệt truy cập vị trí.'
    : 'Bật định vị để tìm quanh bạn.';
  if (results.error) return results.error;
  // A newly clicked search is pending even before its loading effect runs.
  if (results.loading || !results.ready) return 'Đang tìm địa điểm trong bán kính 1,5 km…';
  return results.items.length
    ? `Tìm thấy ${results.items.length} địa điểm. Bấm Xem kết quả hoặc ghim trên bản đồ.`
    : 'Chưa tìm thấy địa điểm trong bán kính 1,5 km. Bạn có thể tìm thêm trên Google Maps.';
}

export function nearbyMapsUrl(point, category) {
  const terms = { fuel: 'gas station', rest: 'hotel', repair: 'motorcycle repair' };
  if (!validPoint(point) || !terms[category]) throw new Error('Vị trí hoặc loại địa điểm không hợp lệ.');
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${terms[category]} near ${point[1]},${point[0]}` })}`;
}
