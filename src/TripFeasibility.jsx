import React,{useEffect,useState} from 'react';
import {evaluateTrip,feasibilityKey} from './trip-feasibility.js';
import {travelTime} from './motorcycle-routing.js';
import OriginSelect from './OriginSelect.jsx';
const time=m=>`${Math.floor(m/1440)?`+${Math.floor(m/1440)} ngày `:''}${String(Math.floor(Math.ceil(m)%1440/60)).padStart(2,'0')}:${String(Math.ceil(m)%60).padStart(2,'0')}`;
export default function TripFeasibility({trip,onPlanningChange}) {
  const [state,setState]=useState({days:[],loading:true}),[retry,setRetry]=useState(0),key=feasibilityKey(trip);
  useEffect(()=>{
    const controller=new AbortController();setState({days:[],loading:true,key});
    evaluateTrip(trip,controller.signal,days=>{if(!controller.signal.aborted)setState({days,loading:true,key});})
      .then(days=>{if(!controller.signal.aborted)setState({days,loading:false,key});})
      .catch(e=>{if(!controller.signal.aborted)setState({days:[],loading:false,error:e.message,key});});
    return ()=>controller.abort();
  },[key,retry]);
  const current=state.key===key?state:{days:[],loading:true};
  return <section className="box"><h3>Kiểm tra quỹ thời gian từng ngày</h3><p>Tính tuyến xe máy qua điểm tham quan và điểm nghỉ cuối ngày, gồm chặng về khi được yêu cầu. Thời gian chưa có giao thông trực tiếp và chưa kiểm tra giờ mở cửa.</p>{current.loading&&<p role="status">Đang tính {current.days.length}/{trip.itinerary.length} ngày…</p>}{current.error&&<p role="alert">{current.error}</p>}{trip.itinerary.map((day,index)=>{
    const d=current.days.find(d=>d.dayId===day.id),a=d?.assessment,p=day.planning||{};
    const update=(k,v)=>onPlanningChange?.(index,{...p,[k]:v});
    return <article key={day.id}><h4>Ngày {index+1}: {day.title}</h4>{d?.error&&<p role="alert">{d.error}</p>}{a&&<><p>{Math.round(d.route.distanceKm)} km · chạy xe {travelTime(a.drivingMinutes*60)} · tham quan {a.visitMinutes} phút · ăn {a.mealMinutes} phút · nghỉ ngắn {a.restMinutes} phút.</p><p>Tổng {travelTime(a.totalMinutes*60)} · xuất phát {a.departure} → dự kiến {time(a.arrivalMinutes)}.</p>{a.issues.map(s=><p role="alert" key={s}>{s}</p>)}{!a.issues.length&&<p>Chưa phát hiện vượt quỹ giờ đã nhập; kết quả còn phụ thuộc các giả định bên dưới.</p>}{a.assumptions.map(s=><p key={s}>{s}</p>)}</>}{d?.lodgingAssumed&&<p>Chưa chọn nơi nghỉ cụ thể: tạm tính đến điểm đại diện {d.end.label}. Kết quả có thể đổi khi chọn đúng chỗ nghỉ.</p>}
      {onPlanningChange&&<details><summary>Điều chỉnh thời gian và nơi nghỉ</summary><label>Giờ xuất phát<input type="time" value={p.departure|| (index===0?trip.aiDraft?.departure:'')||'07:00'} onChange={e=>update('departure',e.target.value)}/></label><label>Kết thúc trước<input type="time" value={p.finishBy||'18:00'} onChange={e=>update('finishBy',e.target.value)}/></label>{[['visitMinutes','Tổng phút tham quan',day.places.length*60],['mealMinutes','Tổng phút ăn uống',60]].map(([k,label,fallback])=><label key={k}>{label}<input type="number" min="0" max="1440" value={p[k]??fallback} onChange={e=>update(k,Math.max(0,Math.min(1440,+e.target.value)))}/></label>)}{!(index===trip.itinerary.length-1&&trip.returnToOrigin===true)&&<OriginSelect label="Nơi nghỉ cuối ngày" confirmLabel="Dùng làm nơi nghỉ cuối ngày" value={{origin:p.lodgingPoint?.label||p.lodgingName||trip.destination,originPoint:p.lodgingPoint}} onChange={v=>onPlanningChange(index,{...p,lodgingPoint:v.originPoint||null,lodgingName:v.origin})}/>}</details>}
    </article>;
  })}<button className="soft" onClick={()=>setRetry(n=>n+1)}>Tính lại</button></section>;
}
