import test from 'node:test';
import assert from 'node:assert/strict';
import {chatKey,cleanChatSnapshot,emptyChat,readChats} from '../src/chat-history-data.js';
import {createChatHistory} from '../src/chat-history-store.js';
import {basicDraft} from '../src/assistant-draft.js';
import {startIntake} from '../src/assistant-intake.js';
import {validateTripIntake,startFormIntake} from '../src/trip-intake-data.js';

const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const snapshot=text=>({messages:[{id:1,role:'user',text},{id:2,role:'assistant',text:'Xin chào, tôi có thể giúp bạn lên kế hoạch.'}],text:'',intake:null});
const make=(overrides={})=>createChatHistory({storage:storage(),...overrides});
function server(){
 const rows=new Map();let user='alice',missing=false,hold;
 const client={auth:{getUser:async()=>({data:{user:{id:user}}})},from:()=>({select:()=>({eq:(field,id)=>({order:()=>({limit:async()=>missing?{error:{code:'42P01'}}:{data:[...rows.values()].filter(r=>r.user_id===id).map(r=>structuredClone(r))}})})})}),
  rpc:async(name,args)=>{
   if(hold){const callback=hold;hold=null;await callback();}
   if(args.expected_user_id!==user)return {error:{code:'28000',message:'Account changed'}};
   const key=`${user}:${args.conversation_id}`,old=rows.get(key);
   if(old&&JSON.stringify(old.payload)===JSON.stringify(args.new_payload))return {data:old.revision};
   if((old?.revision||0)!==args.expected_revision)return {error:{code:'40001'}};
   const row={user_id:user,id:args.conversation_id,revision:(old?.revision||0)+1,payload:structuredClone(args.new_payload)};rows.set(key,row);return {data:row.revision};
  }};
 return {client,rows,setUser:value=>{user=value;},setMissing:value=>{missing=value;},hold:callback=>{hold=callback;}};
}

test('history preserves messages, drafts, unsent form and saved plan links across reload and separates accounts',()=>{
 const local=storage(),store=make({storage:local,userId:'alice'}),chat=store.create({id:'trip-a',origin:'Hà Nội',destination:'Cao Bằng'});
 const draft=basicDraft('3N2Đ HN-CB');
 store.save(chat.id,{...snapshot('Lập lịch đi Cao Bằng'),draftId:3,intake:{...startIntake('3N2Đ HN-CB'),date:'2026-11-07'},messages:[...snapshot('Lập lịch đi Cao Bằng').messages,{id:3,role:'assistant',draft,mode:'AI',saved:{id:'saved-trip',secret:'discard'}}],text:'Đang sửa yêu cầu'});
 const reloaded=readChats(local,'alice');assert.equal(reloaded.activeId,chat.id);assert.equal(reloaded.rows[0].chat.snapshot.intake.date,'2026-11-07');
 assert.equal(reloaded.rows[0].chat.snapshot.messages[2].draft.destination,'Cao Bằng');assert.deepEqual(reloaded.rows[0].chat.snapshot.messages[2].saved,{id:'saved-trip'});
 assert.equal(reloaded.rows[0].chat.snapshot.text,'Đang sửa yêu cầu');assert.deepEqual(readChats(local,'bob').rows,[]);assert.deepEqual(readChats(local,null).rows,[]);
 store.rename(chat.id,'Chuyến cuối tuần');store.save(chat.id,snapshot('Nội dung đổi'));assert.equal(store.get().rows[0].chat.title,'Chuyến cuối tuần');
 store.remove(chat.id);assert.equal(store.get().activeId,null);assert.equal(store.get().rows[0].chat.deleted,true);
});

test('malformed storage is never overwritten; unavailable storage retains a visible in-memory snapshot',()=>{
 const local=storage();local.setItem(chatKey('alice'),'broken');const store=make({storage:local,userId:'alice'});
 assert.equal(store.get().blocked,true);assert.throws(()=>store.create());assert.equal(local.getItem(chatKey('alice')),'broken');
 const denied=make({storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}}});const chat=denied.create();denied.save(chat.id,snapshot('Nội dung cần giữ'));
 assert.match(denied.get().error,/quota/);assert.equal(denied.get().rows[0].chat.snapshot.messages[0].text,'Nội dung cần giữ');assert.equal(denied.select(null),false);
});

test('cross-device synchronization preserves separate chats and forks conflicting edits, including deletes',async()=>{
 const remote=server(),a=make({userId:'alice',client:remote.client}),bLocal=storage(),b=make({userId:'alice',client:remote.client,storage:bLocal});
 const first=a.create();a.save(first.id,snapshot('Phiên gốc'));await a.sync();await b.sync();
 b.select(first.id);a.save(first.id,snapshot('Sửa trên A'));b.save(first.id,snapshot('Sửa trên B'));await a.sync();await b.sync();
 assert.equal(b.get().rows.length,2);assert.ok(b.get().rows.some(r=>r.chat.snapshot.messages[0].text==='Sửa trên B'));
 assert.ok(b.get().rows.some(r=>r.chat.snapshot.messages[0].text==='Sửa trên A'));assert.notEqual(b.get().activeId,first.id);
 await a.sync();assert.equal(a.get().rows.length,2);a.remove(first.id);await a.sync();await b.sync();assert.equal(b.get().rows.find(r=>r.chat.id===first.id).chat.deleted,true);
 const again=make({userId:'alice',client:remote.client,storage:bLocal});assert.equal(again.get().rows.length,2);
});

test('pending writes and account changes never mark an unsaved draft as synced or leak across users',async()=>{
 const remote=server(),store=make({userId:'alice',client:remote.client}),chat=store.create();store.save(chat.id,snapshot('Bản đầu'));
 remote.hold(async()=>store.save(chat.id,snapshot('Đang sửa lúc gửi')));await store.sync();
 assert.equal(store.get().rows[0].dirty,true);await store.sync();assert.equal(store.get().rows[0].dirty,false);
 assert.equal([...remote.rows.values()][0].payload.snapshot.messages[0].text,'Đang sửa lúc gửi');
 assert.equal(store.get().status,'synced');store.save(chat.id,snapshot('Bản riêng'));assert.equal(store.get().status,'pending');remote.setUser('bob');await store.sync();assert.equal(store.get().status,'error');assert.equal(store.get().rows[0].dirty,true);
 assert.equal([...remote.rows.values()].filter(r=>r.user_id==='bob').length,0);
 remote.setUser('alice');remote.setMissing(true);await store.sync();assert.match(store.get().error,/migration/);
});

test('another browser tab cannot silently overwrite pending local history',()=>{
 const local=storage(),a=make({storage:local}),b=make({storage:local});const ca=a.create();a.save(ca.id,snapshot('Tab A'));
 const cb=b.create();b.save(cb.id,snapshot('Tab B'));assert.match(b.get().error,/tab khác/);
 assert.equal(readChats(local,null).rows[0].chat.snapshot.messages[0].text,'Tab A');
});

test('history cleans unsafe sources and malformed message structures and stores reviews read-only',()=>{
 const cleaned=cleanChatSnapshot({messages:[{id:1,role:'assistant',reply:{dayTitle:'Ngày 1',suggestion:'Lịch nhẹ',reasons:['Nghỉ ngơi'],proposal:{id:'task'},stops:[]}}]});
 assert.match(cleaned.messages[0].text,/Lịch nhẹ/);assert.equal(cleaned.messages[0].reply,undefined);
 assert.throws(()=>cleanChatSnapshot({messages:[{id:1,role:'assistant',draft:{}}]}));
 assert.throws(()=>cleanChatSnapshot({messages:[{id:1,role:'bad'}]}));assert.throws(()=>cleanChatSnapshot({messages:Array(401).fill({})}));
 assert.throws(()=>cleanChatSnapshot({messages:[{id:1,role:'user',text:'x'.repeat(700000)}]}));
 assert.ok(emptyChat(null).id);
});

test('one form accepts complete intake without demanding optional rider questions and validates capacity/dates',()=>{
 const parsed=startFormIntake('Tạo chuyến đi 3 ngày 2 đêm từ Hà Nội đến Hải Phòng, với 2 người đi 1 xe ga, ngày 07/11/2026 xuất phát lúc 06:30, thích ẩm thực');
 assert.equal(parsed.people,2);assert.equal(parsed.vehicles,1);assert.equal(parsed.date,'2026-11-07');assert.equal(parsed.preferences,'Ẩm thực');assert.equal(parsed.bike,'scooter');
 const data={...startIntake('Tạo chuyến đi 3 ngày 2 đêm từ Hà Nội đến Hải Phòng'),date:'2026-11-07',departure:'18:35',people:2,vehicles:1,preferences:'Ẩm thực'};
 assert.equal(validateTripIntake(data).preferences,'Ẩm thực');assert.equal(validateTripIntake(data).bike,undefined);
 assert.equal(validateTripIntake({...data,preferences:''}).preferences,'Không có yêu cầu riêng');
 for(const invalid of [{date:'2026-02-30'},{departure:'24:00'},{people:3,vehicles:1},{days:2,nights:3},{people:null},{origin:''}])assert.throws(()=>validateTripIntake({...data,...invalid}));
});
