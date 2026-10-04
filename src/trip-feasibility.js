import {resolveRoutePoint,loadRoute} from './route-data.js';
import {tripOrigin} from './origin-data.js';
import {validPoint} from './places-data.js';
import {cleanProfile} from './ride-review.js';
export const feasibilityKey=trip=>JSON.stringify([trip.origin,trip.originPoint,trip.destination,trip.returnToOrigin,trip.aiDraft?.rider,trip.aiDraft?.departure,trip.itinerary.map(d=>[d.id,d.places.map(p=>[p.name,p.coordinates]),d.planning])]);
export function cleanDayPlanning(value){
  const result={};
  for(const k of ['departure','finishBy'])if(/^([01]\d|2[0-3]):[0-5]\d$/.test(value?.[k]||''))result[k]=value[k];
  for(const k of ['visitMinutes','mealMinutes'])if(value?.[k]!=null&&value[k]!==''&&Number.isFinite(+value[k])&&+value[k]>=0&&+value[k]<=1440)result[k]=+value[k];
  if(typeof value?.lodgingName==='string'&&value.lodgingName.trim())result.lodgingName=value.lodgingName.trim().slice(0,200);
  if(validPoint(value?.lodgingPoint?.coordinates)&&typeof value.lodgingPoint.label==='string')result.lodgingPoint={label:value.lodgingPoint.label.slice(0,200),coordinates:value.lodgingPoint.coordinates.slice(0,2)};
  return result;
}
const number=(n,fallback)=>n!==''&&n!=null&&Number.isFinite(+n)&&+n>=0?+n:fallback;
const clock=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?+s.slice(0,2)*60 + +s.slice(3):null;
export function assessDailyRoute(day,route,profile={},defaults={}) {
  profile=cleanProfile(profile);
  const p=cleanDayPlanning(day.planning),departure=p.departure||(clock(defaults.departure)!=null?defaults.departure:'07:00'),finishBy=p.finishBy||'18:00';
  const drivingMinutes=route.estimate.moving/60;
  const visitMinutes=number(p.visitMinutes,day.places.length*60),mealMinutes=number(p.mealMinutes,60);
  const restMinutes=route.estimate.rest/60,totalMinutes=drivingMinutes+visitMinutes+mealMinutes+restMinutes;
  const arrivalMinutes=clock(departure)+totalMinutes,issues=[];
  if(profile.hours&&drivingMinutes>+profile.hours*60)issues.push(`Chạy xe vượt giới hạn ${profile.hours} giờ/ngày. Cân nhắc chia chặng hoặc thêm ngày.`);
  if(profile.avoidDark==='yes'&&arrivalMinutes>clock(finishBy))issues.push(`Dự kiến kết thúc sau ${finishBy}. Giảm điểm ghé, xuất phát sớm hoặc nghỉ thêm; không bù giờ bằng tăng tốc.`);
  if(arrivalMinutes>=1440)issues.push('Tổng hoạt động vượt sang ngày hôm sau; cần chia lại lịch.');
  return {drivingMinutes,visitMinutes,mealMinutes,restMinutes,totalMinutes,arrivalMinutes,departure,finishBy,issues,
    assumptions:[!profile.hours?'Chưa có giới hạn giờ chạy/ngày của người lái; chưa thể đánh giá sức chạy.':null,p.visitMinutes==null?'Giả định 60 phút tham quan/điểm; chỉnh theo nhu cầu.':null,p.mealMinutes==null?'Giả định 60 phút ăn uống/ngày.':null,!p.departure&&clock(defaults.departure)==null?'Giả định xuất phát 07:00.':null,!p.finishBy?'Mốc 18:00 là giả định lập kế hoạch, không phải giờ hoàng hôn.':null].filter(Boolean)};
}
export async function evaluateTrip(trip,signal,onDay=()=>{}) {
  const start=await resolveRoutePoint(tripOrigin(trip),signal),destination=await resolveRoutePoint(trip.destination,signal);
  const days=[];let previous=start;
  for(let index=0;index<trip.itinerary.length;index++){
    signal?.throwIfAborted();const day=trip.itinerary[index],last=index===trip.itinerary.length-1;
    const returning=last&&trip.returnToOrigin===true;
    const end=returning?start:validPoint(day.planning?.lodgingPoint?.coordinates)?await resolveRoutePoint(day.planning.lodgingPoint,signal):day.planning?.lodgingName?await resolveRoutePoint(day.planning.lodgingName,signal):destination;
    const missing=day.places.filter(p=>!validPoint(p.coordinates)).map(p=>p.name);
    let result={dayId:day.id,dayNumber:index+1,start:previous,end,missing,
      lodgingAssumed:!returning&&!validPoint(day.planning?.lodgingPoint?.coordinates)};
    try {
      if(missing.length)result.error=`Chưa có tọa độ: ${missing.join(', ')}. Chưa thể kết luận ngày này vừa sức.`;
      else {
        const stops=day.places.map(p=>({...p,label:p.name,dayNumber:index+1,dayId:day.id}));
        // loadRoute also handles a same-point start/end through actual stops.
        if(!stops.length&&previous.coordinates.every((v,i)=>v===end.coordinates[i])){
          result.route={distanceKm:0,durationSeconds:0,estimate:{moving:0,rest:0}};
        }else result.route=await loadRoute(previous,end,signal,stops);
        result.assessment=assessDailyRoute(day,result.route,trip.aiDraft?.rider||{}, {departure:index===0?trip.aiDraft?.departure:null});
      }
    }catch(error){if(signal?.aborted)throw error;result.error=error.message;}
    days.push(result);onDay([...days]);previous=end;
  }
  return days;
}
