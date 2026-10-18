import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationAttractions,validateDestinationDraft,attractionRequests} from '../server/destination-attractions.js';
import {generateDraft,normalizeDraftRequest} from '../server/draft-api.js';
import {cleanDraft,basicDraft} from '../src/assistant-draft.js';
import {relevantAttractions,cleanDestinationAttractions} from '../src/attraction-location.js';
import {destinations,suggestionsFor} from '../src/trip-data.js';
import {requestAssistant} from '../src/assistant-client.js';

const poi={type:'node',id:123,lon:106.75,lat:21.95,tags:{name:'Động Tam Thanh',tourism:'attraction'}};
const localDraft=()=>({...basicDraft('3N2Đ HN-CB'),origin:'Hà Nội',destination:'Lạng Sơn',summary:'Đi và về Hà Nội, tham quan Lạng Sơn.',assumptions:[],warnings:[],days:[
 {title:'Hà Nội → Lạng Sơn',morning:'Di chuyển đến Lạng Sơn; chưa tính tuyến.',afternoon:'Nghỉ ngơi.',evening:'Ăn tối tại nơi nghỉ.',lodging:'Khu vực Lạng Sơn.',stops:[]},
 {title:'Khám phá Lạng Sơn',morning:'Tham quan Động Tam Thanh.',afternoon:'Nghỉ theo sức chạy.',evening:'Nghỉ tại Lạng Sơn.',lodging:'Khu vực Lạng Sơn.',stops:['Động Tam Thanh']},
 {title:'Lạng Sơn → Hà Nội',morning:'Trả phòng, chuẩn bị về.',afternoon:'Trở về Hà Nội.',evening:'Giờ về chưa tính.',lodging:'Không bố trí thêm đêm nghỉ.',stops:[]},
]});
const response=draft=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]}));

test('requested point lookup queries the Lang Son polygon, excludes lodging/foreign/duplicate POIs and caches',async()=>{
 let calls=0;
 const fetchImpl=async url=>{calls++;const query=new URL(url).searchParams.get('data');assert.match(query,/rel\(5522596\)/);assert.match(query,/area.destination/);
  const requested={...poi,tags:{name:'Đền Kỳ Cùng',tourism:'attraction'}};
  return new Response(JSON.stringify({elements:[requested,{...requested,id:124},{...requested,id:125,lon:116,lat:40},{...poi,id:126,tags:{name:'Hostel',tourism:'hostel'}}]}));};
 const options={fetchImpl,requestedNames:['Đền Kỳ Cùng']};
 const found=await destinationAttractions('Lạng Sơn',options);
 assert.ok(found.places.includes('Đền Kỳ Cùng'));assert.match(found.items[0].source,/node\/123$/);
 await destinationAttractions('Lạng Sơn',options);assert.equal(calls,1);
});
test('unavailable tourism lookup uses only sourced destination names and never another region template',async()=>{
 const fetchImpl=async()=>{throw new Error('offline');};
 assert.deepEqual((await destinationAttractions('Lạng Sơn',{fetchImpl})).places,['Động Tam Thanh','Động Nhị Thanh','Núi Tô Thị','Thành nhà Mạc']);
 await assert.rejects(destinationAttractions('Địa điểm chưa rõ',{fetchImpl}),e=>e.code==='AI_DESTINATION_DATA_UNAVAILABLE');
});
test('AI receives only destination attractions and required point; original coordinates survive frontend cleaning',async()=>{
 let input;
 const result=await generateDraft({message:'Từ Hà Nội đến Lạng Sơn, ghé Đền Kỳ Cùng',context:{origin:'Hà Nội',destination:'Lạng Sơn',days:3,departure:'00:00',avoidDark:'yes'}},{apiKey:'test',model:'test',fetchImpl:async(url,init)=>{
  if(url.includes('overpass'))return new Response(JSON.stringify({elements:[{...poi,tags:{name:'Đền Kỳ Cùng',tourism:'attraction'}}]}));
  input=JSON.parse(JSON.parse(init.body).input);const draft=localDraft();draft.days[1].stops.push('Đền Kỳ Cùng');return response(draft);
 }});
 assert.equal(input.catalog.name,'Lạng Sơn');assert.ok(input.catalog.places.includes('Động Tam Thanh'));assert.deepEqual(input.catalog.required,['Đền Kỳ Cùng']);
 assert.ok(!JSON.stringify(input.catalog).includes('Bản Giốc'));
 const clean=cleanDraft(result.draft);
 assert.deepEqual(clean.destinationAttractions.items[0].coordinates,[106.75,21.95]);
 assert.match(clean.warnings.join(' '),/ban đêm/);
});
test('default famous landmarks need no Overpass lookup and excluded places are not suggested',async()=>{
 let called=false;
 const result=await destinationAttractions('Ninh Bình',{fetchImpl:async()=>{called=true;throw new Error('Should not query arbitrary POIs');}});
 assert.equal(result.mode,'famous');assert.ok(result.places.includes('Tràng An'));assert.match(result.source,/vietnam.travel/);assert.equal(called,false);
 const requests=attractionRequests({message:'Bỏ Động Tam Thanh',context:{preferences:'Muốn ghé Động Nhị Thanh'}});
 assert.deepEqual(requests.exclude,['Động Tam Thanh']);assert.deepEqual(requests.include,['Động Nhị Thanh']);
 const selected=await destinationAttractions('Lạng Sơn',{requestedNames:requests.include,excludedNames:requests.exclude});
 assert.ok(!selected.places.includes('Động Tam Thanh'));assert.deepEqual(selected.required,['Động Nhị Thanh']);
 assert.deepEqual(attractionRequests({message:'Không muốn ghé Bản Giốc'}).exclude,['Thác Bản Giốc']);
 const missing=localDraft();missing.days.forEach(d=>{d.stops=[];});
 assert.throws(()=>validateDestinationDraft(missing,{...selected,required:['Động Nhị Thanh']},'Hà Nội'),e=>e.code==='AI_REQUESTED_PLACE_MISSING');
 await assert.rejects(destinationAttractions('Lạng Sơn',{requestedNames:['Địa điểm chưa có'],fetchImpl:async()=>{throw new Error('offline');}}),e=>e.code==='AI_REQUESTED_PLACE_UNAVAILABLE');
});
test('wrong-region attractions and whole-day excursions in prose are blocked, not relabeled as destination B',()=>{
 const selection={name:'Lạng Sơn',places:['Động Tam Thanh']};
 assert.doesNotThrow(()=>validateDestinationDraft(localDraft(),selection,'Hà Nội'));
 const wrong=localDraft();wrong.days[1].stops=['Thác Bản Giốc'];
 assert.throws(()=>validateDestinationDraft(wrong,selection,'Hà Nội'),e=>e.code==='AI_DESTINATION_MISMATCH');
 const prose=localDraft();prose.days[1].afternoon='Đến Hà Giang thăm Phố cổ Đồng Văn.';
 assert.throws(()=>validateDestinationDraft(prose,selection,'Hà Nội'),e=>e.code==='AI_DESTINATION_MISMATCH');
});
test('candidate list rejects a stadium, hostel, unrelated parks and correct names in other provinces',()=>{
 const p={name:'Động Tam Thanh',coordinates:[106.75,21.95],address:'Lạng Sơn',kind:'tourism',subtype:'attraction'};
 const candidates=[p,{...p,name:'Sân vận động thôn Thủ Công',kind:'leisure',subtype:'pitch'}, {...p,address:'Hà Nội'},{...p,subtype:'hostel'},{...p,name:'Vườn quốc gia Bái Tử Long'}];
 assert.deepEqual(relevantAttractions('Động Tam Thanh','Lạng Sơn',candidates),[p]);
 assert.equal(cleanDestinationAttractions({destination:'Cao Bằng',items:[p]},'Lạng Sơn'),null);
});

test('the exact Hanoi–Hai Phong request reaches AI with a sourced Hai Phong catalog without map lookup',async()=>{
 const message='Tạo cho tôi chuyến đi 3 ngày 2 đêm từ Hà Nội đến Hải Phòng';
 assert.deepEqual(normalizeDraftRequest({message}).context,{origin:'Hà Nội',destination:'Hải Phòng'});
 let calls=0;
 const result=await generateDraft({message,context:{days:3,nights:2}},{apiKey:'test',model:'test',fetchImpl:async(url,init)=>{
  calls++;assert.ok(!url.includes('overpass'));
  const input=JSON.parse(JSON.parse(init.body).input);
  assert.equal(input.catalog.name,'Hải Phòng');
  assert.ok(input.catalog.places.includes('Bãi biển Đồ Sơn'));
  assert.ok(input.catalog.places.includes('Nhà hát lớn Hải Phòng'));
  assert.ok(!input.catalog.places.includes('Thác Bản Giốc'));
  const draft=localDraft();draft.destination='Hải Phòng';draft.summary='Chuyến đi Hà Nội đến Hải Phòng, 3 ngày 2 đêm.';
  draft.days=draft.days.map(day=>({...day,title:'Hà Nội → Hải Phòng',morning:'Tham quan Nhà hát lớn Hải Phòng.',afternoon:'Dạo Hồ Tam Bạc.',evening:'Nghỉ tại Hải Phòng.',lodging:'Hải Phòng',stops:['Nhà hát lớn Hải Phòng','Hồ Tam Bạc']}));
  return response(draft);
 }});
 assert.equal(calls,1);assert.equal(result.draft.destination,'Hải Phòng');assert.equal(result.draft.days.length,3);
 assert.match(cleanDraft(result.draft).landmarkSource.url,/\.haiphong\.gov\.vn\//);
 const selection=await destinationAttractions('Hải Phòng');
 const island=result.draft;island.days[1]={...island.days[1],title:'Khám phá Cát Bà',morning:'Tham quan Vườn quốc gia Cát Bà.',afternoon:'Ghé Động Trung Trang.',lodging:'Cát Bà',stops:['Vườn quốc gia Cát Bà','Động Trung Trang']};
 assert.doesNotThrow(()=>validateDestinationDraft(island,selection,'Hà Nội'));
 island.days[1].afternoon='Đến Hà Giang thăm Phố cổ Đồng Văn.';
 assert.throws(()=>validateDestinationDraft(island,selection,'Hà Nội'),e=>e.code==='AI_DESTINATION_MISMATCH');
});

test('sourced subregions take precedence and every catalog validates its own shared landmarks',async()=>{
 assert.equal(suggestionsFor('Cát Bà, Hải Phòng').name,'Cát Bà');
 for(const destination of destinations){
  const selection=await destinationAttractions(destination.name);
  const draft=localDraft();draft.destination=destination.name;draft.summary=`Khám phá ${destination.name}.`;
  draft.days=draft.days.map(day=>({...day,title:destination.name,morning:selection.places[0],afternoon:selection.places[0],evening:'Nghỉ ngơi.',lodging:destination.name,stops:selection.places.slice(0,5)}));
  assert.doesNotThrow(()=>validateDestinationDraft(draft,selection,'Hà Nội'),destination.name);
 }
});

test('Bac Ninh is supported and older deployed missing-catalog errors remain clear in the client',async()=>{
 assert.ok((await destinationAttractions('Bắc Ninh')).places.includes('Chùa Dâu'));
 const client={auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'user'}}}})}};
 await assert.rejects(requestAssistant({message:'Từ Hà Nội đến Bắc Ninh'},{client,expectedUserId:'user',drafting:true,
  fetchImpl:async()=>({ok:false,json:async()=>({error:'AI_DESTINATION_NOT_SUPPORTED'})})}),/không cần nhập lại tỉnh\/thành/);
 const draft=localDraft();draft.landmarkSource={destination:draft.destination,url:'https://haiphong.gov.vn.evil.test/source'};
 assert.equal(cleanDraft(draft).landmarkSource,undefined);
});


test('the exact compact Hanoi Thanh Hoa request recovers from wrong-region model output without another model call',async()=>{
 const message='Tạo cho tôi chuyến đi 3 ngày 2 đêm Hà Nội Thanh Hóa';
 assert.deepEqual(normalizeDraftRequest({message}).context,{origin:'Hà Nội',destination:'Thanh Hóa'});
 let calls=0;
 const result=await generateDraft({message,context:{days:3,nights:2,date:'2026-11-07',departure:'06:30',people:2,vehicles:1}},{apiKey:'test',model:'test',fetchImpl:async(url,init)=>{
  calls++;const body=JSON.parse(init.body),input=JSON.parse(body.input);
  assert.equal(input.catalog.name,'Thanh Hóa');
  assert.deepEqual(body.text.format.schema.properties.days.items.properties.stops.items.enum,input.catalog.places);
  return response(basicDraft('3N2Đ HN-CB'));
 }});
 assert.equal(calls,1);assert.equal(result.source,'catalog');assert.equal(result.draft.origin,'Hà Nội');assert.equal(result.draft.destination,'Thanh Hóa');assert.equal(result.draft.days.length,3);assert.equal(result.draft.nights,2);
 assert.deepEqual(result.draft.days.flatMap(day=>day.stops),['Thành nhà Hồ','Khu di tích Lam Kinh']);
 assert.ok(!JSON.stringify(result.draft).includes('Bản Giốc'));
 const selection=await destinationAttractions('Thanh Hóa');
 assert.doesNotThrow(()=>validateDestinationDraft(result.draft,selection,'Hà Nội'));
 assert.match(cleanDraft(result.draft).landmarkSource.url,/vietnamtourism/);
});

test('catalog recovery keeps required/excluded local points and the one-way duration',async()=>{
 const wrong=basicDraft('3N2Đ HN-CB');wrong.days=wrong.days.slice(0,2);
 const result=await generateDraft({message:'Từ Hà Nội đến Lạng Sơn, bỏ Động Tam Thanh, ghé Động Nhị Thanh',context:{days:2,nights:1,returnToOrigin:false}},{apiKey:'test',model:'test',fetchImpl:async()=>response(wrong)});
 assert.equal(result.source,'catalog');assert.equal(result.draft.days.length,2);assert.equal(result.draft.returnToOrigin,false);
 const stops=result.draft.days.flatMap(day=>day.stops);assert.ok(stops.includes('Động Nhị Thanh'));assert.ok(!stops.includes('Động Tam Thanh'));
 assert.ok(!result.draft.days.some(day=>day.title==='Lạng Sơn → Hà Nội'));
 assert.match(result.draft.warnings.join(' '),/dựng lại/);
});


test('recovery never substitutes another province for any supported destination',async()=>{
 for(const area of destinations){
  const wrong=localDraft();wrong.days[0].stops=['Địa điểm không thuộc danh sách'];
  const result=await generateDraft({message:'Tạo chuyến đi',context:{origin:'Hà Nội',destination:area.name,days:3,nights:2}},{apiKey:'test',model:'test',fetchImpl:async()=>response(wrong)});
  assert.equal(result.source,'catalog',area.name);assert.equal(result.draft.destination,area.name);
  const selection=await destinationAttractions(area.name);
  assert.ok(result.draft.days.flatMap(day=>day.stops).every(name=>selection.places.includes(name)),area.name);
  assert.doesNotThrow(()=>validateDestinationDraft(result.draft,selection,'Hà Nội'),area.name);
 }
});


test('a sourced full landmark name is not rejected because another province lists a shorter homonym',async()=>{
 const selection=await destinationAttractions('Vĩnh Long');
 const draft=localDraft();draft.destination='Vĩnh Long';draft.summary='Hà Nội đến Vĩnh Long.';
 draft.days=draft.days.map(day=>({...day,title:'Khám phá Vĩnh Long',morning:'Tham quan Văn Thánh Miếu Vĩnh Long.',afternoon:'Ghé Làng gạch Mang Thít.',evening:'Nghỉ ở Vĩnh Long.',lodging:'Vĩnh Long',stops:['Văn Thánh Miếu Vĩnh Long','Làng gạch Mang Thít']}));
 assert.doesNotThrow(()=>validateDestinationDraft(draft,selection,'Hà Nội'));
 draft.days[1].afternoon='Đến Đồng Tháp thăm Văn Thánh Miếu.';
 assert.throws(()=>validateDestinationDraft(draft,selection,'Hà Nội'),e=>e.code==='AI_DESTINATION_MISMATCH');
});
