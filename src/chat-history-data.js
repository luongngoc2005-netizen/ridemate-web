import {cleanDraft} from './assistant-draft.js';
import {cleanProfile} from './ride-review.js';
import {validOriginPoint} from './origin-data.js';
import {trustedLandmarkSource} from './destination-data.js';

export const CHAT_LIMIT=100,CHAT_BYTES=600000;
export const chatKey=userId=>`ridemate.chats.v1:${userId||'guest'}`;
const text=(v,max=4000)=>typeof v==='string'&&v.length<=max;
const id=v=>text(v,200)&&v.length>0;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const chatFingerprint=value=>JSON.stringify(value);
const json=value=>JSON.parse(JSON.stringify(value));
function fail(){throw new Error('Dữ liệu lịch sử chat chưa hợp lệ. Bản cũ vẫn được giữ.');}
function question(value){
 if(!value)return null;
 if(!id(value.key)||!text(value.label,1000)||value.type!=null&&!['number','time','date','origin','text'].includes(value.type))fail();
 if(value.options&&(!Array.isArray(value.options)||value.options.length>40||value.options.some(p=>!Array.isArray(p)||p.length!==2||!p.every(s=>text(s,500)))))fail();
 return {key:value.key,label:value.label,...(value.type?{type:value.type}:{}),...(value.options?{options:value.options}:{}),...(Number.isFinite(value.min)?{min:value.min}:{}),...(Number.isFinite(value.max)?{max:value.max}:{}),...(id(value.dayId)?{dayId:value.dayId}:{})};
}
function cleanIntake(value){
 if(!value)return null;
 const next={...cleanProfile(value),returnToOrigin:value.returnToOrigin!==false};
 for(const key of ['message','origin','originArea','destination','date','departure','preferences']){
  if(value[key]==null){next[key]=value[key]??null;continue;}
  if(!text(value[key],key==='message'?2000:key==='preferences'?600:200))fail();next[key]=value[key];
 }
 for(const key of ['days','nights','people','vehicles']){
  if(value[key]!=null&&(!Number.isInteger(value[key])||value[key]<0||value[key]>30))fail();next[key]=value[key]??null;
 }
 if(validOriginPoint(value.originPoint))next.originPoint=value.originPoint;
 return next;
}
function reviewText(reply){
 return [reply.dayTitle,reply.intro,reply.suggestion,...(reply.reasons||[]),...(reply.stops||[]).map(p=>p.name)].filter(v=>typeof v==='string').join('\n\n');
}
export function cleanChatSnapshot(value={}){
 const raw=JSON.stringify(value);
 if(!raw||new TextEncoder().encode(raw).length>CHAT_BYTES||!Array.isArray(value.messages)||value.messages.length>400)fail();
 const messages=value.messages.map(m=>{
  if(!m||!Number.isSafeInteger(m.id)||m.id<1||!['assistant','user'].includes(m.role))fail();
  const result={id:m.id,role:m.role};
  if(m.text!=null){if(!text(m.text,16000))fail();result.text=m.text;}
  if(m.reply)result.text=reviewText(m.reply).slice(0,16000); // Historical assessments are read-only snapshots.
  if(m.draft){result.draft=cleanDraft(m.draft);if(m.mode!=null&&!text(m.mode,100))fail();result.mode=m.mode||'Bản nháp AI';}
  if(m.saved){if(!id(m.saved.id))fail();result.saved={id:m.saved.id};}
  if(m.exploration){
   const e=m.exploration;if(!text(e.text,12000)||!text(e.destination,200)||!Array.isArray(e.places)||e.places.length>30||!e.places.every(p=>text(p,200)))fail();
   result.exploration={text:e.text,destination:e.destination,places:e.places,...(trustedLandmarkSource(e.source)?{source:e.source}:{})};
  }
  return result;
 });
 if(new Set(messages.map(m=>m.id)).size!==messages.length)fail();
 return json({messages,draftId:Number.isSafeInteger(value.draftId)&&messages.some(m=>m.id===value.draftId&&m.draft)?value.draftId:null,
  intake:cleanIntake(value.intake),pending:question(value.pending),dayId:id(value.dayId)?value.dayId:null,
  intent:['review','tomorrow','late','tired','rain','stops','prepare','explore','unknown'].includes(value.intent)?value.intent:'review',
  text:text(value.text,2000)?value.text:'',profile:cleanProfile(value.profile)});
}
export function cleanChat(value){
 if(!value||!uuid(value.id)||!text(value.title,100)||!value.title.trim()||!text(value.createdAt,40)||!text(value.updatedAt,40)||!Number.isFinite(Date.parse(value.createdAt))||!Number.isFinite(Date.parse(value.updatedAt)))fail();
 return {id:value.id,title:value.title.trim(),createdAt:value.createdAt,updatedAt:value.updatedAt,deleted:value.deleted===true,
  tripId:id(value.tripId)?value.tripId:null,tripLabel:text(value.tripLabel,500)?value.tripLabel:'',
  snapshot:cleanChatSnapshot(value.snapshot),customTitle:value.customTitle===true};
}
export const emptyChat=(trip,now=new Date().toISOString(),idValue=crypto.randomUUID())=>cleanChat({id:idValue,title:'Cuộc trò chuyện mới',createdAt:now,updatedAt:now,tripId:trip?.id||null,tripLabel:trip?`${trip.origin} → ${trip.destination}`:'',snapshot:{messages:[]}});
export function chatTitle(snapshot){return snapshot.messages.find(m=>m.role==='user'&&m.text)?.text.replace(/\s+/g,' ').trim().slice(0,80)||'Cuộc trò chuyện mới';}
export function readChats(storage,userId){
 const raw=storage.getItem(chatKey(userId));if(!raw)return {rows:[],activeId:null};
 const data=JSON.parse(raw);
 if(data.version!==1||!Array.isArray(data.rows)||data.rows.length>CHAT_LIMIT)fail();
 const rows=data.rows.map(row=>({chat:cleanChat(row.chat),revision:Number.isSafeInteger(row.revision)&&row.revision>=0?row.revision:0,dirty:row.dirty===true}));
 if(new Set(rows.map(row=>row.chat.id)).size!==rows.length)fail();
 return {rows,activeId:rows.some(r=>r.chat.id===data.activeId&&!r.chat.deleted)?data.activeId:null};
}
export function writeChats(storage,userId,value){
 const data=JSON.stringify({version:1,...value});
 if(new TextEncoder().encode(data).length>3500000)throw new Error('Bộ nhớ lịch sử chat gần đầy. Hãy xuất hoặc xóa bớt hội thoại.');
 storage.setItem(chatKey(userId),data);
}
