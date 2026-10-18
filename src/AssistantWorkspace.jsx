import React,{useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase.js';
import {createChatHistory} from './chat-history-store.js';
import ChatHistory from './ChatHistory.jsx';
import ToolIcon from './ToolIcon.jsx';
import './chat-history.css';

export default function AssistantWorkspace({Conversation,...props}){
 return <Workspace key={props.userId||'guest'} Conversation={Conversation} {...props}/>;
}
function Workspace({Conversation,...props}){
 const [,render]=useState(0),[busy,setBusy]=useState(false),[panel,setPanel]=useState(false),[notice,setNotice]=useState('');
 const busyRef=useRef(false);busyRef.current=busy;
 const [store]=useState(()=>createChatHistory({storage:localStorage,userId:props.userId,client:supabase,onChange:()=>render(n=>n+1),canApply:()=>!busyRef.current}));
 const state=store.get(),active=state.rows.find(row=>row.chat.id===state.activeId&&!row.chat.deleted)?.chat;
 const [blankId,setBlankId]=useState(()=>crypto.randomUUID());
 const session=useRef(null),latestSnapshot=useRef(null);
 useEffect(()=>{
  const run=()=>{if(!busyRef.current)store.sync();};run();
  const timer=setInterval(run,15000);window.addEventListener('focus',run);window.addEventListener('online',run);
  return ()=>{clearInterval(timer);window.removeEventListener('focus',run);window.removeEventListener('online',run);store.close();};
 },[store]);
 const dirty=JSON.stringify(state.rows.filter(row=>row.dirty).map(row=>[row.chat.id,row.chat.updatedAt]));
 useEffect(()=>{if(!props.userId||busy)return;const timer=setTimeout(()=>store.sync(),900);return ()=>clearTimeout(timer);},[dirty,busy,store,props.userId]);
 const persist=useCallback(snapshot=>{
  latestSnapshot.current=snapshot;
  if(!snapshot.messages.length&&!snapshot.text&&!snapshot.intake)return;
  try{
   let id=store.get().activeId;
   if(!id){const chat=store.create(props.trip,blankId);id=chat.id;session.current=id;}
   store.save(id,snapshot);
  }catch(e){setNotice(e.message);}
 },[store,props.trip?.id,blankId]);
 const open=id=>{if(busy)return;session.current=id;if(store.select(id)){setPanel(false);setNotice('');}};
 const fresh=()=>{if(busy)return;if(store.select(null)){session.current=null;setBlankId(crypto.randomUUID());setPanel(false);setNotice('');}};
 const reviewStarted=useRef(false);
 useEffect(()=>{if(props.initialReview&&!reviewStarted.current){reviewStarted.current=true;fresh();}},[props.initialReview]);
 const exported=()=>{
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),conversations:state.rows.filter(r=>!r.chat.deleted).map(r=>r.chat),...(notice||state.localError?{unsavedSnapshot:latestSnapshot.current}:{}),...(state.blocked?{unreadableCache:localStorage.getItem(`ridemate.chats.v1:${props.userId||'guest'}`)}:{})},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ridemate-chat-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const call=fn=>{try{fn();setNotice('');}catch(e){setNotice(e.message);}};
 const currentTrip=active?.tripId&&active.tripId!==props.trip?.id?null:props.trip;
 return <main className={`page ai-workspace${panel?' history-open':''}`}>
  <div className="chat-mobile-toolbar"><button type="button" className="soft" aria-expanded={panel} aria-controls="chat-history" onClick={()=>setPanel(v=>!v)}><ToolIcon name="assistant"/> Lịch sử chat</button><button type="button" className="green" disabled={busy} onClick={fresh}><ToolIcon name="plus"/> Chat mới</button></div>
  <aside className="chat-history" id="chat-history" aria-label="Lịch sử trò chuyện AI"><button className="chat-history-close" type="button" onClick={()=>setPanel(false)} aria-label="Đóng lịch sử chat"><ToolIcon name="close"/></button><ChatHistory rows={state.rows} activeId={active?.id} disabled={busy||state.blocked} onOpen={open} onNew={fresh} onRename={(id,title)=>call(()=>store.rename(id,title))} onDelete={id=>call(()=>{store.remove(id);session.current=store.get().activeId;setBlankId(crypto.randomUUID());})} onExport={exported} status={state.status} error={state.error} userId={props.userId} onRetry={()=>{store.retryLocal();store.sync();}}/></aside>
  <div className="chat-current">
   {notice&&<p role="alert" className="chat-history-error">{notice}</p>}
   {active&&<div className="chat-current-title"><b>{active.title}</b><span>{active.snapshot.messages.length} tin nhắn</span></div>}
   {active?.tripId&&!currentTrip&&<p className="chat-trip-notice">Hội thoại của {active.tripLabel||'kế hoạch khác'}. <button className="soft" onClick={()=>props.onOpenPlan(active.tripId)}>Mở kế hoạch liên quan</button></p>}
   {state.blocked?<p role="alert">Chưa mở được lịch sử đã lưu. Dữ liệu cũ chưa bị ghi đè.</p>:<Conversation {...props} trip={currentTrip} initialReview={props.initialReview&&!active} key={`${active?.id||blankId}:${state.rows.find(r=>r.chat.id===active?.id)?.epoch||0}`} initial={active?.snapshot} onSnapshot={persist} onBusy={setBusy} embedded/>}
  </div>
 </main>;
}
