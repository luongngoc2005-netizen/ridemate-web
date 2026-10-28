import React from 'react';
import {useBookings} from './BookingContext.jsx';
import {money} from './catalog.js';
import {addDays,bookingMismatch} from './booking-data.js';
import ToolIcon from '../ToolIcon.jsx';
import './stays.css';

export function StayNightPlan({trip,onFind}) {
  const {bookings,loading,error}=useBookings();
  const linked=bookings.filter(b=>b.tripId===trip.id&&b.status==='confirmed');
  return <section className="box stay-plan"><h2><ToolIcon name="bed" className="inline-icon"/> Chỗ nghỉ trong hành trình</h2><p>Đặt phòng mẫu, không phát sinh giao dịch thực tế.</p>{loading?<p>Đang tải đơn…</p>:error?<p role="alert">{error}</p>:<><p>Tổng đơn đã xác nhận: <b>{money(linked.reduce((sum,b)=>sum+b.total,0))}</b></p>{linked.some(b=>bookingMismatch(b,trip))&&<p role="alert">Lịch trình đã thay đổi. Một số đơn không còn khớp ngày; hãy kiểm tra và hủy/đặt lại. Đơn không tự đổi ngày.</p>}</>}{trip.itinerary.slice(0,Math.max(1,Number(trip.days)-1)).map((day,index)=>{const date=addDays(trip.date,index);return <div className="stay-night" key={day.id}><span>Đêm {index+1} · {date}<small>{linked.filter(b=>!bookingMismatch(b,trip)&&b.checkIn<=date&&b.checkOut>date).map(b=>b.hotelName).join(', ')||'Chưa có chỗ nghỉ'}</small></span><button className="soft" onClick={()=>onFind(date)}>Tìm phòng</button></div>})}</section>;
}
