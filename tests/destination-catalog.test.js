import test from 'node:test';
import assert from 'node:assert/strict';
import {destinations,destinationArea,suggestionsFor,foldDestination,trustedLandmarkSource} from '../src/destination-data.js';
import {provinces} from '../src/provinces.js';
import {provinceLocation} from '../src/province-locations.js';
import {requestedPlaces} from '../src/assistant-intake.js';
import {cleanDraft} from '../src/assistant-draft.js';
import {destinationAttractions,validateDestinationDraft,attractionRequests} from '../server/destination-attractions.js';
import {generateDraft} from '../server/draft-api.js';
import {relevantAttractions} from '../src/attraction-location.js';

// Independent list: adding more rows must not conceal a missing province.
const legacyNames='An Giang|Bà Rịa - Vũng Tàu|Bắc Giang|Bắc Kạn|Bạc Liêu|Bắc Ninh|Bến Tre|Bình Định|Bình Dương|Bình Phước|Bình Thuận|Cà Mau|Cao Bằng|Cần Thơ|Đà Nẵng|Đắk Lắk|Đắk Nông|Điện Biên|Đồng Nai|Đồng Tháp|Gia Lai|Hà Giang|Hà Nam|Hà Nội|Hà Tĩnh|Hải Dương|Hải Phòng|Hậu Giang|Hòa Bình|Hồ Chí Minh|Hưng Yên|Khánh Hòa|Kiên Giang|Kon Tum|Lai Châu|Lâm Đồng|Lạng Sơn|Lào Cai|Long An|Nam Định|Nghệ An|Ninh Bình|Ninh Thuận|Phú Thọ|Phú Yên|Quảng Bình|Quảng Nam|Quảng Ngãi|Quảng Ninh|Quảng Trị|Sóc Trăng|Sơn La|Tây Ninh|Thái Bình|Thái Nguyên|Thanh Hóa|Huế|Tiền Giang|Trà Vinh|Tuyên Quang|Vĩnh Long|Vĩnh Phúc|Yên Bái'.split('|');
const byName=name=>destinationArea(name);
const draftFor=area=>({origin:'Hà Nội',destination:area.name,summary:`Khám phá ${area.name}.`,assumptions:[],warnings:[],checklist:['Kiểm tra xe trước khi đi.'],days:[{title:area.name,morning:area.places.join('; '),afternoon:'Nghỉ ngơi.',evening:'Ăn tối gần nơi nghỉ.',lodging:area.name,stops:area.places.slice(0,5)}]});

test('catalog covers exactly 63 legacy provinces and all 34 current administrative names',()=>{
 assert.equal(legacyNames.length,63);
 assert.deepEqual(destinations.filter(d=>d.level==='legacy-province').map(d=>d.name).sort(),legacyNames.slice().sort());
 assert.deepEqual([...new Set(destinations.map(d=>d.currentProvince))].sort(),[...provinces].sort());
 assert.equal(new Set(destinations.map(d=>d.name)).size,destinations.length);
 for(const area of destinations){
  assert.ok(area.places.length>=2,area.name);assert.equal(new Set(area.places.map(foldDestination)).size,area.places.length);
  assert.ok(provinces.includes(area.currentProvince));assert.match(area.verifiedAt,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(trustedLandmarkSource(area.source),true);
  assert.ok(!Object.hasOwn(area,'coordinates'),'No guessed coordinates');
 }
});

test('old names, aliases and subregions retain their tourism scope without replacing route pins',()=>{
 for(const area of destinations){
  assert.equal(suggestionsFor(foldDestination(area.name)).name,area.name);
  assert.equal(destinationArea(`Tỉnh ${area.name}, Việt Nam`).name,area.name);
  if(area.currentProvince!==area.name)assert.equal(suggestionsFor(`${area.name}, ${area.currentProvince}`).name,area.name);
 }
 assert.equal(byName('Thừa Thiên-Huế').name,'Huế');
 assert.equal(byName('TP.HCM').name,'Hồ Chí Minh');
 assert.equal(byName('Bà Rịa–Vũng Tàu').name,'Bà Rịa - Vũng Tàu');
 assert.equal(suggestionsFor('Đà Lạt, Lâm Đồng').name,'Đà Lạt');
 assert.equal(suggestionsFor('Mộc Châu, Sơn La').name,'Mộc Châu');
 assert.equal(suggestionsFor('Hà Nội → Hải Phòng'),undefined);
 assert.equal(suggestionsFor('Hà Nameless'),undefined);
 assert.equal(provinceLocation('Hà Giang'),null,'Old tourism area must not acquire the Tuyen Quang representative pin');
 assert.equal(requestedPlaces('Yên Bái → Hòa Bình').destination,'Hòa Bình');
 assert.equal(requestedPlaces('Từ Hà Nội đến Thừa Thiên Huế').destination,'Huế');
});

test('all catalogs work offline, validate every local landmark and keep source links after frontend cleaning',async()=>{
 for(const area of destinations){
  const selection=await destinationAttractions(area.name,{fetchImpl:async()=>{throw Error('Default catalog must work offline');}});
  assert.deepEqual(selection.places,area.places);
  const draft=draftFor(area);
  assert.doesNotThrow(()=>validateDestinationDraft(draft,selection,draft.origin),area.name);
  draft.landmarkSource={destination:area.name,url:area.source};
  assert.equal(cleanDraft(draft).landmarkSource.url,new URL(area.source).href,area.name);
 }
 assert.equal(trustedLandmarkSource('https://vietnamtourism.vn.evil.test/'),false);
 assert.equal(trustedLandmarkSource('https://evil@vietnamtourism.vn/index.php/tourism/items/1288'),false);
 assert.equal(trustedLandmarkSource('https://vietnamtourism.vn/not-in-catalog'),false);
});

test('administrative mergers never authorize attractions from another legacy tourism area',async()=>{
 for(const [destination,other] of [['Hà Nam','Ninh Bình'],['Hà Giang','Tuyên Quang'],['Bắc Kạn','Thái Nguyên'],['Hải Dương','Hải Phòng'],['Quảng Nam','Đà Nẵng']]){
  const area=byName(destination),selection=await destinationAttractions(destination),draft=draftFor(area);
  draft.days[0].afternoon=`Ghé ${byName(other).places[0]}.`;
  assert.throws(()=>validateDestinationDraft(draft,selection,'Hà Nội'),e=>e.code==='AI_DESTINATION_MISMATCH',destination);
 }
});

test('renamed map addresses need an exact catalog landmark and correct POI type',()=>{
 const p={name:'Hồ Ba Bể',coordinates:[105.61,22.41],address:'Thái Nguyên, Việt Nam',kind:'natural',subtype:'water'};
 const wrong=[{...p,address:'Hà Nội'}, {...p,subtype:'hostel'}, {...p,name:'Hồ Ba Bể giả'}, {...p,name:'Điểm tham quan khác'}];
 assert.deepEqual(relevantAttractions('Hồ Ba Bể','Bắc Kạn',[p,...wrong]),[p]);
 assert.deepEqual(relevantAttractions('Điểm tham quan khác','Bắc Kạn',wrong),[]);
});

test('mocked provider receives only B landmarks for every province, including legacy names',async()=>{
 for(const name of legacyNames){
  const area=byName(name);let calls=0;
  const result=await generateDraft({message:`Tạo chuyến đi từ Hà Nội đến ${name}`,context:{days:1}},{apiKey:'test',model:'mock',fetchImpl:async(url,init)=>{
   calls++;assert.ok(!url.includes('overpass'));
   const input=JSON.parse(JSON.parse(init.body).input);
   assert.equal(input.catalog.name,name);assert.equal(input.catalog.currentProvince,area.currentProvince);
   assert.deepEqual(input.catalog.places,area.places);
   return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draftFor(area))}]}]}));
  }});
  assert.equal(calls,1);assert.equal(result.draft.destination,name);
 }
});

test('endpoint words never become a required landmark through substring or accent folding',()=>{
 for(const name of ['Hưng Yên','Đồng Nai','Đồng Tháp','Cát Bà'])assert.deepEqual(attractionRequests({message:`Từ Hà Nội đến ${name}`}),{include:[],exclude:[]});
 assert.deepEqual(attractionRequests({message:'Từ Hà Nội đến Hưng Yên, ghé Đền Hùng'}).include,['Khu di tích Đền Hùng']);
 assert.deepEqual(attractionRequests({message:'Từ Hà Nội đến Cát Bà, ghé Vườn quốc gia Cát Bà'}).include,['Vườn quốc gia Cát Bà']);
});
