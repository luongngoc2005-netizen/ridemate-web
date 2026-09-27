import React from 'react';
import {hotelById,money} from './catalog.js';
export default function BookingSummary({booking}) {
  const hotel=hotelById(booking.hotelId);
  return <dl className="booking-summary">
    <div><dt>Check-in · Nhận phòng (giờ Việt Nam)</dt><dd>{booking.checkIn} · {hotel?.checkInTime||'14:00'}</dd></div>
    <div><dt>Check-out · Trả phòng (giờ Việt Nam)</dt><dd>{booking.checkOut} · {hotel?.checkOutTime||'12:00'}</dd></div>
    <div><dt>Số lượng</dt><dd>{booking.nights} đêm · {booking.rooms} phòng · {booking.guests} khách</dd></div>
    <div><dt>Giá mỗi phòng / đêm</dt><dd>{money(booking.nightRate)}</dd></div>
    <div><dt>Tổng giá demo (đã gồm thuế/phí)</dt><dd><strong>{money(booking.total)}</strong><small>{money(booking.nightRate)} × {booking.rooms} phòng × {booking.nights} đêm</small></dd></div>
    <div><dt>Thanh toán</dt><dd>Không thu tiền · đơn minh họa</dd></div>
  </dl>;
}
