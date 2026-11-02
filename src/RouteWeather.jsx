import React,{useEffect,useMemo,useRef,useState} from 'react';
import {addDays} from './weather-data.js';
import {feasibilityKey} from './trip-feasibility.js';
import {loadWeatherDayRoute} from './route-weather-day.js';
import {departureEpoch,buildDayTimeline,sampleWeatherPoints,weatherSummary,weatherRouteGeoJSON,vietnamClock,weatherRiskColors} from './route-weather-data.js';
import {forecastWindow,loadRouteWeather} from './route-weather-client.js';
import RouteMap from './RouteMap.jsx';
import './route-weather.css';

export default function RouteWeather({trip}) {
  return <WeatherPanel key={`${trip.date}:${feasibilityKey(trip)}`} trip={trip}/>;
}
function WeatherPanel({trip}) {
  const [index,setIndex]=useState(0),[mode,setMode]=useState('weather'),[selected,setSelected]=useState(null);
  const defaults=i=>({departure:trip.itinerary[i].planning?.departure||(i===0?trip.aiDraft?.departure:null)||'07:00',visitMinutes:String(trip.itinerary[i].planning?.visitMinutes??trip.itinerary[i].places.length*60),mealMinutes:String(trip.itinerary[i].planning?.mealMinutes??60)});
  const [form,setForm]=useState(()=>defaults(0)),[state,setState]=useState({}),[busy,setBusy]=useState(false),[progress,setProgress]=useState('');
  const request=useRef(null),routes=useRef(new Map());
  useEffect(()=>()=>request.current?.abort(),[]);
  const day=trip.itinerary[index],date=addDays(trip.date,index);
  const change=next=>{request.current?.abort();setBusy(false);setState({});setSelected(null);setProgress('');setForm(next);};
  const selectDay=value=>{change(defaults(value));setIndex(value);};
  async function analyze(event) {
    event.preventDefault();request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setBusy(true);setState({});setSelected(null);
    try {
      const departure=departureEpoch(date,form.departure);
      // Validate date before any routing/network calls.
      forecastWindow([{eta:departure}]);
      const visitMinutes=Number(form.visitMinutes),mealMinutes=Number(form.mealMinutes);
      if(![visitMinutes,mealMinutes].every(n=>Number.isFinite(n)&&n>=0&&n<=1440))throw new Error('Thời gian dừng cần nằm trong khoảng 0–1440 phút.');
      setProgress('Đang tính tuyến xe máy cho ngày đã chọn…');
      let data=routes.current.get(index);
      if(!data){data=await loadWeatherDayRoute(trip,index,controller.signal);controller.signal.throwIfAborted();routes.current.set(index,data);}
      const timeline=buildDayTimeline(data.route,day,{visitMinutes,mealMinutes});
      if(timeline.duration>=86400)throw new Error('Lịch di chuyển và dừng nghỉ vượt 24 giờ. Hãy chia lại ngày này.');
      const points=sampleWeatherPoints(data.route,timeline,departure);
      forecastWindow(points);
      setProgress(`Đang tải thời tiết tại ${points.length} điểm…`);
      const forecast=await loadRouteWeather(points,{signal:controller.signal,onProgress:(done,total)=>{if(!controller.signal.aborted)setProgress(`Đang tải thời tiết: ${done}/${total} điểm…`);}});
      controller.signal.throwIfAborted();
      setState({...data,...forecast,timeline,departure});
    }catch(error){if(!controller.signal.aborted)setState({error:error.message||'Chưa phân tích được thời tiết.'});}
    finally{if(request.current===controller&&!controller.signal.aborted){setBusy(false);setProgress('');}}
  }
  const summary=state.points?weatherSummary(state.points):null;
  const weatherData=useMemo(()=>state.route&&state.points?{points:state.points,geojson:weatherRouteGeoJSON(state.route,state.points)}:null,[state.route,state.points]);
  const number=(n,unit)=>Number.isFinite(n)?`${Math.round(n*10)/10}${unit}`:'Chưa có';
  return <section className="route-weather" aria-label="Thời tiết dọc đường">
    <h3>Thời tiết dọc đường</h3>
    <p>Xem dự báo tại giờ dự kiến đi qua từng điểm. Giờ bên dưới theo Việt Nam (UTC+7).</p>
    <form className="route-weather-form" onSubmit={analyze}>
      <label>Ngày phân tích<select value={index} onChange={e=>selectDay(Number(e.target.value))}>{trip.itinerary.map((d,i)=><option value={i} key={d.id}>Ngày {i+1} · {new Date(`${addDays(trip.date,i)}T12:00:00+07:00`).toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})}</option>)}</select></label>
      <label>Giờ xuất phát<input required type="time" value={form.departure} onChange={e=>change({...form,departure:e.target.value})}/></label>
      <label>Tổng phút tham quan<input required type="number" min="0" max="1440" value={form.visitMinutes} onChange={e=>change({...form,visitMinutes:e.target.value})}/></label>
      <label>Phút ăn uống<input required type="number" min="0" max="1440" value={form.mealMinutes} onChange={e=>change({...form,mealMinutes:e.target.value})}/></label>
      <button type="submit" className="green" disabled={busy}>{busy?'Đang phân tích…':state.points?'Cập nhật phân tích':'Phân tích thời tiết dọc đường'}</button>
    </form>
    <p className="route-caption">Xe máy · dự báo theo giờ trong 7 ngày tới. Thời gian tham quan chia đều tại các điểm dừng; ăn uống bố trí giữa thời gian chạy, nghỉ 15 phút sau mỗi 2 giờ lái. Các thông số này dùng cho lần phân tích, chưa sửa lịch đã lưu.</p>
    {busy&&<p role="status">{progress}</p>}{state.error&&<p role="alert">{state.error}</p>}
    {summary&&<>
      <p className={`weather-summary ${summary.danger?'weather-danger':summary.warn?'weather-warn':summary.watch?'weather-watch':''}`} role="status">{summary.text}{summary.missing>0&&` · ${summary.missing}/${state.points.length} điểm thiếu dữ liệu.`}</p>
      {state.errors?.map(error=><p role="status" key={error}>{error} Các vị trí chưa có dữ liệu được tô xám.</p>)}
      <p>{Math.round(state.route.distanceKm)} km · xuất phát {vietnamClock(state.departure)} · đến khoảng {vietnamClock(state.points.at(-1).eta)}.</p>
      {state.lodgingAssumed&&<p className="route-caption">Ngày chưa chọn nơi nghỉ cụ thể dùng ghim điểm đến làm mốc qua đêm. Chọn nơi nghỉ trong lịch trình để ETA sát kế hoạch hơn.</p>}
      <p className="route-caption">{state.timeline.approximate?'Một số chặng chỉ có thời gian tổng; ETA trong chặng được nội suy. ':'ETA nội suy từ thời gian từng bước đường. '}Thời gian chạy dùng mức dự trù của RideMate, chưa có giao thông thực tế.</p>
      <div className="route-weather-modes" role="group" aria-label="Màu cung đường"><button type="button" className="soft" aria-pressed={mode==='weather'} onClick={()=>setMode('weather')}>Màu thời tiết</button><button type="button" className="soft" aria-pressed={mode==='day'} onClick={()=>setMode('day')}>Màu ngày đi</button></div>
      <RouteMap route={state.route} weatherData={mode==='weather'?weatherData:null} weatherSelected={selected} onWeatherSelect={setSelected}/>
      <div className="weather-legend">{[['ok','Chưa thấy bất lợi'],['watch','Lưu ý'],['warn','Bất lợi'],['danger','Chú ý cao'],['none','Thiếu dữ liệu']].map(([level,label])=><span key={level}><i style={{background:weatherRiskColors[level]}}/>{label}</span>)}</div>
      <ol className="route-weather-points">{state.points.map(point=><li key={point.id} className={`weather-${point.risk.level}`}><button type="button" aria-pressed={selected===point.id} onClick={()=>{setMode('weather');setSelected(point.id);}}><span className="weather-dot" style={{background:point.risk.color}}/><span><b>{point.name}</b><small>{vietnamClock(point.eta)} · {point.distKm.toFixed(1)} km</small><strong>{point.risk.label}</strong>{point.weather&&<small>Mưa {number(point.weather.precip,' mm/giờ')} · khả năng {number(point.weather.probability,'%')} · {number(point.weather.temp,'°C')}<br/>Gió giật {number(point.weather.gust,' km/h')} · tầm nhìn {number(point.weather.visibility,' m')}</small>}</span></button></li>)}</ol>
      <p className="route-caption">Màu thể hiện điều kiện dự báo tại các điểm lấy mẫu, không xác nhận toàn tuyến an toàn. {Number.isFinite(state.fetchedAt)&&`Cập nhật ${vietnamClock(state.fetchedAt/1000)}. `}Nguồn: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>.</p>
    </>}
  </section>;
}
