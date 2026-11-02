import {pickWeather,weatherRisk} from './route-weather-data.js';
const cache=new Map();
export function forecastWindow(points,now=Date.now()/1000) {
  const first=Math.min(...points.map(p=>p.eta)),last=Math.max(...points.map(p=>p.eta));
  if(first<now-3600)throw new Error('Giờ xuất phát đã qua. Chọn giờ mới để xem dự báo dọc đường.');
  // Hourly route forecast is deliberately limited to seven days. The existing
  // daily destination forecast keeps its longer window separately.
  if(last>now+7*86400)throw new Error('Dự báo dọc đường chỉ phân tích trong 7 ngày tới, tính cả giờ đến.');
  return {start:Math.floor(first/3600)*3600-3600,end:Math.ceil(last/3600)*3600+3600};
}
export async function loadRouteWeather(points,{signal,refresh=false,fetchImpl=fetch,now=Date.now()/1000,onProgress=()=>{}}={}) {
  const window=forecastWindow(points,now),results=new Array(points.length),pending=[];
  for(let i=0;i<points.length;i++) {
    const p=points[i],key=`${p.coordinates.map(v=>v.toFixed(4)).join(',')}:${window.start}:${window.end}`;
    const saved=cache.get(key);
    if(!refresh&&saved&&Date.now()-saved.fetchedAt<30*60000)results[i]={...p,weather:pickWeather(saved.hourly,p.eta),fetchedAt:saved.fetchedAt};
    else pending.push({point:p,index:i,key});
  }
  let next=0,completed=points.length-pending.length;
  const errors=[];
  await Promise.all(Array.from({length:Math.min(2,Math.ceil(pending.length/15))},async()=>{
    while(next<pending.length) {
      const offset=next;next+=15;
      const batch=pending.slice(offset,offset+15),controller=new AbortController();
      const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
      const timeout=setTimeout(cancel,30000);
      try {
        signal?.throwIfAborted();
        const params=new URLSearchParams({latitudes:batch.map(p=>p.point.coordinates[1].toFixed(4)).join(','),longitudes:batch.map(p=>p.point.coordinates[0].toFixed(4)).join(','),start:String(window.start),end:String(window.end)});
        const response=await fetchImpl(`/api/route-weather?${params}`,{signal:controller.signal});
        if(!response.ok)throw new Error(response.status===429?'Dịch vụ thời tiết đang giới hạn yêu cầu. Hãy thử lại sau.':'Chưa kết nối được dịch vụ thời tiết.');
        const json=await response.json(),records=Array.isArray(json.forecasts)?json.forecasts:[];
        if(records.length!==batch.length)throw new Error('Dịch vụ trả thiếu vị trí dự báo.');
        const fetchedAt=Number.isFinite(json.fetchedAt)?json.fetchedAt:Date.now();
        signal?.throwIfAborted();
        for(let i=0;i<batch.length;i++) {
          const item=batch[i],hourly=records[i]?.hourly;
          if(pickWeather(hourly,item.point.eta)){cache.delete(item.key);cache.set(item.key,{hourly,fetchedAt});}
          results[item.index]={...item.point,weather:pickWeather(hourly,item.point.eta),fetchedAt};
        }
        while(cache.size>160)cache.delete(cache.keys().next().value);
      }catch(error) {
        if(signal?.aborted)throw error;
        errors.push(error.message);
        for(const item of batch)results[item.index]={...item.point,weather:null};
      }finally {
        clearTimeout(timeout);signal?.removeEventListener('abort',cancel);completed+=batch.length;onProgress(completed,points.length);
      }
    }
  }));
  signal?.throwIfAborted();
  return {points:results.map(p=>({...p,risk:weatherRisk(p.weather)})),errors:[...new Set(errors)],fetchedAt:Math.min(...results.map(p=>p.fetchedAt||Infinity))};
}
