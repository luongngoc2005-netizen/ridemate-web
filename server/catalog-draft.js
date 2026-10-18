import {cleanDraft} from '../src/assistant-draft.js';
import {requestedDuration} from '../src/assistant-intake.js';
import {apiError} from './supabase-gate.js';

// Discard invalid model prose completely. Rebuild only from the selected destination's sources.
export function catalogDraft(payload,selection){
 const context=payload.context||{},previous=payload.previous;
 const count=context.days||previous?.days.length||requestedDuration(payload.message).days||3;
 const nights=context.nights??previous?.nights??Math.max(0,count-1);
 const origin=context.origin||previous?.origin||'Chưa xác định',destination=context.destination||previous?.destination||selection.name;
 const returning=context.returnToOrigin??previous?.returnToOrigin??true;
 const required=selection.required||[],names=[...new Set([...required,...selection.places])];
 if(required.length>count*5)throw apiError(422,'AI_REQUESTED_PLACE_MISSING');
 const visits=Array.from({length:count},()=>[]);
 const priority=count>2?[...Array.from({length:count-2},(_,i)=>i+1),0,count-1]:Array.from({length:count},(_,i)=>i);
 const target=Math.min(names.length,Math.max(required.length,(count>2?count-2:count)*2));
 names.slice(0,target).forEach((name,i)=>{let index=priority[Math.floor(i/2)%priority.length];if(visits[index].length>=5)index=priority.find(day=>visits[day].length<5);visits[index].push(name);});
 const days=visits.map((stops,i)=>{
  const first=i===0,last=i===count-1,back=last&&returning;
  return {
   title:(first?(back?origin+' → '+destination+' → '+origin:origin+' → '+destination):back?destination+' → '+origin:'Khám phá '+destination).slice(0,200),
   morning:first?'Khởi hành từ '+origin+' đến '+destination+(context.departure?' theo giờ đã chọn '+context.departure:'')+'. Tính tuyến và bố trí dừng nghỉ trước khi đi.':back?'Trả phòng nếu phù hợp với số đêm đã chọn, kiểm tra xe và chuẩn bị chặng về.':'Ăn sáng, kiểm tra xe và điều kiện thời tiết trước khi di chuyển trong '+destination+'.',
   afternoon:stops.length?'Dự kiến tham quan '+(stops.join('; ').length<=400?stops.join('; '):'các điểm được liệt kê trong ngày')+'. Kiểm tra vị trí, giờ mở cửa và thời gian tuyến; giảm điểm nếu không đủ thời gian.':'Ưu tiên di chuyển, ăn uống và dừng nghỉ theo thể trạng; không thêm điểm ngoài khu vực đã chọn.',
   evening:back?'Trở về '+origin+' khi đủ sức và thời gian. Nếu muộn hoặc mệt, nghỉ thêm và điều chỉnh kế hoạch.':'Ăn tối và nghỉ tại '+destination+'; chọn nơi để xe phù hợp, không cố chạy tối để bù lịch.',
   lodging:back?'Chưa bố trí đêm nghỉ thêm trong lịch; dự phòng nghỉ thêm nếu chặng về chưa phù hợp.':'Dự kiến khu vực '+destination+'; xác nhận địa chỉ, giá và phân bổ '+nights+' đêm trước khi đặt.',stops,
  };
 });
 const draft=cleanDraft({origin,destination,summary:'Lịch trình '+count+' ngày '+nights+' đêm từ '+origin+' đến '+destination+', chọn điểm từ danh sách địa danh đã đối chiếu của '+selection.name+'.',days,
  assumptions:['Giữ điểm đi, điểm đến và số ngày/đêm đã cung cấp; chưa đặt dịch vụ.','Đây là lịch gợi ý từ nguồn địa danh, chưa xác nhận quỹ thời gian từng ngày.'],
  warnings:['Model đã đề xuất điểm không phù hợp; RideMate dựng lại lịch từ danh sách địa danh đúng khu vực thay vì dùng nội dung đó.','Chưa xác minh tuyến, thời gian chạy, giờ mở cửa, thời tiết, giá vé hoặc nơi nghỉ.','Số đêm khác số ngày trừ một cần tự đối chiếu cách phân bổ khi xác nhận.'],
  checklist:['Kiểm tra phanh, lốp, đèn và dầu xe trước khi đi.','Mang giấy tờ, mũ bảo hiểm, áo mưa, nước uống và bộ vá/bơm phù hợp.','Chuẩn bị sạc dự phòng, bản đồ ngoại tuyến và khoản dự phòng sửa xe/nghỉ thêm.'],
 });
 draft.nights=nights;draft.returnToOrigin=returning;return draft;
}
