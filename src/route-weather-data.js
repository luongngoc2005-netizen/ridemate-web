import {validPoint} from './places-data.js';

export const weatherRiskColors={none:'#6b7280',ok:'#16834b',watch:'#a87800',warn:'#dc650f',danger:'#dc3434'};
export const weatherThresholds={rainWatchProbability:20,rainWarnProbability:40,rainDangerProbability:70,rainWarnMm:1,rainDangerMm:5,gustWarnKmh:40,gustDangerKmh:60,fogWarnMeters:200,fogWatchMeters:1000};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const weatherCodes=new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
export function departureEpoch(date,clock) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))throw new Error('Chọn ngày và giờ xuất phát hợp lệ.');
  const epoch=Date.parse(`${date}T${clock}:00+07:00`)/1000;
  if(!finite(epoch)||new Date(epoch*1000+7*3600000).toISOString().slice(0,10)!==date)throw new Error('Ngày xuất phát không hợp lệ.');
  return epoch;
}
export const vietnamClock=epoch=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(epoch*1000));
export function interpolateTime(marks,dist) {
  if(!marks?.length)return 0;
  // At a stop show arrival. Points beyond it include all same-distance waits.
  if(dist<=marks[0].dist)return marks[0].time;
  for(let i=1;i<marks.length;i++) {
    const a=marks[i-1],b=marks[i];
    if(dist<=b.dist)return b.dist===a.dist?b.time:a.time+(dist-a.dist)/(b.dist-a.dist)*(b.time-a.time);
  }
  return marks.at(-1).time;
}

export function buildDayTimeline(route,day,{visitMinutes=0,mealMinutes=0}={}) {
  const marks=[{dist:0,time:0}];
  const visitEach=day.places.length?visitMinutes*60/day.places.length:0;
  const movingTotal=route.legs.reduce((sum,l)=>sum+(l.planningDurationSeconds??l.durationSeconds),0);
  let dist=0,time=0,driving=0,nextRest=7200,mealDone=false,approximate=false;
  const stops=[];let nextVisit=0;
  const pauseAt=point=>{
    // Routing merges consecutive equal coordinates, but all scheduled visits
    // there still consume time, including a visit at the departure location.
    while(nextVisit<day.places.length&&validPoint(day.places[nextVisit].coordinates)&&point?.coordinates?.every((v,i)=>Math.abs(v-day.places[nextVisit].coordinates[i])<1e-7)) {
      const visit=day.places[nextVisit++];
      stops.push({dist,coordinates:visit.coordinates,name:visit.name||visit.label});
      if(dist<route.distanceKm-1e-6){time+=visitEach;marks.push({dist,time});}
    }
  };
  pauseAt(route.start);
  for(const leg of route.legs) {
    const duration=leg.planningDurationSeconds??leg.durationSeconds;
    const source=leg.timeTable?.length>=2?leg.timeTable:[{dist:0,time:0},{dist:leg.distanceKm,time:leg.durationSeconds>0?leg.durationSeconds:duration}];
    if(!leg.timeTable?.length)approximate=true;
    const scale=leg.durationSeconds>0?duration/leg.durationSeconds:1;
    for(let i=1;i<source.length;i++) {
      const a=source[i-1],b=source[i];
      const events=[];
      while(nextRest<=driving+b.time*scale && nextRest<movingTotal) {
        if(nextRest>driving+a.time*scale)events.push({drive:nextRest,pause:900});
        nextRest+=7200;
      }
      if(!mealDone&&mealMinutes>0&&movingTotal/2>=driving+a.time*scale&&movingTotal/2<=driving+b.time*scale) {
        events.push({drive:movingTotal/2,pause:mealMinutes*60});mealDone=true;
      }
      events.sort((x,y)=>x.drive-y.drive);
      for(const event of events) {
        const offset=event.drive-driving;
        const r=b.time===a.time?0:(offset-a.time*scale)/((b.time-a.time)*scale);
        const eventDist=dist+a.dist+(b.dist-a.dist)*r;
        marks.push({dist:eventDist,time:time+offset});time+=event.pause;
        marks.push({dist:eventDist,time:time+offset});
      }
      marks.push({dist:dist+b.dist,time:time+b.time*scale});
    }
    time+=duration;driving+=duration;dist+=leg.distanceKm;
    pauseAt(leg.end);
  }
  return {marks,stops,duration:marks.at(-1).time,approximate};
}

export function haversineKm(a,b) {
  const rad=Math.PI/180,dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function geometryDistances(coordinates) {
  const cumulative=[0];
  for(let i=1;i<coordinates.length;i++)cumulative.push(cumulative.at(-1)+haversineKm(coordinates[i-1],coordinates[i]));
  return cumulative;
}
export function sampleWeatherPoints(route,timeline,departure) {
  if(!route?.coordinates?.length||route.coordinates.length<2||!route.coordinates.every(validPoint)||!(route.distanceKm>0))throw new Error('Ngày này chưa có cung đường để phân tích thời tiết.');
  const cumulative=geometryDistances(route.coordinates),length=cumulative.at(-1);
  if(!(length>0))throw new Error('Cung đường chưa có chiều dài hợp lệ.');
  const count=Math.max(1,Math.ceil(route.distanceKm/30),Math.ceil(timeline.duration/2700));
  if(count>48)throw new Error('Chặng quá dài cho một ngày. Hãy chia lại lịch trình.');
  const targets=Array.from({length:count+1},(_,i)=>({dist:route.distanceKm*i/count}));
  for(const stop of timeline.stops)if(stop.dist>0&&stop.dist<route.distanceKm)targets.push(stop);
  targets.sort((a,b)=>a.dist-b.dist);
  const unique=[];
  for(const point of targets) {
    const previous=unique.at(-1);
    if(previous&&Math.abs(point.dist-previous.dist)<1e-6){if(point.name){previous.name=[previous.name,point.name].filter(Boolean).join(' / ');previous.coordinates=point.coordinates;}}
    else unique.push({...point});
  }
  if(unique.length>96)throw new Error('Quá nhiều điểm trong một ngày. Hãy chia nhỏ lịch trình.');
  let edge=1;
  return unique.map((p,index)=>{
    const target=p.dist/route.distanceKm*length;
    while(edge<cumulative.length-1&&cumulative[edge]<target)edge++;
    const seg=cumulative[edge]-cumulative[edge-1],r=seg>0?(target-cumulative[edge-1])/seg:0;
    const a=route.coordinates[edge-1],b=route.coordinates[edge];
    return {id:`weather-${index}`,distKm:p.dist,coordinates:p.coordinates||a.map((v,i)=>v+(b[i]-v)*r),eta:departure+interpolateTime(timeline.marks,p.dist),name:p.name||(index===0?route.start.label:index===unique.length-1?route.end.label:`Km ${Math.round(p.dist)}`)};
  });
}

export function pickWeather(hourly,eta) {
  if(!Array.isArray(hourly?.time))return null;
  const h0=Math.floor(eta/3600)*3600,h1=h0+3600,f=(eta-h0)/3600;
  const i=hourly.time.indexOf(h0),j=hourly.time.indexOf(h1);
  if(i<0||j<0)return null;
  const at=(key,index,min,max)=>{const value=hourly[key]?.[index];return finite(value)&&value>=min&&value<=max?value:null;};
  const interval=(key,max)=>{
    const b=at(key,j,0,max);if(b===null)return null;
    const a=at(key,i,0,max);return f<0.25?(a===null?null:Math.max(a,b)):b;
  };
  const continuous=(key,min,max)=>{const a=at(key,i,min,max),b=at(key,j,min,max);return a===null||b===null?null:a+(b-a)*f;};
  const precip=interval('precipitation',1000),probability=interval('precipitation_probability',100);
  const a=at('weather_code',i,0,99),b=at('weather_code',j,0,99);
  if(precip===null||probability===null||!weatherCodes.has(a)||!weatherCodes.has(b))return null;
  const gust=interval('wind_gusts_10m',500),visibility=continuous('visibility',0,1000000);
  return {precip,probability,code:[a,b].find(c=>[95,96,99].includes(c))??b,gust,visibility,temp:continuous('temperature_2m',-100,70),cloud:continuous('cloud_cover',0,100),complete:gust!==null&&visibility!==null};
}
export function weatherRisk(weather) {
  if(!weather)return {level:'none',color:weatherRiskColors.none,label:'Không có dữ liệu',reasons:[],complete:false};
  const t=weatherThresholds,reasons=[];
  const add=(rank,label)=>reasons.push({rank,label});
  if([95,96,99].includes(weather.code))add(3,'Dông');
  if([56,57,66,67].includes(weather.code))add(2,'Mưa đóng băng');
  if([71,73,75,77,85,86].includes(weather.code))add(2,'Tuyết / mưa tuyết');
  if([51,53,55,61,63,65,80,81,82].includes(weather.code))add(1,'Có mưa / mưa phùn');
  if(weather.gust>=t.gustDangerKmh)add(3,'Gió giật mạnh');else if(weather.gust>=t.gustWarnKmh)add(2,'Gió giật mạnh');
  if(weather.visibility!==null&&weather.visibility<t.fogWarnMeters)add(2,'Tầm nhìn rất thấp');
  else if([45,48].includes(weather.code)||(weather.visibility!==null&&weather.visibility<t.fogWatchMeters))add(1,'Sương mù / tầm nhìn thấp');
  if(weather.precip>=t.rainDangerMm)add(3,'Mưa nhiều');else if(weather.precip>=t.rainWarnMm)add(2,'Có mưa');
  if(weather.probability>=t.rainDangerProbability)add(3,'Khả năng mưa cao');else if(weather.probability>=t.rainWarnProbability)add(2,'Có thể mưa');else if(weather.probability>=t.rainWatchProbability)add(1,'Có thể mưa');
  reasons.sort((a,b)=>b.rank-a.rank);
  const level=reasons.length?['ok','watch','warn','danger'][reasons[0].rank]:weather.complete?'ok':'none';
  return {level,color:weatherRiskColors[level],label:reasons[0]?.label||(weather.complete?'Chưa thấy dấu hiệu bất lợi':'Thiếu dữ liệu gió / tầm nhìn'),reasons:reasons.map(r=>r.label),complete:weather.complete};
}
export function weatherSummary(points) {
  const missing=points.filter(p=>!p.weather||!p.risk.complete).length;
  const danger=points.filter(p=>p.risk.level==='danger').length,warn=points.filter(p=>p.risk.level==='warn').length;
  const watch=points.filter(p=>p.risk.level==='watch').length;
  return {missing,danger,warn,watch,text:danger?`${danger} điểm cần chú ý cao`:warn?`${warn} điểm có điều kiện bất lợi`:watch?`${watch} điểm cần lưu ý thời tiết`:missing?'Dữ liệu thời tiết chưa đầy đủ':'Chưa thấy dấu hiệu thời tiết bất lợi tại các điểm lấy mẫu'};
}
export function weatherRouteGeoJSON(route,points) {
  const cumulative=geometryDistances(route.coordinates),length=cumulative.at(-1),features=[];
  if(!(length>0)||!points.length)return {type:'FeatureCollection',features};
  // Insert ownership boundaries within coarse edges while retaining all road
  // vertices. A long straight geometry edge must not hide a hazardous sample.
  const boundaries=points.slice(1).map((point,i)=>(point.distKm+points[i].distKm)/2/route.distanceKm*length);
  let owner=0;
  const append=(a,b)=>{
    const color=points[owner].risk.color,last=features.at(-1);
    if(last?.properties.color===color)last.geometry.coordinates.push(b);
    else features.push({type:'Feature',properties:{color},geometry:{type:'LineString',coordinates:[a,b]}});
  };
  for(let i=1;i<route.coordinates.length;i++) {
    const start=cumulative[i-1],end=cumulative[i],a=route.coordinates[i-1],b=route.coordinates[i];
    if(end===start)continue;
    let from=a;
    while(owner<boundaries.length&&boundaries[owner]<=end) {
      const cut=boundaries[owner];
      if(cut>start){const r=(cut-start)/(end-start),point=a.map((value,j)=>value+(b[j]-value)*r);append(from,point);from=point;}
      owner++;
    }
    if(from.some((v,j)=>v!==b[j]))append(from,b);
  }
  return {type:'FeatureCollection',features};
}
