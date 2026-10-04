import test from 'node:test';
import assert from 'node:assert/strict';
import {chosenOrigin} from '../src/origin-data.js';
import {originAreaResult,resolveOriginArea} from '../src/origin-area.js';
import {startIntake,withIntakeOrigin,intakeQuestion,intakeContext} from '../src/assistant-intake.js';
const coordinates=[105.85,21.03];
const feature=(properties,point=coordinates)=>({properties:{countrycode:'VN',...properties},geometry:{coordinates:point}});
test('GPS reverse lookup preserves exact coordinates and advances intake without asking area again',async()=>{
 let url;
 const point=await chosenOrigin(coordinates,{source:'gps',accuracy:15,resolveArea:true,fetchImpl:async input=>{url=new URL(input);return new Response(JSON.stringify({features:[feature({district:'Hoàn Kiếm',city:'Hà Nội',state:'Hà Nội'})]}));}});
 assert.equal(url.pathname,'/reverse');assert.equal(url.searchParams.get('lat'),'21.03');assert.equal(url.searchParams.get('lon'),'105.85');
 assert.deepEqual(point.coordinates,coordinates);assert.equal(point.accuracy,15);assert.equal(point.source,'gps');assert.equal(point.label,'Hoàn Kiếm, Hà Nội');assert.equal(point.area,'Hà Nội');
 const intake=withIntakeOrigin(startIntake('Lập lịch 3N2Đ ở Cao Bằng'),{origin:point.label,originPoint:point});
 assert.equal(intakeQuestion(intake).key,'date');assert.equal(intakeContext(intake).origin,'Hoàn Kiếm, Hà Nội');assert.equal(intakeContext(intake).originPoint,undefined);
});
test('nearest domestic result needs an administrative area, not a venue name',()=>{
 assert.equal(originAreaResult([feature({name:'Quán cà phê',osm_value:'cafe'})],coordinates),null);
 assert.equal(originAreaResult([feature({countrycode:'CN',state:'China'})],coordinates),null);
 assert.equal(originAreaResult([feature({state:'Cao Bằng'},[106.25,22.67])],coordinates),null);
 assert.equal(originAreaResult([feature({city:'Hà Nội'})],coordinates).area,'Hà Nội');
});
test('lookup failures keep usable GPS and ask area manually; lookup is not repeated',async()=>{
 const raw=await chosenOrigin(coordinates,{source:'gps'});
 const point=await resolveOriginArea(raw,{fetchImpl:async()=>{throw new Error('offline');}});
 assert.deepEqual(point.coordinates,coordinates);assert.equal(point.label,raw.label);assert.equal(point.area,undefined);
 const intake=withIntakeOrigin(startIntake('3N2Đ ở Cao Bằng'),{origin:point.label,originPoint:point});assert.equal(intakeQuestion(intake).key,'originArea');
 assert.deepEqual(await resolveOriginArea(point,{fetchImpl:()=>{throw new Error('Must not retry');}}),point);
 assert.equal(withIntakeOrigin(intake,{origin:'Hải Phòng',originPoint:null}).originArea,'');
});
test('configured Photon base path is respected and aborted lookup cannot advance intake',async()=>{
 const point=await chosenOrigin(coordinates);let url;
 await resolveOriginArea(point,{geocoder:'https://example.test/photon/api/',fetchImpl:async input=>{url=new URL(input);return new Response('{"features":[]}');}});assert.equal(url.pathname,'/photon/reverse');
 const controller=new AbortController();controller.abort();await assert.rejects(resolveOriginArea(point,{signal:controller.signal,fetchImpl:async(_,options)=>{options.signal.throwIfAborted();}}));
});
