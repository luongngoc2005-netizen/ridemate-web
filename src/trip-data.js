export const STORAGE_KEY = 'ridemate.trip.v1';
export const newId = () => globalThis.crypto.randomUUID();
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
export const destinations = [
  { name: 'Hà Giang', source: 'https://www.vietnam.travel/vi/node/1641', places: ['Cổng trời Quản Bạ', 'Phố cổ Đồng Văn', 'Cột cờ Lũng Cú', 'Đèo Mã Pí Lèng'] },
  { name: 'Cao Bằng', source: 'https://vietnam.travel/node/606', places: ['Thác Bản Giốc', 'Động Ngườm Ngao', 'Khu di tích Pác Bó'] },
  { name: 'Mộc Châu', source: 'https://www.vietnam.travel/things-to-do/moc-chau-your-one-stop-nature-escape', places: ['Thác Dải Yếm', 'Đồi chè Mộc Châu'] },
  { name: 'Cát Bà', source: 'https://www.vietnam.travel/things-to-do/things-do-north-vietnam', places: ['Vườn quốc gia Cát Bà', 'Động Trung Trang', 'Bãi biển Cát Cò'] },
];
export const suggestionsFor = destination => destinations.find(item => normalize(destination).includes(normalize(item.name)));
export const initialDetails = { origin: 'Hà Nội', destination: 'Hà Giang', date: '2026-09-15', days: 4, notes: '', interests: [] };
export function validDetails(value) {
  return value && typeof value.origin === 'string' && value.origin.trim().length > 0 && typeof value.destination === 'string' && value.destination.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && !Number.isNaN(Date.parse(value.date)) && Number.isInteger(Number(value.days)) && Number(value.days) >= 1 && Number(value.days) <= 30;
}
export function dateRange(trip) {
  const start = new Date(`${trip.date}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + Number(trip.days) - 1);
  const format = date => date.toLocaleDateString('vi-VN');
  return Number(trip.days) === 1 ? format(start) : `${format(start)} – ${format(end)}`;
}
export function blankDay(title) { return { id: newId(), title, places: [], note: '' }; }
export function suggestItinerary(details) {
  const count = Number(details.days);
  const plan = Array.from({ length: count }, (_, index) => blankDay(count === 1 ? `Khám phá ${details.destination}` : index === 0 ? `${details.origin} → ${details.destination}` : index === count - 1 ? `${details.destination} → ${details.origin}` : `Khám phá ${details.destination}`));
  const availableDays = count > 2 ? plan.slice(1, -1) : [plan[0]];
  const places = suggestionsFor(details.destination)?.places || [];
  // Keep travel days light; the remaining places stay available as optional suggestions.
  places.slice(0, availableDays.length * 2).forEach((name, index) => {
    availableDays[Math.floor(index / 2)].places.push({ id: newId(), name });
  });
  return plan;
}
export function createTrip(details) {
  if (!validDetails(details)) throw new Error('Thông tin chuyến đi không hợp lệ.');
  const result = { ...details, origin: details.origin.trim(), destination: details.destination.trim(), days: Number(details.days), id: newId(), notes: details.notes || '', interests: details.interests || [] };
  return { ...result, itinerary: suggestItinerary(result), checklist: ['CCCD/CMND', 'Giấy phép lái xe', 'Đăng ký xe', 'Bảo hiểm xe máy', 'Kiểm tra lốp xe', 'Kiểm tra dầu nhớt', 'Kiểm tra phanh', 'Kiểm tra đèn, còi', 'Bộ vá xe', 'Áo mưa', 'Sạc dự phòng'].map(name => ({ id: newId(), name, done: false })) };
}
export function editTripDetails(trip, details) {
  if (!validDetails(details)) throw new Error('Thông tin chuyến đi không hợp lệ.');
  const days = Number(details.days);
  const itinerary = trip.itinerary.slice(0, days);
  while (itinerary.length < days) itinerary.push(blankDay(`Khám phá ${details.destination.trim()}`));
  return { ...trip, ...details, origin: details.origin.trim(), destination: details.destination.trim(), days, itinerary };
}
export function isStoredTrip(value) {
  return validDetails(value) && typeof value.id === 'string' && typeof value.notes === 'string' && Array.isArray(value.interests) && value.interests.every(x => typeof x === 'string') && Array.isArray(value.itinerary) && value.itinerary.length === Number(value.days) && value.itinerary.every(day => day && typeof day.id === 'string' && typeof day.title === 'string' && typeof day.note === 'string' && Array.isArray(day.places) && day.places.every(place => place && typeof place.id === 'string' && typeof place.name === 'string')) && Array.isArray(value.checklist) && value.checklist.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.done === 'boolean');
}
export function readTrip(storage) {
  try { const raw = storage.getItem(STORAGE_KEY); if (!raw) return { trip: null, error: '' }; const value = JSON.parse(raw); if (!isStoredTrip(value)) throw new Error(); return { trip: value, error: '' }; }
  catch { return { trip: null, error: 'Không đọc được chuyến đi đã lưu. Dữ liệu cũ chưa bị ghi đè; bạn có thể tạo chuyến đi mới.' }; }
}
export function saveTrip(storage, trip) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(trip)); return ''; }
  catch { return 'Trình duyệt chưa lưu được thay đổi. Hãy giữ trang này mở và kiểm tra dung lượng/quyền lưu trữ.'; }
}
