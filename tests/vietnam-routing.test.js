import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoundaryGuard } from '../src/boundary-geometry.js';
import { vietnam, isDomesticRoute } from '../src/vietnam-guard.js';
import { osrmUrl, parseOsrm } from '../src/osrm-data.js';
import { loadRoute, loadPlaces, searchPlannedCandidates } from '../src/route-data.js';
import { domesticShapingPoints } from '../src/domestic-routing.js';

const hanoi = [105.854, 21.028], haiphong = [106.688, 20.844], foreign = [102.63, 17.97];
const makeRoute = coordinates => ({ distance: 100000, duration: 3600, geometry: { coordinates }, legs: [{ distance: 100000, duration: 3600, steps: [{ geometry: { coordinates } }] }] });
const geocodeResponse = name => ({ features: [{ properties: { name, countrycode: 'VN', osm_key: 'place', osm_value: 'city' }, geometry: { coordinates: name === 'Hà Nội' ? hanoi : haiphong } }] });

test('Country geometry includes domestic cities/islands and rejects neighboring countries', () => {
  for (const point of [hanoi, haiphong, [106.7, 10.77], [108.2, 16.06], [104.0, 10.22], [107.05, 20.72]]) assert.equal(vietnam.containsPoint(point), true, String(point));
  for (const point of [foreign, [104.92, 11.56], [108.32, 22.82], [100.5, 13.75], [105.85, 24], [NaN, 21]]) assert.equal(vietnam.containsPoint(point), false, String(point));
});

test('A segment cannot cross a foreign hole or concave border even with domestic endpoints', () => {
  const square = [[0,0],[10,0],[10,10],[0,10],[0,0]], hole = [[4,4],[6,4],[6,6],[4,6],[4,4]];
  const guard = createBoundaryGuard({ type: 'Polygon', coordinates: [square, hole] });
  assert.equal(guard.containsLine([[1,5],[9,5]]), false);
  assert.equal(guard.containsLine([[1,3],[9,3]]), true);
  assert.equal(guard.containsLine([[0,0],[10,0]]), true);
  assert.equal(guard.containsPoint([5,5]), false);
  const concave = createBoundaryGuard({ type:'Polygon', coordinates: [[[0,0],[10,0],[10,10],[6,10],[6,4],[4,4],[4,10],[0,10],[0,0]]] });
  assert.equal(concave.containsLine([[2,8],[8,8]]), false);
  const islands = createBoundaryGuard({ type:'MultiPolygon', coordinates: [[square], [[[20,0],[21,0],[21,1],[20,1],[20,0]]]] });
  assert.equal(islands.containsPoint([20.5,0.5]), true);
  assert.equal(islands.containsLine([[9,0.5],[20.5,0.5]]), false);
});

test('Domestic validation checks full overview and each step geometry, not just endpoints', () => {
  const points = [{ coordinates:hanoi }, { coordinates:haiphong }];
  const parsed = parseOsrm({ code:'Ok', routes:[makeRoute([hanoi,haiphong])] }, points);
  assert.equal(isDomesticRoute(parsed), true);
  assert.equal(isDomesticRoute({ ...parsed, coordinates:[hanoi,foreign,haiphong] }), false);
  assert.equal(isDomesticRoute({ ...parsed, legs:[{ ...parsed.legs[0], coordinates:[hanoi,foreign,haiphong] }] }), false);
  assert.equal(isDomesticRoute({ ...parsed, points:[...points,{coordinates:foreign}] }), false);
});

test('Routing chooses a domestic alternative and never accepts a faster foreign detour', async context => {
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.hostname === 'photon.komoot.io') return {ok:true,json:async()=>geocodeResponse(url.searchParams.get('q'))};
    assert.equal(JSON.parse(url.searchParams.get('json')).costing, 'motorcycle');
    return {ok:true,json:async()=>({code:'Ok',routes:[makeRoute([hanoi,foreign,haiphong]),makeRoute([hanoi,haiphong])]})};
  });
  const route = await loadRoute('Hà Nội','Hải Phòng');
  assert.deepEqual(route.coordinates,[hanoi,haiphong]);
});

test('When all options cross the border, routing rejects instead of drawing an unsafe line', async context => {
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.hostname === 'photon.komoot.io') return {ok:true,json:async()=>geocodeResponse(url.searchParams.get('q'))};
    return {ok:true,json:async()=>({code:'Ok',routes:[makeRoute([hanoi,foreign,haiphong])]})};
  });
  // Different itinerary key avoids the successful previous route cache.
  await assert.rejects(loadRoute('Hà Nội','Hải Phòng',undefined,[{id:'domestic',name:'Stop',coordinates:hanoi}]), /Tuyến đi qua nước ngoài đã bị chặn/);
});

test('Domestic corridor retries a long foreign detour without modifying itinerary stops', async context => {
  const donghoi = [106.623,17.469], via = domesticShapingPoints({coordinates:hanoi},{coordinates:donghoi});
  assert.deepEqual(via.map(p=>p.label), ['Vinh']);
  assert.equal(vietnam.containsLine([hanoi,via[0].coordinates,donghoi]),true);
  let routingRequests=0;
  context.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);
    if(url.hostname==='photon.komoot.io') return {ok:true,json:async()=>({features:[{properties:{name:url.searchParams.get('q'),countrycode:'VN',osm_key:'place',osm_value:'city'},geometry:{coordinates:donghoi}}]})};
    routingRequests++;
    if(routingRequests===1) return {ok:true,json:async()=>({code:'Ok',routes:[makeRoute([hanoi,foreign,donghoi])]})};
    const coordinates=[hanoi,via[0].coordinates,donghoi];
    const legs=coordinates.slice(1).map((p,i)=>({distance:1000,duration:100,steps:[{geometry:{coordinates:[coordinates[i],p]}}]}));
    return {ok:true,json:async()=>({code:'Ok',routes:[{distance:2000,duration:200,geometry:{coordinates},legs}]})};
  });
  const route=await loadRoute('Hà Nội','Đồng Hới');
  assert.equal(routingRequests,2);
  assert.deepEqual(route.routingVia,['Vinh']);
  assert.equal(route.points[1].routingOnly,true);
  assert.equal(isDomesticRoute(route),true);
});

test('Rejected multi-stop routes retry each leg and preserve waypoint order', async context => {
  const middle=[106.0,21.0], stops=[{id:'middle',name:'Middle',coordinates:middle,dayNumber:2}];
  let calls=0;
  context.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);calls++;
    const coordinates=JSON.parse(url.searchParams.get('json')).locations.map(p=>[p.lon,p.lat]);
    const legs=coordinates.slice(1).map((p,i)=>({distance:1000,duration:100,steps:[{geometry:{coordinates:[coordinates[i],p]}}]}));
    return {ok:true,json:async()=>({code:'Ok',routes:[{distance:legs.length*1000,duration:legs.length*100,geometry:{coordinates:calls===1?[hanoi,foreign,haiphong]:coordinates},legs}]})};
  });
  const route=await loadRoute('Hà Nội','Hải Phòng',undefined,stops);
  assert.equal(calls,3); assert.deepEqual(route.points.map(p=>p.coordinates),[hanoi,middle,haiphong]);
  assert.equal(route.legs.length,2); assert.equal(isDomesticRoute(route),true);
  assert.deepEqual(stops,[{id:'middle',name:'Middle',coordinates:middle,dayNumber:2}]);
});

test('A manually saved foreign waypoint is rejected before asking the router', async context => {
  let routingRequests = 0;
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.hostname === 'photon.komoot.io') return {ok:true,json:async()=>geocodeResponse(url.searchParams.get('q'))};
    routingRequests++; throw new Error('Unexpected routing request');
  });
  await assert.rejects(loadRoute('Hà Nội','Hải Phòng',undefined,[{name:'Foreign stop',coordinates:foreign}]), /Foreign stop.*ngoài phạm vi Việt Nam/);
  assert.equal(routingRequests,0);
});

test('Search and support pins cannot expose foreign points labeled VN by a provider', async context => {
  context.mock.method(globalThis,'fetch', async input => {
    const url = new URL(input);
    if (url.hostname === 'photon.komoot.io') return {ok:true,json:async()=>({features:[{properties:{name:'Foreign',countrycode:'VN'},geometry:{coordinates:foreign}}]})};
    return {ok:true,json:async()=>({elements:[{type:'node',id:99,lon:foreign[0],lat:foreign[1],tags:{amenity:'fuel'}}]})};
  });
  assert.deepEqual(await searchPlannedCandidates('Foreign',null),[]);
  const result = await loadPlaces({coordinates:[foreign,[foreign[0]+0.01,foreign[1]]]});
  assert.equal(result.places.length,0);
});

test('A cached route is revalidated and a cached foreign detour is discarded', async context => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const key='osrm:vn-v1:https://router.project-osrm.org/route/v1/driving:["Hà Nội","Hải Phòng",[]]';
  const unsafe=parseOsrm({code:'Ok',routes:[makeRoute([hanoi,foreign,haiphong])]},[{coordinates:hanoi},{coordinates:haiphong}]);
  const entries=[[key,{expires:Date.now()+60000,data:unsafe}]];
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify(entries),setItem(){}}});
  context.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
  let requests=0;
  context.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input); requests++;
    return {ok:true,json:async()=>url.hostname==='photon.komoot.io'?geocodeResponse(url.searchParams.get('q')):{code:'Ok',routes:[makeRoute([hanoi,haiphong])]}};
  });
  const fresh=await import('../src/route-data.js?domestic-cache-regression');
  const route=await fresh.loadRoute('Hà Nội','Hải Phòng');
  assert.equal(requests,3); assert.deepEqual(route.coordinates,[hanoi,haiphong]);
});
