import test from 'node:test';
import assert from 'node:assert/strict';
import {departureEpoch,interpolateTime,buildDayTimeline,sampleWeatherPoints,pickWeather,weatherRisk,weatherSummary,weatherRouteGeoJSON} from '../src/route-weather-data.js';
import {loadRouteWeather,forecastWindow} from '../src/route-weather-client.js';
import {loadWeatherDayRoute} from '../src/route-weather-day.js';
import {legTimeTable} from '../src/osrm-data.js';

const makeHourly=(base,overrides={})=>({time:[base,base+3600],precipitation:[0,0],precipitation_probability:[0,0],weather_code:[0,0],wind_gusts_10m:[10,10],visibility:[10000,10000],temperature_2m:[20,24],cloud_cover:[20,40],...overrides});
const start={label:'Hà Nội',coordinates:[105.85,21.03]},stop={id:'visit',label:'Điểm ghé',coordinates:[105.9,21.08]},end={label:'Nơi nghỉ',coordinates:[105.95,21.13]};
function route() {return {start,end,coordinates:[start.coordinates,stop.coordinates,end.coordinates],distanceKm:60,legs:[
  {start,end:stop,distanceKm:30,durationSeconds:3600,planningDurationSeconds:3600,timeTable:[{dist:0,time:0},{dist:10,time:1800},{dist:30,time:3600}]},
  {start:stop,end,distanceKm:30,durationSeconds:3600,planningDurationSeconds:3600,timeTable:[{dist:0,time:0},{dist:30,time:3600}]},
]};}
test('Vietnam departures have a fixed UTC offset and reject invalid dates/clocks',()=>{
  assert.equal(departureEpoch('2026-11-02','07:00'),Date.UTC(2026,10,2,0)/1000);
  assert.throws(()=>departureEpoch('2026-02-30','07:00'));assert.throws(()=>departureEpoch('2026-11-02','24:00'));
});
test('provider step durations survive normalization; unavailable steps fall back explicitly',()=>{
  assert.deepEqual(legTimeTable({distance:100000,duration:3600,steps:[{distance:10000,duration:1800},{distance:90000,duration:1800}]}),[{dist:0,time:0},{dist:10,time:1800},{dist:100,time:3600}]);
  assert.equal(legTimeTable({steps:[{geometry:{}}]}),null);
});
test('daily ETA uses detailed steps, sightseeing stops, a meal and correctly placed short breaks',()=>{
  const value=buildDayTimeline(route(),{places:[stop]},{visitMinutes:60,mealMinutes:30});
  assert.equal(interpolateTime(value.marks,10),1800);
  assert.equal(interpolateTime(value.marks,30),3600); // arrival, before visit/meal
  assert.equal(interpolateTime(value.marks,45),10800);
  assert.equal(value.duration,12600); // two hours moving + one visit + meal
  const long=route();long.legs[1]={...long.legs[1],durationSeconds:7200,planningDurationSeconds:7200,timeTable:[{dist:0,time:0},{dist:15,time:3600},{dist:30,time:7200}]};
  const timeline=buildDayTimeline(long,{places:[]});
  assert.equal(timeline.duration,11700); // pause at exact step boundary, once
  assert.equal(interpolateTime(timeline.marks,60),11700);
});
test('sampling normalizes engine and geometry distances, handles repeated vertices and includes endpoints/stops',()=>{
  const r=route();r.coordinates.splice(1,0,start.coordinates);
  const timeline=buildDayTimeline(r,{places:[stop]});
  const points=sampleWeatherPoints(r,timeline,10000);
  assert.deepEqual(points[0].coordinates,start.coordinates);assert.deepEqual(points.at(-1).coordinates,end.coordinates);
  assert.equal(points.at(-1).distKm,60);assert.equal(points.at(-1).eta,17200);
  assert.ok(points.some(p=>p.name===stop.label));assert.ok(points.every(p=>p.coordinates.every(Number.isFinite)));
  const geo=weatherRouteGeoJSON(r,points.map(p=>({...p,risk:{color:p.distKm<30?'green':'red'}})));
  assert.equal(geo.features.length,2);
  assert.deepEqual(geo.features[0].geometry.coordinates.at(-1),geo.features[1].geometry.coordinates[0]);
});
test('equal-coordinate visits keep their dwell time without duplicate weather locations',()=>{
  const r=route(),day={places:[{...start,id:'departure-visit'},{...stop,id:'same-a'},{...stop,id:'same-b'}]};
  const timeline=buildDayTimeline(r,day,{visitMinutes:90});
  assert.equal(timeline.duration,7200+5400);
  const samples=sampleWeatherPoints(r,timeline,0);
  assert.equal(samples.filter(p=>p.distKm===30).length,1);
  assert.equal(samples.at(-1).eta,12600);
});
test('weather line splits coarse geometry edges so a hazardous endpoint keeps its own color',()=>{
  const r={coordinates:[[105,21],[106,21]],distanceKm:100};
  const data=weatherRouteGeoJSON(r,[{distKm:0,risk:{color:'red'}},{distKm:50,risk:{color:'green'}},{distKm:100,risk:{color:'red'}}]);
  assert.deepEqual(data.features.map(f=>f.properties.color),['red','green','red']);
  assert.deepEqual(data.features[0].geometry.coordinates[0],[105,21]);
  assert.deepEqual(data.features.at(-1).geometry.coordinates.at(-1),[106,21]);
});
test('hourly matching uses UTC intervals: rain and gust maxima are never interpolated',()=>{
  const base=Date.UTC(2026,10,3,7)/1000;
  const h=makeHourly(base,{precipitation:[8,0],precipitation_probability:[80,10],wind_gusts_10m:[70,20]});
  const early=pickWeather(h,base+600);assert.equal(early.precip,8);assert.equal(early.gust,70);
  const late=pickWeather(h,base+3000);assert.equal(late.precip,0);assert.equal(late.gust,20);assert.ok(Math.abs(late.temp-(20+4*5/6))<1e-6);
  assert.equal(pickWeather(h,base-1),null);
  assert.equal(pickWeather({...h,precipitation:[0,null]},base+3000),null);
  assert.equal(pickWeather({...h,weather_code:[0,95.5]},base+3000),null);
  assert.equal(pickWeather(makeHourly(base,{weather_code:[95,0]}),base+3000).code,95);
});
test('risk separates rain probability from thunderstorm and never calls missing data favorable',()=>{
  const base={precip:0,probability:10,code:0,gust:10,visibility:10000,complete:true};
  for(const [field,value,expected] of [['precip',0.99,'ok'],['precip',1,'warn'],['precip',5,'danger'],['probability',19,'ok'],['probability',20,'watch'],['probability',40,'warn'],['probability',70,'danger'],['gust',40,'warn'],['gust',60,'danger'],['visibility',199,'warn'],['visibility',999,'watch'],['code',95,'danger']])assert.equal(weatherRisk({...base,[field]:value}).level,expected,`${field}=${value}`);
  assert.notEqual(weatherRisk({...base,probability:90}).label,'Dông');
  assert.equal(weatherRisk({...base,code:66}).level,'warn');
  assert.equal(weatherRisk(null).level,'none');assert.equal(weatherRisk({...base,complete:false,gust:null}).level,'none');
  assert.match(weatherSummary([{weather:null,risk:weatherRisk(null)}]).text,/chưa đầy đủ/);
  const possibleRain={...base,probability:24};
  assert.match(weatherSummary([{weather:possibleRain,risk:weatherRisk(possibleRain)}]).text,/cần lưu ý/);
});
test('weather client batches locations, preserves partial failures, caches and propagates cancellation',async()=>{
  const now=Date.now()/1000,base=Math.ceil(now/3600)*3600;
  const points=Array.from({length:17},(_,i)=>({id:String(i),coordinates:[105.1234+i/1000,21],eta:base+1800,distKm:i}));
  let calls=0;
  const fetchImpl=async url=>{
    calls++;const p=new URL(url,'http://localhost').searchParams;
    if(p.get('latitudes').split(',').length===2)return {ok:false,status:503};
    return {ok:true,json:async()=>({forecasts:p.get('latitudes').split(',').map(()=>({hourly:makeHourly(base)})),fetchedAt:Date.now()})};
  };
  const result=await loadRouteWeather(points,{fetchImpl,now});assert.equal(calls,2);assert.equal(result.points.filter(p=>p.weather).length,15);assert.equal(result.errors.length,1);
  calls=0;await loadRouteWeather(points.slice(0,15),{fetchImpl,now});assert.equal(calls,0);
  assert.throws(()=>forecastWindow([{eta:now+8*86400}],now),/7 ngày/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadRouteWeather(points,{fetchImpl,now,signal:controller.signal}),{name:'AbortError'});
});
test('weather day routing respects overnight/return points and never routes other days',async()=>{
  const origin={...start},hotel={label:'Khách sạn',coordinates:[106,21]},other={label:'Tỉnh',coordinates:[106.2,21.5]};let calls=0;
  const trip={origin:origin.label,originPoint:origin,destination:other,returnToOrigin:true,itinerary:[{id:'d1',places:[],planning:{lodgingPoint:hotel}},{id:'d2',places:[stop]}]};
  const data=await loadWeatherDayRoute(trip,1,undefined,{resolve:async p=>p,routeLoader:async(a,b,signal,points)=>{calls++;assert.deepEqual(a,hotel);assert.deepEqual(b,origin);assert.equal(points[0].id,stop.id);return route();}});
  assert.equal(calls,1);assert.equal(data.lodgingAssumed,false);
  trip.itinerary[1].places=[{name:'Chưa chọn ghim'}];
  await assert.rejects(loadWeatherDayRoute(trip,1),/Bổ sung vị trí/);assert.equal(calls,1);
});
