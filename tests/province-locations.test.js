import test from 'node:test';
import assert from 'node:assert/strict';
import {provinceLocation,provinceLocations,provinceMapUrl} from '../src/province-locations.js';
import {provinces} from '../src/provinces.js';
import {vietnam} from '../src/vietnam-guard.js';
import {geocode,chooseLocation} from '../src/route-data.js';
import {requestedPlaces,answerIntake,startIntake} from '../src/assistant-intake.js';
import {normalizeDraftRequest,generateDraft} from '../server/draft-api.js';
import {basicDraft} from '../src/assistant-draft.js';

test('all 34 province pins are domestic and have source links and matching map coordinates',()=>{
  assert.deepEqual(provinceLocations.map(p=>p.name),provinces);
  for(const p of provinceLocations){
    assert.ok(vietnam.containsPoint(p.coordinates),p.name);
    assert.match(p.source,/^https:\/\/www.openstreetmap.org\/(node|way|relation)\/\d+$/);
    const url=new URL(provinceMapUrl(p));
    assert.equal(Number(url.searchParams.get('mlat')),p.coordinates[1]);
    assert.equal(Number(url.searchParams.get('mlon')),p.coordinates[0]);
  }
  assert.ok(provinceLocation('Ninh Bình').coordinates[1]>20);
});
test('known region pins work without network, detailed addresses are not replaced',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw new Error('offline');});
  for(const name of ['Cao Bằng','Lạng Sơn','tỉnh Cao Bằng','lang son','HN','TP.HCM']){
    assert.deepEqual((await geocode(name)).coordinates,provinceLocation(name).coordinates);
  }
  for(const name of ['Thác Bản Giốc, Cao Bằng','12 Trần Phú, Lạng Sơn','Khách sạn Hà Nội'])assert.equal(provinceLocation(name),null);
  await assert.rejects(geocode('12 Trần Phú, Lạng Sơn'),/offline/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(geocode('Cao Bằng',controller.signal),{name:'AbortError'});
});
test('requests strip conversational suffixes and canonicalize only complete region names',()=>{
  for(const prompt of ['Lên kế hoạch từ Cao Bằng đến Lạng Sơn cho tôi','len ke hoach tu cao bang den lang son giup minh nhe','Từ tỉnh Cao Bằng tới thành phố Lạng Sơn cho mình nhé','Từ Cao Bằng đi Lạng Sơn trong 3 ngày, không quay về','Cao Bằng → Lạng Sơn cho tôi']){
    assert.deepEqual(requestedPlaces(prompt),{origin:'Cao Bằng',destination:'Lạng Sơn'},prompt);
  }
  assert.deepEqual(requestedPlaces('Lên lịch từ 12 Trần Phú, Cao Bằng đến Động Tam Thanh, Lạng Sơn cho tôi'),{origin:'12 Trần Phú, Cao Bằng',destination:'Động Tam Thanh, Lạng Sơn'});
  assert.equal(requestedPlaces('Lên lịch ở Lạng Sơn giúp tôi nhé').destination,'Lạng Sơn');
  assert.equal(answerIntake(startIntake(''),{key:'destination'},'Lạng Sơn cho tôi').destination,'Lạng Sơn');
});
test('province searches reject same-name villages and lower-level administrative areas',()=>{
  const feature=(key,value,level)=>({properties:{name:'Ninh Bình',countrycode:'VN',osm_key:key,osm_value:value,extra:{admin_level:level}},geometry:{coordinates:[108.78,11.77]}});
  assert.equal(chooseLocation([feature('place','village')],'Ninh Bình'),undefined);
  assert.equal(chooseLocation([feature('boundary','administrative','8')],'Ninh Bình'),undefined);
});
test('backend enforces parsed endpoints even when model returns a corrupted place name',async()=>{
  const message='Lên kế hoạch từ Cao Bằng đến Lạng Sơn cho tôi';
  const payload=normalizeDraftRequest({message});
  assert.deepEqual(payload.context,{origin:'Cao Bằng',destination:'Lạng Sơn'});
  const draft=basicDraft('3N2Đ HN CB');draft.origin='Cao Bằng';draft.destination='Lạng Sơn cho tôi';
  const result=await generateDraft({message},{apiKey:'test',model:'test',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]}))});
  assert.equal(result.draft.origin,'Cao Bằng');assert.equal(result.draft.destination,'Lạng Sơn');
});
