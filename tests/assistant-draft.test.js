import test from 'node:test';
import assert from 'node:assert/strict';
import {basicDraft,validateDraft,cleanDraft,confirmDraft,draftCosts} from '../src/assistant-draft.js';
import {isStoredTrip} from '../src/trip-data.js';
import {generateDraft,normalizeDraftRequest} from '../server/draft-api.js';
const prompt='Cho tôi lịch trình 3N2Đ từ HN - CB gồm điểm chơi nghỉ phí vé đồ chuẩn bị';
const details={date:'2026-10-15',departure:'06:30',origin:'Hà Nội',people:'2',vehicles:'1'};
test('confirmation accepts an explicitly supplied missing destination and gives actionable errors',()=>{
 const draft={...basicDraft(prompt),destination:'Chưa xác định'};
 assert.throws(()=>confirmDraft(draft,details),/điểm đến/);
 const trip=confirmDraft(draft,{...details,destination:'Cao Bằng'});
 assert.equal(trip.destination,'Cao Bằng');assert.equal(trip.aiDraft.destination,'Cao Bằng');
 assert.ok(isStoredTrip(trip));
 assert.throws(()=>confirmDraft(draft,{...details,destination:'Cao Bằng',people:'3'}),/mỗi xe tối đa 2 người/);
});
test('complete draft works with no existing plan; costs remain unknown',()=>{
 const draft=basicDraft(prompt);assert.ok(validateDraft(draft));assert.equal(draft.days.length,3);
 assert.equal(draft.origin,'Hà Nội');assert.equal(draft.destination,'Cao Bằng');
 assert.ok(draft.days[1].stops.includes('Thác Bản Giốc'));assert.ok(draft.checklist.length);
 assert.ok(draftCosts(draft).every(f=>f.value==='Chưa xác minh'));
 assert.equal(basicDraft('4 ngày từ HN đi CB'),null);
});
test('confirmation preserves edits, return day, checklist and unknown facts without mutating draft',()=>{
 const draft=basicDraft(prompt);draft.days[1].stops=['Động Ngườm Ngao'];draft.days[1].morning='Nghỉ thêm rồi mới đi';
 const snapshot=JSON.stringify(draft),trip=confirmDraft(draft,details);
 assert.ok(isStoredTrip(trip));assert.equal(JSON.stringify(draft),snapshot);
 assert.deepEqual(trip.itinerary[1].places.map(p=>p.name),['Động Ngườm Ngao']);
 assert.match(trip.itinerary[1].note,/Nghỉ thêm/);assert.equal(trip.itinerary[0].rideReview.departure,'06:30');
 assert.equal(trip.aiDraft.routeVerified,false);assert.equal(trip.checklist.length,draft.checklist.length);
 assert.ok(!trip.itinerary[1].places[0].coordinates);
 assert.notEqual(confirmDraft(draft,details).id,trip.id);
});
test('confirmation rejects impossible dates, missing details, overcapacity and invalid drafts',()=>{
 const draft=basicDraft(prompt);
 for(const patch of [{date:'2026-02-30'},{date:'bad'},{departure:'25:00'},{origin:''},{people:'3',vehicles:'1'},{vehicles:'0'}])assert.throws(()=>confirmDraft(draft,{...details,...patch}));
 assert.throws(()=>cleanDraft({...draft,days:[]}));assert.throws(()=>cleanDraft({...draft,days:Array(8).fill(draft.days[0])}));
 assert.throws(()=>confirmDraft({...draft,destination:'Chưa xác định'},details));
});
test('draft API preserves previous draft context, uses structured output and strips extra properties',async()=>{
 const draft=basicDraft(prompt);let sent;
 const result=await generateDraft({message:'Bỏ Bản Giốc',previous:draft},{apiKey:'test',model:'test',fetchImpl:async(_,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...draft,evil:'ignored'})}]}]}));}});
 assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.deepEqual(JSON.parse(sent.input).previous,draft);assert.equal(result.draft.evil,undefined);
 assert.throws(()=>normalizeDraftRequest({message:'x',previous:{}}));
 assert.throws(()=>normalizeDraftRequest({message:'x'.repeat(2001)}));
});
test('draft API rejects incomplete and malformed model results',async()=>{
 for(const body of [{status:'incomplete'},{status:'completed',output:[]},{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]}])await assert.rejects(generateDraft({message:prompt},{apiKey:'test',model:'test',fetchImpl:async()=>new Response(JSON.stringify(body))}));
});
