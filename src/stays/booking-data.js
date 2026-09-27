import { roomById, hotelById } from './catalog.js';

export const todayVN = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dateNumber(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const n=Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/86400000:NaN;
}
export const addDays = (date,days) => new Date((dateNumber(date)+days)*86400000).toISOString().slice(0,10);
export function quoteStay(roomId,checkIn,checkOut,rooms,guests,today=todayVN()) {
  const room=roomById(roomId), nights=dateNumber(checkOut)-dateNumber(checkIn);
  if(!room) throw new Error('Loại phòng không tồn tại.');
  if(!Number.isInteger(nights)||nights<1||nights>30||checkIn<today) throw new Error('Chọn ngày nhận phòng từ hôm nay và lưu trú từ 1 đến 30 đêm.');
  if(!Number.isInteger(rooms)||rooms<1||rooms>5||!Number.isInteger(guests)||guests<1||guests>20) throw new Error('Số phòng từ 1–5, số khách từ 1–20.');
  if(guests>rooms*room.capacity) throw new Error(`Cần thêm phòng: mỗi phòng tối đa ${room.capacity} khách.`);
  return {nights,nightRate:room.price,total:room.price*nights*rooms};
}
export function availableRooms(roomId,checkIn,checkOut,bookings) {
  const room=roomById(roomId); if(!room) return 0;
  const start=dateNumber(checkIn),end=dateNumber(checkOut);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>30) return 0;
  let available=room.stock;
  for(let night=start;night<end;night++) {
    const used=bookings.filter(b=>b.status==='confirmed'&&b.roomId===roomId&&dateNumber(b.checkIn)<=night&&dateNumber(b.checkOut)>night).reduce((sum,b)=>sum+b.rooms,0);
    available=Math.min(available,room.stock-used);
  }
  return Math.max(0,available);
}
export function normalizeRequest(input) {
  const contact={name:String(input.contact?.name||'').trim(),email:String(input.contact?.email||'').trim(),phone:String(input.contact?.phone||'').trim()};
  if(contact.name.length<2||contact.name.length>100||!/^\S+@\S+\.\S+$/.test(contact.email)||contact.email.length>150||!/^\+?[0-9 ()-]{8,20}$/.test(contact.phone)) throw new Error('Kiểm tra họ tên, email và số điện thoại liên hệ.');
  const linked=input.tripId?{tripId:String(input.tripId),tripDate:input.tripDate,tripDayId:input.tripDayId,tripLabel:String(input.tripLabel||'').slice(0,200)}:{tripId:null,tripDate:null,tripDayId:null,tripLabel:null};
  if(linked.tripId&&(!Number.isFinite(dateNumber(linked.tripDate))||typeof linked.tripDayId!=='string'||linked.tripDayId.length>200||linked.tripId.length>200)) throw new Error('Ngày liên kết hành trình không hợp lệ.');
  return {roomId:input.roomId,checkIn:input.checkIn,checkOut:input.checkOut,rooms:Number(input.rooms),guests:Number(input.guests),contact,...linked};
}
export function confirmDemoBooking(existing,requestId,input,today=todayVN()) {
  if(!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Mã yêu cầu không hợp lệ.');
  const request=normalizeRequest(input), prior=existing.find(b=>b.id===requestId);
  if(prior) {
    if(JSON.stringify(prior.request)!==JSON.stringify(request)) throw new Error('Yêu cầu này đã được xử lý với thông tin khác. Hãy mở lại bước đặt phòng.');
    return prior;
  }
  const quote=quoteStay(request.roomId,request.checkIn,request.checkOut,request.rooms,request.guests,today);
  if(availableRooms(request.roomId,request.checkIn,request.checkOut,existing)<request.rooms) throw new Error('Phòng mẫu đã hết cho ngày này. Hãy chọn loại phòng hoặc ngày khác.');
  const room=roomById(request.roomId);
  return {id:requestId,code:`DEMO-${requestId.slice(0,8).toUpperCase()}`,status:'confirmed',...request,...quote,hotelId:room.hotel.id,hotelName:room.hotel.name,roomName:room.name,createdAt:new Date().toISOString(),request};
}
export function bookingMismatch(booking,trip) {
  if(!booking.tripId||booking.status!=='confirmed') return false;
  if(!trip||booking.tripId!==trip.id) return true;
  const index=trip.itinerary.findIndex(day=>day.id===booking.tripDayId);
  return index<0||addDays(trip.date,index)!==booking.checkIn||booking.checkOut>addDays(trip.date,Number(trip.days));
}
// Only a derived view gains accommodation pins. Booking data never overwrites
// user-authored places and a cancellation cannot leave a stale stored pin.
export function tripWithStays(trip,bookings) {
  if(!trip) return trip;
  return {...trip,itinerary:trip.itinerary.map((day,index)=>{
    const date=addDays(trip.date,index);
    const nightly=bookings.filter(b=>b.status==='confirmed'&&b.tripId===trip.id&&!bookingMismatch(b,trip)&&b.checkIn<=date&&b.checkOut>date);
    const seen=new Set();
    const places=nightly.flatMap(booking=>{
      const hotel=hotelById(booking.hotelId); if(!hotel||seen.has(hotel.id)) return [];
      seen.add(hotel.id);
      return [{id:`stay:${booking.id}:${date}`,name:`${hotel.name} (đặt phòng demo)`,coordinates:hotel.coordinates,address:hotel.address,bookingId:booking.id}];
    });
    return {...day,places:[...day.places,...places]};
  })};
}
