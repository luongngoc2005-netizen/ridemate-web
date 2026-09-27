import test from 'node:test';
import assert from 'node:assert/strict';
import {chosenOrigin,tripOrigin} from '../src/origin-data.js';
import {resolveRoutePoint,directionsUrl,loadTripRoute} from '../src/route-data.js';
import {createTrip,editTripDetails,initialDetails,validDetails,readTrip,saveTrip} from '../src/trip-data.js';
import {completionDraft} from '../src/journal-data.js';
test('selected origin preserves coordinates through trip storage, edits and journal completion',async()=>{
  const point=await chosenOrigin([105.8342,21.0278],{source:'gps',accuracy:24});
  const trip=createTrip({...initialDetails,origin:point.label,originPoint:point});
  assert.equal(tripOrigin(trip).accuracy,24);
  let raw;const storage={setItem:(key,value)=>raw=value,getItem:()=>raw};
  saveTrip(storage,trip);assert.deepEqual(tripOrigin(readTrip(storage).trip).coordinates,point.coordinates);
  assert.deepEqual(tripOrigin(completionDraft(trip,'2026-09-28')).coordinates,point.coordinates);
  const changed=editTripDetails(trip,{...trip,origin:'Hải Phòng',originPoint:null});assert.equal(tripOrigin(changed),'Hải Phòng');
  assert.equal(tripOrigin({...trip,origin:'Hà Nội'}),'Hà Nội');
  assert.equal(validDetails({...trip,originPoint:{coordinates:[NaN,21]}}),false);
  assert.equal(new URL(directionsUrl(tripOrigin(trip),'Hà Giang')).searchParams.get('origin'),'21.0278,105.8342');
});
test('manual and GPS origins outside Vietnam are rejected and explicit coordinates bypass geocoding',async context=>{
  context.mock.method(globalThis,'fetch',()=>{throw new Error('Geocoder must not be called');});
  await assert.rejects(chosenOrigin([100.5018,13.7563]),/Việt Nam/);
  await assert.rejects(resolveRoutePoint({coordinates:[100.5018,13.7563]}),/Việt Nam/);
  const point=await chosenOrigin([105.8342,21.0278]);
  assert.deepEqual((await resolveRoutePoint(point)).coordinates,point.coordinates);
});
test('trip routing sends the selected GPS origin to the motorcycle router, not its display label to Photon',async context=>{
  const start=[105.8342,21.0278],end=[105.85,21.03],point=await chosenOrigin(start);let routed=false;
  context.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);
    if(url.hostname==='photon.komoot.io'){
      assert.equal(url.searchParams.get('q'),'Test destination');
      return {ok:true,json:async()=>({features:[{properties:{name:'Test destination',countrycode:'VN'},geometry:{coordinates:end}}]})};
    }
    routed=true;assert.deepEqual(JSON.parse(url.searchParams.get('json')).locations[0], { lon:start[0], lat:start[1], type:'break' });
    return {ok:true,json:async()=>({code:'Ok',routes:[{distance:2000,duration:300,geometry:{coordinates:[start,end]},legs:[{distance:2000,duration:300,steps:[{geometry:{coordinates:[start,end]}}]}]}]})};
  });
  const route=await loadTripRoute({origin:point.label,originPoint:point,destination:'Test destination',itinerary:[]});
  assert.equal(routed,true);assert.deepEqual(route.start.coordinates,start);
});
