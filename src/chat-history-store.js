import {CHAT_LIMIT,chatKey,cleanChat,cleanChatSnapshot,chatFingerprint,chatTitle,emptyChat,readChats,writeChats} from './chat-history-data.js';
import {requireUser} from './cloud-data.js';

export function createChatHistory({storage,userId,client,onChange=()=>{},canApply=()=>true,now=()=>new Date().toISOString(),newId=()=>crypto.randomUUID()}){
 let cache,error='',blocked=false;
 try{cache=readChats(storage,userId);}catch(e){cache={rows:[],activeId:null};error=e.message;blocked=true;}
 let persistedRaw;try{persistedRaw=storage.getItem(chatKey(userId));}catch{}
 let state={...cache,error,status:'local',blocked},closed=false,running=false;
 const emit=()=>{if(!closed)onChange(state);};
 const commit=(rows,activeId=state.activeId)=>{
  if(closed)return;
  let failure='';try{
   if(blocked)throw Error('Chưa đọc được lịch sử cũ. Hãy xuất dữ liệu trước khi thử lại.');
   if(storage.getItem(chatKey(userId))!==persistedRaw)throw Error('Lịch sử đã đổi trong tab khác. Hãy xuất bản trong tab này trước khi tải lại trang.');
   writeChats(storage,userId,{rows,activeId});persistedRaw=storage.getItem(chatKey(userId));
  }catch(e){failure=e.message;}
  state={...state,rows,activeId,status:state.status==='synced'&&rows.some(r=>r.dirty)?'pending':state.status,error:failure||'',localError:failure};emit();return !failure;
 };
 const ensureRoom=()=>{if(state.rows.length>=CHAT_LIMIT)throw Error('Đã có 100 hội thoại. Hãy xuất lịch sử để lưu trữ trước khi tạo thêm.');};
 const update=(id,change)=>{
  const row=state.rows.find(r=>r.chat.id===id);if(!row)return false;
  const chat=cleanChat({...row.chat,...change,updatedAt:now()});
  if(chatFingerprint({...chat,updatedAt:''})===chatFingerprint({...row.chat,updatedAt:''}))return true;
  return commit(state.rows.map(r=>r===row?{...row,chat,dirty:true}:r));
 };
 async function sync(){
  if(!userId||!client||closed||running||blocked)return;
  running=true;state={...state,status:'syncing'};emit();
  try{
   await requireUser(client,userId);if(closed)return;
   const {data,error}=await client.from('assistant_conversations').select('id,payload,revision').eq('user_id',userId).order('updated_at',{ascending:false}).limit(CHAT_LIMIT);
   if(error)throw error;if(closed)return;
   if(!canApply()){state={...state,status:'pending'};emit();return;}
   let rows=[...state.rows],activeId=state.activeId;
   for(const remote of data||[]){
    const chat=cleanChat({...remote.payload,id:remote.id});
    if(!Number.isSafeInteger(remote.revision)||remote.revision<1)throw Error('Phiên bản lịch sử chat không hợp lệ.');
    const local=rows.find(r=>r.chat.id===chat.id);
    if(!local)rows.push({chat,revision:remote.revision,dirty:false});
    else if(remote.revision!==local.revision){
     if(local.dirty&&chatFingerprint(chat)!==chatFingerprint(local.chat)){
      if(rows.length>=CHAT_LIMIT)throw Error('Có xung đột lịch sử và đã đạt giới hạn 100 chat. Hãy xuất bản trên thiết bị.');
      // Preserve both complete conversations instead of mixing message order or losing drafts.
      const copy=cleanChat({...local.chat,id:newId(),title:`${local.chat.title.slice(0,75)} (bản thiết bị)`,updatedAt:now()});
      rows.push({chat:copy,revision:0,dirty:true});if(activeId===local.chat.id)activeId=copy.id;
     }
     rows=rows.map(r=>r===local?{chat,revision:remote.revision,dirty:false,epoch:(local.epoch||0)+(chatFingerprint(chat)!==chatFingerprint(local.chat)?1:0)}:r);
    }
   }
   if(rows.length>CHAT_LIMIT)throw Error('Lịch sử tổng hợp vượt giới hạn 100 chat. Hãy xuất bản trên thiết bị trước khi tiếp tục.');
   const selected=rows.find(r=>r.chat.id===activeId);
   if(!commit(rows,selected?.chat.deleted?null:activeId))throw Error(state.localError);
   for(const captured of rows.filter(r=>r.dirty)){
    await requireUser(client,userId);if(closed)return;
    const {data:revision,error}=await client.rpc('save_assistant_conversation',{expected_user_id:userId,conversation_id:captured.chat.id,expected_revision:captured.revision,new_payload:captured.chat});
    if(error)throw error;if(closed)return;
    if(!Number.isSafeInteger(revision)||revision<1)throw Error('Máy chủ chưa xác nhận lưu lịch sử.');
    if(!commit(state.rows.map(row=>row.chat.id===captured.chat.id?{...row,revision,dirty:chatFingerprint(row.chat)!==chatFingerprint(captured.chat)}:row)))throw Error(state.localError);
   }
   await requireUser(client,userId);if(closed)return;
   state={...state,status:state.rows.some(r=>r.dirty)?'pending':'synced',error:''};emit();
  }catch(e){if(!closed){
   const missing=['42P01','PGRST205','PGRST202','42883'].includes(e.code);
   state={...state,status:'error',error:missing?'Lịch sử đang lưu trên thiết bị. Cần chạy migration assistant_conversations trong SUPABASE_SETUP.md để đồng bộ tài khoản.':e.code==='40001'?'Chat đã thay đổi trên thiết bị khác. Bấm Đồng bộ lại để giữ cả hai phiên bản.':`Chưa đồng bộ lịch sử: ${e.message||'Hãy thử lại.'}`};emit();
  }}finally{running=false;}
 }
 return {
  get:()=>state,close:()=>{closed=true;},sync,
  select:id=>{if(blocked||state.localError)return false;return commit(state.rows,id);},
  create(trip,idValue=newId()){if(blocked||state.localError)throw Error('Chưa lưu được lịch sử hiện tại. Hãy thử lại trước khi chuyển chat.');ensureRoom();const chat=emptyChat(trip,now(),idValue);commit([...state.rows,{chat,revision:0,dirty:true}],chat.id);return chat;},
  save(id,snapshot){const clean=cleanChatSnapshot(snapshot),row=state.rows.find(r=>r.chat.id===id);if(!row||row.chat.deleted)return;
   return update(id,{snapshot:clean,...(!row.chat.customTitle?{title:chatTitle(clean)}:{})});},
  rename:(id,title)=>update(id,{title,customTitle:true}),remove(id){return update(id,{deleted:true})&&commit(state.rows,state.activeId===id?null:state.activeId);},
  restore:id=>update(id,{deleted:false}),
  retryLocal:()=>commit(state.rows),
 };
}
