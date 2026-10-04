import test from 'node:test';
import assert from 'node:assert/strict';
import { motorcycleUrl, highwaySteps, ridingEstimate, applyRidingEstimate, travelTime } from '../src/motorcycle-routing.js';
import { loadRoute } from '../src/route-data.js';
test('Motorcycle request preserves stop order and requests highway avoidance', () => {
  const points = [{coordinates:[105,21]},{coordinates:[106,22]}];
  const payload = JSON.parse(motorcycleUrl('https://example.com/route', points).searchParams.get('json'));
  assert.equal(payload.costing,'motorcycle');assert.equal(payload.costing_options.motorcycle.exclude_highways,true);
  assert.equal(payload.costing_options.motorcycle.top_speed,60);
  assert.equal(payload.costing_options.motorcycle.use_highways,0.5);
  assert.equal(payload.costing_options.motorcycle.use_tolls,0.5);
  assert.deepEqual(payload.locations.map(p=>[p.lon,p.lat]),points.map(p=>p.coordinates));
});
test('Fast provider estimates cannot imply a planning average above 40 km/h',()=>{
  const estimate=ridingEstimate(280,3.6*3600);
  assert.equal(estimate.moving,7*3600);assert.equal(estimate.rest,45*60);
  assert.equal(ridingEstimate(280,9*3600).moving,9*3600);
  assert.equal(ridingEstimate(0,0).rest,0);
  const result=applyRidingEstimate({distanceKm:280,durationSeconds:100,legs:[{distanceKm:100,durationSeconds:20},{distanceKm:180,durationSeconds:80}]});
  assert.equal(result.durationSeconds,result.legs.reduce((s,l)=>s+l.durationSeconds,0));
  assert.equal(result.durationSeconds,100,'Provider ETA must not be overwritten by planning assumptions');
  assert.equal(result.legs[0].durationSeconds,20);
  assert.equal(result.legs[0].planningDurationSeconds,9000);
  assert.equal(result.estimate.moving,7*3600);
  assert.equal(travelTime(3599),'1 giờ 0 phút');
});
test('Highway detection covers name, ref and motorway classification',()=>{
  for(const step of [{name:'Đường cao tốc Hà Nội'},{ref:'QL.1; CT.07'},{intersections:[{classes:['motorway']}]}])assert.equal(highwaySteps({legs:[{steps:[step]}]}).length,1);
  assert.equal(highwaySteps({legs:[{steps:[{name:'Quốc lộ 3'}]}]}).length,0);
});
test('Routing excludes returned highways and rejects persistent highway routes',async t=>{
  const a={label:'Start',coordinates:[105.854,21.028]},b={label:'End',coordinates:[106,21]};let calls=0;
  t.mock.method(globalThis,'fetch',async input=>{
    calls++;const payload=JSON.parse(new URL(input).searchParams.get('json'));
    if(calls>1)assert.ok(payload.exclude_locations.length);
    return {ok:true,json:async()=>({code:'Ok',routes:[{distance:100000,duration:1000,geometry:{coordinates:[a.coordinates,b.coordinates]},legs:[{distance:100000,duration:1000,steps:[{name:'Đường cao tốc',geometry:{coordinates:[a.coordinates,b.coordinates]}}]}]}]})};
  });
  await assert.rejects(loadRoute(a,b),/cao tốc/);assert.equal(calls,3);
});

test('A valid domestic motorcycle route does not wait for alternative routes', async t => {
  const a = {label:'Route start',coordinates:[105.855,21.029]};
  const b = {label:'Route end',coordinates:[106.001,21.001]};
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async input => {
    calls++;
    const payload = JSON.parse(new URL(input).searchParams.get('json'));
    assert.equal(payload.alternates, 0);
    assert.equal(payload.costing, 'motorcycle');
    assert.equal(payload.costing_options.motorcycle.exclude_highways, true);
    const coordinates = [a.coordinates, b.coordinates];
    return {ok:true,json:async()=>({code:'Ok',routes:[{distance:10000,duration:1200,geometry:{coordinates},legs:[{distance:10000,duration:1200,steps:[{geometry:{coordinates}}]}]}]})};
  });
  const route = await loadRoute(a, b);
  assert.equal(calls, 1);
  assert.deepEqual(route.coordinates, [a.coordinates,b.coordinates]);
});
