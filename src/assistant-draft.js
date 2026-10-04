import {createTrip,newId,suggestionsFor} from './trip-data.js';
import {cleanProfile,profileQuestions} from './ride-review.js';
import {validOriginPoint} from './origin-data.js';
import {intakeContext} from './assistant-intake.js';
import {cleanStopLocations,locationKey} from './attraction-location.js';
import {cleanDayPlanning} from './trip-feasibility.js';

const string=(v,max=600)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const strings=(v,max=15)=>Array.isArray(v)&&v.length<=max&&v.every(x=>string(x));
export function validateDraft(value){
  return !!value&&string(value.origin,200)&&string(value.destination,200)&&string(value.summary,1200)&&
    strings(value.assumptions)&&strings(value.warnings)&&strings(value.checklist,30)&&value.checklist.length>0&&
    Array.isArray(value.days)&&value.days.length>=1&&value.days.length<=7&&value.days.every(d=>
      d&&string(d.title,200)&&string(d.morning)&&string(d.afternoon)&&string(d.evening)&&string(d.lodging)&&strings(d.stops,5));
}
export function cleanDraft(value,{keepContext=true}={}){
  if(!validateDraft(value))throw new Error('Bản nháp chưa hợp lệ. Hãy thử lại hoặc chỉnh yêu cầu.');
  const result={origin:value.origin,destination:value.destination,summary:value.summary,assumptions:[...value.assumptions],warnings:[...value.warnings],checklist:[...value.checklist],
    days:value.days.map(d=>({title:d.title,morning:d.morning,afternoon:d.afternoon,evening:d.evening,lodging:d.lodging,stops:[...d.stops]}))};
  if(keepContext){
    result.stopLocations=cleanStopLocations(value.stopLocations,value.destination,value.days.flatMap(d=>d.stops));
    if(Array.isArray(value.dayPlanning))result.dayPlanning=value.days.map((_,i)=>cleanDayPlanning(value.dayPlanning[i]));
    if(Number.isInteger(value.nights)&&value.nights>=0&&value.nights<=value.days.length)result.nights=value.nights;
    if(typeof value.returnToOrigin==='boolean')result.returnToOrigin=value.returnToOrigin;
    if(value.details)result.details=intakeContext(value.details);
    if(validOriginPoint(value.originPoint)&&value.originPoint.label===value.origin)result.originPoint={...value.originPoint,coordinates:[...value.originPoint.coordinates]};
  }
  return result;
}
export function basicDraft(message){
  const q=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
  if(!/\b(hn|ha noi)\b/.test(q)||! /\b(cb|cao bang)\b/.test(q)||! /3\s*(n\s*2\s*d|ngay)/.test(q))return null;
  // Only a complete, known request has an offline template. Never pretend to apply free-text edits.
  return {origin:'Hà Nội',destination:'Cao Bằng',summary:'Bản nháp 3 ngày 2 đêm: dành ngày đầu và ngày cuối cho di chuyển; ngày giữa chọn Bản Giốc và Ngườm Ngao. Chưa tính tuyến nên chưa thể xác nhận lịch vừa sức.',
    assumptions:['Giả định đi và về Hà Nội bằng xe máy, nghỉ 2 đêm tại khu vực trung tâm Cao Bằng.','Chưa biết ngày đi, số người, loại xe và sức chạy; chưa đặt phòng hoặc mua vé.','Không ghép Pác Bó vào bản 3 ngày này để giữ lịch gọn; có thể đổi điểm hoặc thêm ngày.'],
    days:[
      {title:'Hà Nội → Cao Bằng',morning:'Xuất phát theo giờ sẽ xác nhận. Ưu tiên chặng di chuyển, bố trí dừng nghỉ theo thể trạng; chọn điểm dừng cụ thể sau khi có tuyến.',afternoon:'Tiếp tục đến Cao Bằng, ăn trưa và nghỉ giữa chặng. Nếu muộn hoặc mệt, dừng nghỉ sớm và điều chỉnh nơi ngủ.',evening:'Nhận phòng dự kiến, ăn tối gần nơi ở và nghỉ. Không thêm điểm tham quan xa vào ngày di chuyển.',lodging:'Khu vực trung tâm Cao Bằng; chọn cơ sở có chỗ để xe, xác nhận giá và phòng trống.',stops:[]},
      {title:'Bản Giốc và Ngườm Ngao',morning:'Dự kiến ghé Thác Bản Giốc. Kiểm tra tuyến, điều kiện đường và thời gian mở cửa trước khi đi.',afternoon:'Ăn trưa, nghỉ rồi cân nhắc Động Ngườm Ngao. Bỏ bớt một điểm nếu thời gian quay về không phù hợp.',evening:'Về nơi nghỉ đã chọn hoặc điều chỉnh chỗ nghỉ nếu mệt; không cố bù lịch bằng chạy tối.',lodging:'Dự kiến nghỉ đêm thứ hai tại trung tâm Cao Bằng; kiểm tra thời gian quay về trước khi chốt.',stops:['Thác Bản Giốc','Động Ngườm Ngao']},
      {title:'Cao Bằng → Hà Nội',morning:'Trả phòng, ăn sáng và kiểm tra xe trước chặng về. Không ghép thêm điểm xa.',afternoon:'Di chuyển về Hà Nội, dành khoảng nghỉ và ăn trưa; chia lại chặng nếu vượt sức chạy.',evening:'Giờ đến chưa xác minh. Nếu có nguy cơ chạy tối hoặc quá mệt, nghỉ thêm một đêm thay vì cố hoàn thành.',lodging:'Không bố trí đêm thứ ba trong bản nháp; cần khoản dự phòng nếu phải nghỉ thêm.',stops:[]}],
    warnings:['Chặng đi/về cần tính lại từ địa chỉ xuất phát cụ thể. 3 ngày có thể không phù hợp người mới hoặc người muốn chạy ít giờ mỗi ngày.','Chưa xác minh quãng đường, thời gian chạy, thời tiết, giá vé và phòng trống.'],
    checklist:['Giấy tờ tùy thân, giấy phép lái xe và giấy tờ xe phù hợp','Mũ bảo hiểm, găng tay, giày và áo mưa','Kiểm tra lốp, phanh, đèn và bảo dưỡng theo loại xe','Nước uống, đồ cá nhân và túi chống nước','Điện thoại, sạc dự phòng, bản đồ ngoại tuyến','Bộ vá/bơm phù hợp và liên hệ hỗ trợ sửa xe','Tiền dự phòng cho nghỉ thêm hoặc sửa xe']};
}
export function draftCosts(draft){
  return [...new Set(draft.days.flatMap(d=>d.stops))].map(name=>({name,value:'Chưa xác minh',unit:'vé/người',source:suggestionsFor(draft.destination)?.places.includes(name)?suggestionsFor(draft.destination).source:null}));
}
export function confirmDraft(draft,details){
  draft=cleanDraft(draft);
  details={...draft.details,...details};
  const {date,departure,origin,people,vehicles}=details;
  const destination=(details.destination??draft.destination).trim();
  if(!string(origin,200)||origin.trim()==='Chưa xác định')throw new Error('Hãy nhập điểm xuất phát cụ thể.');
  if(!string(destination,200)||destination==='Chưa xác định')throw new Error('Hãy nhập điểm đến trước khi tạo kế hoạch.');
  if(!Number.isInteger(+people)||+people<1||+people>30)throw new Error('Số người phải từ 1 đến 30.');
  if(!Number.isInteger(+vehicles)||+vehicles<1||+vehicles>+people||+people>+vehicles*2)throw new Error('Số xe phải từ 1 đến số người và mỗi xe tối đa 2 người.');
  draft={...draft,origin:origin.trim(),destination};
  const dateValue=new Date(`${date}T12:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(dateValue.getTime())||dateValue.toISOString().slice(0,10)!==date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)||!string(origin,200)||draft.destination==='Chưa xác định'||!Number.isInteger(+people)||+people<1||+people>30||!Number.isInteger(+vehicles)||+vehicles<1||+vehicles>+people||+people>+vehicles*2)throw new Error('Kiểm tra ngày, giờ, điểm đi/đến, số người và số xe (tối đa 2 người/xe).');
  const originPoint=validOriginPoint(draft.originPoint)&&draft.originPoint.label===origin.trim()?draft.originPoint:null;
  const trip=createTrip({origin,destination:draft.destination,date,days:draft.days.length,interests:details.preferences?[details.preferences]:[],notes:draft.summary,originPoint,
    nights:draft.nights??Math.max(0,draft.days.length-1),returnToOrigin:draft.returnToOrigin!==false});
  trip.itinerary=draft.days.map((d,index)=>({id:newId(),title:d.title,places:d.stops.map(name=>{const p=draft.stopLocations?.[locationKey(name,draft.destination)];return {id:newId(),name,category:'attraction',...(p?{coordinates:[...p.coordinates],address:p.address,source:p.source,sourceId:p.id}: {})};}),
    ...(draft.dayPlanning?.[index]?{planning:{...draft.dayPlanning[index]}}:{}),
    note:`Sáng: ${d.morning}\nChiều: ${d.afternoon}\nTối: ${d.evening}\nNghỉ: ${d.lodging}`,
    ...(index===0?{rideReview:{departure}}:{})}));
  trip.checklist=draft.checklist.map(name=>({id:newId(),name,done:false}));
  const rider=cleanProfile(details);
  trip.aiDraft={...draft,people:+people,vehicles:+vehicles,rider,departure,confirmed:true,routeVerified:false,fees:draftCosts(draft)};
  const riderText=profileQuestions.filter(q=>rider[q.key]!=null).map(q=>q.options?.find(([v])=>v===rider[q.key])?.[1]||`${rider[q.key]} giờ chạy/ngày`).join(', ');
  trip.notes=[draft.summary,'Các giả định ở thời điểm soạn bản nháp:',...draft.assumptions,...draft.warnings,`Đã xác nhận: ${date}, xuất phát ${departure}, ${people} người / ${vehicles} xe. Tuyến và giá chưa xác minh; chưa đặt dịch vụ.`,...draftCosts(draft).map(f=>`${f.name}: vé/người chưa xác minh.`),'Ăn uống, phòng nghỉ, nhiên liệu và dự phòng: chưa xác minh, chưa có tổng chi phí.',`Hồ sơ lúc xác nhận: ${riderText||'chưa cung cấp'}. Chưa có thời gian tuyến để so với sức chạy.`].join('\n');
  return trip;
}
