import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDailyRoute,evaluateTrip,cleanDayPlanning} from '../src/trip-feasibility.js';
import {matchingAttractions,cleanStopLocations,locationKey} from '../src/attraction-location.js';
import {confirmDraft,basicDraft} from '../src/assistant-draft.js';
test('coordinates attach to confirmed stops and disappear after changing destination or name',()=>{
  const draft=basicDraft('3N2Đ từ HN đi CB'),name='Thác Bản Giốc',key=locationKey(name,'Cao Bằng');
  draft.stopLocations={[key]:{requestedName:name,destination:'Cao Bằng',coordinates:[106.72,22.85],confirmed:true,address:'Trùng Khánh, Cao Bằng'}};
  const details={date:'2026-10-15',departure:'06:00',origin:'Hà Nội',people:1,vehicles:1};
  assert.deepEqual(confirmDraft(draft,details).itinerary[1].places[0].coordinates,[106.72,22.85]);
  assert.equal(confirmDraft(draft,{...details,destination:'Hà Giang'}).itinerary[1].places[0].coordinates,undefined);
  assert.deepEqual(cleanStopLocations(draft.stopLocations,'Cao Bằng',['Tên mới']),{});
});
test('exact attraction matching never promotes city or approximate name to attraction',()=>{
  const point={coordinates:[106,22],name:'Động Ngườm Ngao',kind:'tourism',subtype:'attraction'};
  assert.equal(matchingAttractions('Động Ngườm Ngao',[point,{...point,kind:'place',subtype:'city'},{...point,name:'Nhà hàng Ngườm Ngao'}]).length,1);
  assert.equal(matchingAttractions('Thác Bản Giốc',[{...point,name:'Thác Bản Giốc',kind:'natural',subtype:'cliff'}]).length,0);
  assert.equal(matchingAttractions('Thác Bản Giốc',[{...point,name:'Thác Bản Giốc',kind:'waterway',subtype:'waterfall'}]).length,1);
});
test('riding limit and finish time include sightseeing, meal and rest assumptions',()=>{
  const d={places:[{},{}],planning:{departure:'06:00',finishBy:'18:00'}},route={estimate:{moving:8*3600,rest:3600}};
  const r=assessDailyRoute(d,route,{hours:6,avoidDark:'yes'});
  assert.equal(r.totalMinutes,720);assert.equal(r.issues.length,1);
  const overloaded=assessDailyRoute({...d,planning:{...d.planning,visitMinutes:240}},route,{hours:6,avoidDark:'yes'});
  assert.equal(overloaded.issues.length,2);assert.equal(overloaded.arrivalMinutes,1200);
});
test('unknown attraction coordinate is reported instead of producing partial verified ETA',async()=>{
  const origin={label:'Hà Nội',coordinates:[105.85,21.03]};
  // No network is needed when both endpoints are already known coordinates.
  const result=await evaluateTrip({origin:origin.label,originPoint:origin,destination:{label:'Cao Bằng',coordinates:[106.1,22.7]},returnToOrigin:true,itinerary:[{id:'d1',places:[{name:'Unknown'}]}]});
  assert.match(result[0].error,/Unknown/);assert.equal(result[0].assessment,undefined);assert.deepEqual(result[0].end.coordinates,origin.coordinates);
});
test('planning data rejects invalid clocks, time values and extra fields',()=>{
  assert.deepEqual(cleanDayPlanning({departure:'25:00',visitMinutes:-1,mealMinutes:2000,secret:'no',finishBy:'18:00'}),{finishBy:'18:00'});
});
test('daily routing includes the return origin, sightseeing order and overnight transitions',async t=>{
  const a={label:'Hà Nội',coordinates:[105.85,21.03]},b={label:'Cao Bằng',coordinates:[106.1,22.7]},c={label:'Nơi nghỉ',coordinates:[106.11,22.71]};
  const requests=[];
  t.mock.method(globalThis,'fetch',async input=>{
    const json=JSON.parse(new URL(input).searchParams.get('json')),points=json.locations.map(p=>[p.lon,p.lat]);requests.push(points);
    const legs=points.slice(1).map((p,i)=>({distance:10000,duration:1200,steps:[{name:'Quốc lộ',geometry:{coordinates:[points[i],p]}}]}));
    return {ok:true,json:async()=>({code:'Ok',routes:[{distance:legs.length*10000,duration:legs.length*1200,geometry:{coordinates:points},legs}]})};
  });
  const result=await evaluateTrip({origin:a.label,originPoint:a,destination:b,returnToOrigin:true,itinerary:[
    {id:'first',places:[],planning:{lodgingPoint:c}},
    {id:'last',places:[{name:'Điểm ghé',coordinates:[106.12,22.72]}]},
  ]});
  assert.deepEqual(requests[0],[a.coordinates,c.coordinates]);
  assert.deepEqual(requests[1],[c.coordinates,[106.12,22.72],a.coordinates]);
  assert.equal(result[0].lodgingAssumed,false);assert.equal(result[1].assessment.visitMinutes,60);
});
