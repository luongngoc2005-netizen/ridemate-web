import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {routeWeatherMiddleware,weatherQuery} from '../server/route-weather-api.js';
const now=Date.now(),hour=Math.ceil(now/3600000)*3600;
const query=`latitudes=21,21.1&longitudes=105.8,105.9&start=${hour}&end=${hour+7200}`;
async function service(t,options) {
  const middleware=routeWeatherMiddleware(options);
  const server=createServer((req,res)=>middleware(req,res,()=>{res.writeHead(404);res.end();}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  return `http://127.0.0.1:${server.address().port}`;
}
test('weather proxy validates finite bounded batches and time range; arbitrary URLs and extra params are refused',()=>{
  assert.equal(weatherQuery(query,now/1000).latitudes.length,2);
  for(const suffix of ['&url=http://localhost/secret','&latitudes=21','&apikey=private'])assert.throws(()=>weatherQuery(query+suffix,now/1000));
  for(const value of [query.replace('21,21.1','NaN,21'),query.replace('105.8,105.9','1,2'),query.replace('21,21.1','21'),query.replace(String(hour+7200),String(hour+3*86400))])assert.throws(()=>weatherQuery(value,now/1000));
});
test('fixed upstream endpoint, public fields only, shared cache and HTTP status contract',async t=>{
  let calls=0;
  const base=await service(t,{apiKey:'test-private-weather-key',fetchImpl:async input=>{
    calls++;const url=new URL(input);assert.equal(url.origin,'https://customer-api.open-meteo.com');assert.equal(url.searchParams.get('apikey'),'test-private-weather-key');assert.equal(url.searchParams.get('timezone'),'GMT');assert.equal(url.searchParams.get('timeformat'),'unixtime');
    return {ok:true,json:async()=>[0,1].map(()=>({secret:'do not return',hourly:{time:[hour,hour+3600],precipitation:[0,null],private:'do not return'}}))};
  }});
  const response=await fetch(base+'/api/route-weather?'+query);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const result=await response.json();assert.equal(result.forecasts.length,2);assert.deepEqual(result.forecasts[0].hourly.precipitation,[0,null]);assert.equal(JSON.stringify(result).includes('private'),false);
  await fetch(base+'/api/route-weather?'+query);assert.equal(calls,1);
  assert.equal((await fetch(base+'/api/route-weather?'+query+'&url=http://localhost')).status,400);
  assert.equal((await fetch(base+'/api/route-weather?'+query,{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/other')).status,404);
});
test('one retry for transient upstream errors; returned failure does not contain credentials',async t=>{
  let calls=0;
  const base=await service(t,{fetchImpl:async()=>{calls++;return {ok:false,status:503};}});
  const response=await fetch(base+'/api/route-weather?'+query);
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'WEATHER_UNAVAILABLE'});assert.equal(calls,2);
});
