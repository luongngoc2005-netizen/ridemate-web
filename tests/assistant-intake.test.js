import test from 'node:test';
import assert from 'node:assert/strict';
import {startIntake,intakeQuestion,answerIntake,intakeContext,attachIntake,requestedPlaces} from '../src/assistant-intake.js';
import {basicDraft,cleanDraft,confirmDraft} from '../src/assistant-draft.js';
import {normalizeDraftRequest,generateDraft} from '../server/draft-api.js';
import {isStoredTrip} from '../src/trip-data.js';
import {tripOrigin} from '../src/origin-data.js';

const message='Lập lịch trình 3 ngày 2 đêm ở Cao Bằng';
const originPoint={coordinates:[105.85,21.03],label:'Vị trí của tôi',source:'gps',accuracy:10};
const details={origin:'Hà Nội',destination:'Cao Bằng',days:3,nights:2,date:'2026-10-15',departure:'06:30',people:2,vehicles:1,bike:'semi',experience:'new',hours:4,avoidDark:'yes',preferences:'Thiên nhiên, lịch nhẹ',returnToOrigin:true};
const completion=draft=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]}));

test('destination-only requests default to current location without guessing a city',()=>{
  for(const prompt of [message,'Cho tôi lịch trình 3N2Đ tại Cao Bằng','Lên lịch 3 ngày 2 đêm đến Cao Bằng']){
    const intake=startIntake(prompt);
    assert.equal(intake.origin,'');assert.equal(intake.destination,'Cao Bằng');
    assert.equal(intake.days,3);assert.equal(intake.nights,2);assert.equal(intake.returnToOrigin,true);
    assert.equal(intakeQuestion(intake).key,'origin');
  }
  assert.equal(startIntake('Lập lịch trình từ vị trí hiện tại đến Cao Bằng 3N2Đ').origin,'');
  assert.deepEqual(requestedPlaces('Cho tôi lịch trình 3N2Đ'),{origin:'',destination:''});
});

test('explicit departure wins over GPS and explicit one-way requests remain one-way',()=>{
  const intake=startIntake('Lập lịch trình 3 ngày 2 đêm từ HN đến CB');
  assert.equal(intake.origin,'Hà Nội');assert.equal(intake.destination,'Cao Bằng');
  assert.equal(intakeQuestion(intake).key,'date');
  assert.equal(startIntake(`${message}, không quay về`).returnToOrigin,false);
  assert.equal(startIntake(`${message}, không quay về`).destination,'Cao Bằng');
  assert.equal(startIntake('Lập lịch trình 3N2Đ từ HN - CB').origin,'Hà Nội');
});

test('intake asks one missing field at a time and validates answers',()=>{
  let intake=startIntake(message);
  const answers={origin:'Hà Nội',date:'15/10/2026',departure:'6h30',people:'2 người',vehicles:'1 xe',bike:'Xe số',experience:'Chưa quen',hours:'4 giờ',avoidDark:'Có',preferences:'Thiên nhiên, lịch nhẹ'};
  const keys=[];
  while(intakeQuestion(intake)){
    const question=intakeQuestion(intake);keys.push(question.key);
    intake=answerIntake(intake,question,answers[question.key]);
  }
  assert.deepEqual(keys,Object.keys(answers));assert.deepEqual(intakeContext(intake),details);
  assert.equal(startIntake('Lịch trình 3 ngày ở Mộc Châu').nights,null);
  assert.throws(()=>answerIntake(startIntake(message),{key:'date'},'30/02/2026'),/ngày hợp lệ/);
  assert.throws(()=>answerIntake(details,{key:'vehicles',min:1,max:2},'0'),/từ 1/);
  assert.throws(()=>answerIntake(details,{key:'departure'},'25:00'),/HH:MM/);
});

test('GPS stays with the confirmed trip and is never sent in model context',()=>{
  let intake={...startIntake(message),...details,origin:'Vị trí của tôi',originArea:'',originPoint};
  assert.equal(intakeQuestion(intake).key,'originArea');
  intake=answerIntake(intake,intakeQuestion(intake),'Hà Nội');
  assert.equal(intake.origin,'Hà Nội');assert.equal(intake.originPoint.label,'Hà Nội');
  const context=intakeContext(intake);
  assert.equal(context.originPoint,undefined);assert.equal(context.coordinates,undefined);
  const draft=attachIntake(basicDraft('3N2Đ từ HN đến CB'),intake);
  const cleaned=cleanDraft(draft),trip=confirmDraft(cleaned,{});
  assert.ok(isStoredTrip(trip));assert.deepEqual(tripOrigin(trip).coordinates,originPoint.coordinates);
  assert.equal(trip.nights,2);assert.equal(trip.returnToOrigin,true);assert.equal(trip.aiDraft.rider.hours,4);
  assert.deepEqual(trip.interests,['Thiên nhiên, lịch nhẹ']);
  assert.equal(confirmDraft(draft,{origin:'Hải Phòng'}).originPoint,null);
});

test('backend forwards bounded intake fields and strips GPS and extras from previous drafts',()=>{
  const draft=attachIntake(basicDraft('3N2Đ HN-CB'),{...details,originPoint:{...originPoint,label:'Hà Nội'}});
  const normalized=normalizeDraftRequest({message,previous:draft,context:{...details,originPoint,coordinates:[1,2],token:'do-not-forward',untrusted:'ignored'}});
  assert.deepEqual(normalized.context,details);
  assert.equal(normalized.previous.originPoint,undefined);assert.equal(normalized.previous.details,undefined);
  for(const patch of [{days:8},{nights:9},{preferences:'x'.repeat(601)},{people:3,vehicles:1},{returnToOrigin:'yes'}]){
    assert.throws(()=>normalizeDraftRequest({message,context:{...details,...patch}}));
  }
});

test('model omissions cannot replace provided origin/destination and duration mismatches are rejected',async()=>{
  const draft=basicDraft('3N2Đ HN-CB');let sent;
  const result=await generateDraft({message,context:details},{apiKey:'test',model:'test',fetchImpl:async(_,init)=>{
    sent=JSON.parse(init.body);return completion({...draft,origin:'Chưa xác định',destination:'CB'});
  }});
  assert.deepEqual(JSON.parse(sent.input).context,details);
  assert.match(sent.instructions,/quay về/);assert.equal(result.draft.origin,'Hà Nội');
  assert.equal(result.draft.destination,'Cao Bằng');assert.equal(result.draft.nights,2);
  await assert.rejects(generateDraft({message,context:details},{apiKey:'test',model:'test',fetchImpl:async()=>completion({...draft,days:draft.days.slice(0,2)})}),e=>e.code==='AI_INVALID_DRAFT');
});
