import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationAttractions,validateDestinationDraft,attractionRequests} from '../server/destination-attractions.js';
import {generateDraft} from '../server/draft-api.js';
import {cleanDraft,basicDraft} from '../src/assistant-draft.js';
import {relevantAttractions,cleanDestinationAttractions} from '../src/attraction-location.js';

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
