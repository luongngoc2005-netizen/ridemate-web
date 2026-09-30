import test from 'node:test';
import assert from 'node:assert/strict';
import {detectIntent,tomorrowDay,parseAnswer,dayCandidates,buildReply,setDayAnswer,destinationReply} from '../src/assistant-data.js';
import {interpretMessage,assistantMiddleware} from '../server/assistant-api.js';
import {Readable} from 'node:stream';

const trip={origin:'A',destination:'B',date:'2026-09-30',days:3,itinerary:[{id:'d1',title:'Đi',places:[]},{id:'d2',title:'Khám phá',places:[{id:'p1',name:'Điểm A'},{id:'p2',name:'Điểm B'}]},{id:'d3',title:'Về',places:[]}]};
test('destination questions return sourced attractions without a profile or API',()=>{
 const message='Tôi nên chơi gì ở Cao Bằng';
 assert.equal(detectIntent(message),'explore');
 const reply=destinationReply(message,trip);
 assert.ok(reply.places.includes('Thác Bản Giốc'));assert.match(reply.source,/vietnam.travel/);
 assert.equal(destinationReply('Chơi gì ở Đà Lạt?',{...trip,destination:'Cao Bằng'}).places.length,0);
 assert.equal(destinationReply('Có gì hay?',{...trip,destination:'Cao Bằng'}).destination,'Cao Bằng');
});
test('provider quota exhaustion is distinct from throttling and leaks no details',async()=>{
 const payload={message:'Kiểm tra',context:{days:[{title:'Ngày 1'}]}};
 await assert.rejects(interpretMessage(payload,{apiKey:'test',model:'test',fetchImpl:async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'secret'}}),{status:429})}),e=>e.code==='AI_PROVIDER_QUOTA'&&!e.message.includes('secret'));
 await assert.rejects(interpretMessage(payload,{apiKey:'test',model:'test',fetchImpl:async()=>new Response('{}',{status:429})}),e=>e.code==='AI_PROVIDER_LIMIT');
});
test('empty profile gets immediate plan advice and only a relevant optional question',()=>{
 const reply=buildReply({trip,day:trip.itinerary[1],profile:{}});
 assert.match(reply.suggestion,/Điểm A/);
 assert.equal(reply.question.key,'departure');
 assert.equal(buildReply({trip,day:trip.itinerary[1],profile:{},askFollowUp:false}).question,undefined);
});
test('stops, fatigue and rain do not trigger the profile questionnaire',()=>{
 for(const intent of ['stops','tired','rain']) {
  const reply=buildReply({trip,day:trip.itinerary[1],profile:{},intent});
  assert.equal(reply.question,undefined);
  assert.ok(reply.suggestion.length>0);
 }
 assert.equal(buildReply({trip,day:trip.itinerary[1],profile:{},intent:'prepare'}).question.key,'bike');
});
test('tomorrow follows Vietnam local date, including UTC date rollover and out-of-plan dates',()=>{
 assert.equal(tomorrowDay(trip,new Date('2026-09-29T18:00:00Z')).id,'d2');
 assert.equal(tomorrowDay(trip,new Date('2026-10-02T12:00:00Z')),null);
});
test('intent and question parsing preserve uncertainty and units',()=>{
 assert.equal(detectIntent('Ngày mai tôi nên đi thế nào?'),'tomorrow');
 assert.equal(detectIntent('Tôi xuất phát muộn'),'late');
 assert.equal(detectIntent('Tôi không thấy mệt'),'unknown');
 assert.equal(parseAnswer({type:'time'},'xuất phát lúc 7h30'),'07:30');
 assert.equal(parseAnswer({type:'time'},'25:00'),null);
 assert.equal(parseAnswer({type:'time'},'tầm chiều'),null);
 assert.equal(parseAnswer({key:'driving',type:'number',min:0,max:24},'90 phút'),'1.5');
 assert.equal(parseAnswer({key:'rest',type:'number',min:0,max:1440},'1 giờ'),'60');
 assert.equal(parseAnswer({key:'bike',options:[['scooter','Xe ga']]},'tôi đi xe ga'),'scooter');
 assert.equal(parseAnswer({key:'bike',options:[['scooter','Xe ga']]},'tôi không đi xe ga'),null);
});
test('recommendations never borrow POIs from a different day or missing geometry',()=>{
 const poi={id:'1',type:'fuel',name:'Station',coordinates:[105,21],source:'https://www.openstreetmap.org/node/1'};
 const geometry=[[105,21],[105.01,21.01]];
 const route={coordinates:geometry,legs:[{start:{dayId:'d1'},end:{dayId:'d1'},coordinates:geometry}]};
 assert.equal(dayCandidates(trip,trip.itinerary[1],route,[poi],'review').length,0);
 route.legs[0].start.dayId='d2';route.legs[0].end.dayId='d2';
 assert.equal(dayCandidates(trip,trip.itinerary[1],route,[poi],'review').length,1);
 assert.equal(dayCandidates(trip,trip.itinerary[1],route,[{...poi,source:'javascript:bad'}],'review').length,0);
});
test('known answers are reused; late departure explicitly asks for revised time',()=>{
 const p={bike:'scooter',party:'passenger',experience:'new',hours:4,avoidDark:'yes'};
 let current=setDayAnswer(trip,'d2','departure','14:00');
 current=setDayAnswer(current,'d2','driving','5');current=setDayAnswer(current,'d2','visit','60');current=setDayAnswer(current,'d2','rest','30');current=setDayAnswer(current,'d2','finishBy','18:00');
 const reply=buildReply({trip:current,day:current.itinerary[1],profile:p,route:null});
 assert.equal(reply.question,undefined);assert.equal(reply.assessment.total,390);assert.equal(reply.proposal.id,'p2');
 assert.equal(buildReply({trip:current,day:current.itinerary[1],profile:p,intent:'late'}).question.key,'departure');
});
test('schedule reduction does not suggest dropping fuel, repair or lodging stops',()=>{
 const day={id:'d1',title:'Đi',places:[{id:'fuel',name:'Fuel',category:'fuel'},{id:'rest',name:'Rest',category:'rest'}]};
 const current={...trip,itinerary:[day]};
 assert.equal(buildReply({trip:current,day,profile:{},intent:'tired'}).proposal,null);
});
const payload={message:'Ngày mai nên đi thế nào?',question:null,context:{days:[{title:'Ngày một'},{title:'Ngày hai'}]}};
const mockResponse=result=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]})});
test('API sends server-side credentials and constrains model to interpretation only',async()=>{
 let sent;
 const result=await interpretMessage(payload,{apiKey:'test-only',model:'test-model',fetchImpl:async(url,request)=>{sent=JSON.parse(request.body);return mockResponse({intent:'tomorrow',dayNumber:null,answer:null});}});
 assert.deepEqual(result,{intent:'tomorrow',dayNumber:null,answer:null});
 assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);
 assert.deepEqual(Object.keys(sent.text.format.schema.properties),['intent','dayNumber','answer']);
});
test('API rejects invalid day numbers, incomplete/refused output, invalid request, and unknown intents',async()=>{
 const config={apiKey:'test',model:'test',fetchImpl:async()=>mockResponse({intent:'review',dayNumber:99,answer:null})};
 await assert.rejects(interpretMessage(payload,config),/INVALID_RESPONSE/);
 await assert.rejects(interpretMessage({...payload,message:''},config),/INVALID_REQUEST/);
 await assert.rejects(interpretMessage(payload,{...config,fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete'})})}),/INCOMPLETE_RESPONSE/);
 await assert.rejects(interpretMessage(payload,{...config,fetchImpl:async()=>mockResponse({intent:'invent_location',dayNumber:null,answer:null})}),/INVALID_RESPONSE/);
 await assert.rejects(interpretMessage(payload,{}),/NOT_CONFIGURED/);
});
test('middleware rejects cross-origin requests and does not call OpenAI when unconfigured',async()=>{
 let called=false;const middleware=assistantMiddleware({fetchImpl:()=>{called=true;}});
 async function run(headers){let status,body;const req=Readable.from([JSON.stringify(payload)]);Object.assign(req,{url:'/api/assistant',method:'POST',headers});await middleware(req,{writeHead:n=>{status=n;},end:s=>{body=JSON.parse(s);}},()=>{});return {status,body};}
 assert.equal((await run({host:'localhost:5173',origin:'https://untrusted.example','x-ridemate-assistant':'1'})).status,403);
 assert.equal((await run({host:'localhost:5173','x-ridemate-assistant':'1'})).status,503);
 assert.equal(called,false);
});
