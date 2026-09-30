import React, {useEffect, useRef, useState} from 'react';
import {useTripRoute} from './TripRouteContext.jsx';
import {PROFILE_KEY, cleanProfile, profileQuestions, deferPlace, restorePlace, daySignature} from './ride-review.js';
import {buildReply, detectIntent, tomorrowDay, parseAnswer, setDayAnswer, nextProfile, isProfileKey, destinationReply, intents} from './assistant-data.js';
import {supportTypes} from './places-data.js';
import {supabase} from './supabase.js';
import {requestAssistant} from './assistant-client.js';
import './ai-assistant.css';

const quickPrompts=['Kiểm tra chuyến đi của tôi','Ngày mai tôi nên đi thế nào?','Tôi xuất phát muộn','Tôi đang mệt','Tôi đang gặp mưa','Chuẩn bị theo xe của tôi'];
const profileNames={bike:'Loại xe',party:'Người đi cùng',experience:'Kinh nghiệm',hours:'Giờ chạy mỗi ngày',avoidDark:'Tránh chạy tối'};

export default function AIAssistant({trip,setTrip,setPage,initialReview=false,userId=null}) {
  if(!trip)return <main className="page ai-assistant"><section className="card ai-empty"><span className="ai-kicker">RIDEMATE</span><h1>AI Assistant</h1><h2>Trợ lý đồng hành du lịch bằng xe máy</h2><p>Mở một kế hoạch để tôi đọc chặng đi, các điểm đã chọn và giúp bạn điều chỉnh lịch trình theo người lái.</p><button className="green" onClick={()=>setPage('plans')}>Chọn kế hoạch của tôi</button></section></main>;
  return <Conversation key={`${trip.id}:${userId||'guest'}`} trip={trip} setTrip={setTrip} initialReview={initialReview} userId={userId} setPage={setPage}/>;
}

function Conversation({trip,setTrip,initialReview,userId,setPage}) {
  const routeState=useTripRoute();
  const [profile,setProfile]=useState(()=>{try{return cleanProfile(JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}'));}catch{return {};}});
  const [storageError,setStorageError]=useState('');
  const [dayId,setDayId]=useState(trip.itinerary[0].id);
  const [intent,setIntent]=useState('review');
  const [messages,setMessages]=useState([]);
  const [pending,setPending]=useState(null);
  const [text,setText]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [service,setService]=useState({ready:false,authRequired:true});
  const online=service.ready&&(!service.authRequired||!!userId);
  const [showProposal,setShowProposal]=useState(null);
  const sequence=useRef(0), started=useRef(false), messageList=useRef(null), request=useRef(null);
  const day=trip.itinerary.find(d=>d.id===dayId)||trip.itinerary[0];
  const contextRef=useRef();contextRef.current={trip,profile,day,routeState};
  const append=message=>setMessages(current=>[...current,{...message,id:++sequence.current}]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/assistant/status',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!controller.signal.aborted)setService({ready:data?.ready===true,authRequired:data?.authRequired!==false});}).catch(()=>{});
    return ()=>{controller.abort();request.current?.abort();};
  },[]);
  useEffect(()=>{const list=messageList.current;list?.scrollTo({top:list.scrollHeight,behavior:'smooth'});},[messages,busy]);

  const respond=(messageIntent,target=day,currentTrip=trip,currentProfile=profile,intro='',askFollowUp=true)=>{
    const reply=buildReply({trip:currentTrip,day:target,profile:currentProfile,route:routeState.route,places:routeState.places,intent:messageIntent,intro,askFollowUp});
    append({role:'assistant',reply});
    setPending(reply.question?{...reply.question,dayId:target.id}:null);
    setIntent(messageIntent);
  };
  useEffect(()=>{
    if(initialReview&&!started.current){started.current=true;append({role:'user',text:quickPrompts[0]});respond('review');}
  },[initialReview]);

  const saveAnswer=(question,value,label=value)=>{
    append({role:'user',text:String(label)});setError('');
    if(question.key==='selectDay'){
      const target=trip.itinerary.find(d=>d.id===value);if(!target)return;
      setDayId(target.id);respond('review',target);return;
    }
    const target=trip.itinerary.find(d=>d.id===question.dayId);if(!target)return;
    setDayId(target.id);
    let nextTrip=trip,next=profile;
    if(isProfileKey(question.key)){
      next=nextProfile(profile,question.key,value);setProfile(next);
      try{localStorage.setItem(PROFILE_KEY,JSON.stringify(next));setStorageError('');}catch{setStorageError('Hồ sơ chỉ được giữ trong phiên này vì trình duyệt chưa lưu được dữ liệu.');}
    }else{
      nextTrip=setDayAnswer(trip,target.id,question.key,value);setTrip(current=>setDayAnswer(current,target.id,question.key,value));
    }
    const nextIntent=question.key==='departure'&&intent==='late'?'review':intent;
    respond(nextIntent,nextTrip.itinerary.find(d=>d.id===target.id),nextTrip,next,'Đã cập nhật thông tin bạn vừa cung cấp.',false);
  };

  const send=async raw=>{
    const message=String(raw??text).trim();if(!message||busy)return;
    setText('');setError('');
    const answer=parseAnswer(pending,message);
    if(answer!==null){saveAnswer(pending,answer,message);return;}
    let detected=detectIntent(message), target=day, interpreted=null;
    const explore=()=>{append({role:'user',text:message});append({role:'assistant',exploration:destinationReply(message,trip)});setPending(null);};
    // Source-backed destination suggestions also work without a paid AI call.
    if(detected==='explore'){explore();return;}
    if(online){
      setBusy(true);const controller=new AbortController();request.current=controller;
      const snapshot=JSON.stringify([trip,profile]);
      try{
        interpreted=await requestAssistant({message,question:pending,context:{date:trip.date,origin:trip.origin,destination:trip.destination,selectedDay:trip.itinerary.indexOf(day)+1,days:trip.itinerary.map(d=>({title:d.title,places:d.places.map(p=>p.name)})),profile}},
          {client:supabase,signal:controller.signal,expectedUserId:userId});
        if(JSON.stringify([contextRef.current.trip,contextRef.current.profile])!==snapshot){setError('Kế hoạch đã thay đổi trong lúc chờ. Hãy gửi lại để đánh giá dữ liệu mới.');return;}
        if(interpreted.answer&&pending){const value=parseAnswer(pending,interpreted.answer);if(value!==null){saveAnswer(pending,value,message);return;}}
        if(intents.includes(interpreted.intent))detected=interpreted.intent;
        if(Number.isInteger(interpreted.dayNumber)&&trip.itinerary[interpreted.dayNumber-1])target=trip.itinerary[interpreted.dayNumber-1];
      }catch(failure){if(failure.name==='AbortError')return;setError(failure.message);interpreted=null;}
      finally{setBusy(false);request.current=null;}
    }
    if(detected==='explore'){explore();return;}
    append({role:'user',text:message});
    if(detected==='unknown'){
      setPending(null);append({role:'assistant',text:'Tôi chưa hiểu rõ yêu cầu này để trả lời chính xác. Bạn có thể nói cụ thể điều muốn biết, chẳng hạn “Nên chơi gì ở Cao Bằng?” hoặc “Chặng này có quá nhiều điểm không?”.'});return;
    }
    const explicit=message.match(/ngày\s+(\d+)/i);
    if(explicit){target=trip.itinerary[Number(explicit[1])-1];}
    if(detected==='tomorrow')target=tomorrowDay(trip);
    if(!target){
      append({role:'assistant',text:'Tôi chưa xác định được chặng bạn hỏi trong lịch của kế hoạch này. Bạn muốn kiểm tra ngày nào?'});
      setPending({key:'selectDay',label:'Bạn muốn kiểm tra ngày nào?',options:trip.itinerary.map((d,i)=>[d.id,`Ngày ${i+1}: ${d.title}`])});return;
    }
    setDayId(target.id);
    respond(detected,target,trip,profile,interpreted?'Tôi đã hiểu yêu cầu; dưới đây là đánh giá từ dữ liệu kế hoạch của bạn.':'');
  };

  const apply=(reply,place)=>{
    const current=trip.itinerary.find(d=>d.id===reply.dayId);
    if(!current||daySignature(trip,current)!==reply.signature){setError('Lịch trình đã thay đổi. Hãy kiểm tra lại trước khi áp dụng gợi ý cũ.');return;}
    const next=deferPlace(trip,current.id,place.id);setTrip(value=>deferPlace(value,current.id,place.id));setShowProposal(null);
    append({role:'assistant',text:`Đã chuyển “${place.name}” sang Để sau. Điểm vẫn được giữ để đưa lại lịch trình. Thời gian cũ cần tính lại; chưa thể khẳng định tiết kiệm bao lâu.`});
    respond('review',next.itinerary.find(d=>d.id===current.id),next);
  };

  return <main className="page ai-assistant">
    <header className="ai-header"><div><span className="ai-kicker">RIDEMATE · NGƯỜI BẠN TRÊN MỖI CHẶNG</span><h1>AI Assistant</h1><p>Trợ lý đồng hành du lịch bằng xe máy</p></div><span className={`ai-mode ${online?'connected':''}`}>{online?'AI đã cấu hình':service.ready?'Đăng nhập để dùng AI':'Chế độ cơ bản · chưa cấu hình AI'}</span></header>
    <div className="ai-layout"><aside className="card ai-context"><span className="ai-kicker">KẾ HOẠCH ĐANG MỞ</span><h2>{trip.origin} → {trip.destination}</h2><p>{trip.days} ngày · {trip.date}</p>
      <label>Chặng đang trao đổi<select value={day.id} disabled={busy} onChange={e=>{setDayId(e.target.value);setPending(null);setIntent('review');setShowProposal(null);setError('');}}>{trip.itinerary.map((d,i)=><option key={d.id} value={d.id}>Ngày {i+1}: {d.title}</option>)}</select></label>
      <ol>{day.places.map(p=><li key={p.id}>{p.name}</li>)}</ol>{!day.places.length&&<p>Chưa có điểm dừng trong ngày này.</p>}
      <details><summary>Hồ sơ người lái</summary><p className="ai-muted">Dùng cho kế hoạch sau trên trình duyệt này, chưa đồng bộ tài khoản.</p><dl>{profileQuestions.map(q=><React.Fragment key={q.key}><dt>{profileNames[q.key]}</dt><dd>{q.options?.find(([v])=>v===profile[q.key])?.[1]||profile[q.key]||'Chưa có'} <button disabled={busy} onClick={()=>{setPending({...q,dayId:day.id});append({role:'assistant',text:q.label});}}>Sửa</button></dd></React.Fragment>)}</dl>{storageError&&<p role="alert">{storageError}</p>}</details>
      <details><summary>Điều chỉnh giờ và thời gian</summary><p className="ai-muted">Chọn thông tin cần cập nhật; trợ lý sẽ hỏi ngay trong cuộc trò chuyện.</p>{[{key:'departure',label:'Bạn dự định xuất phát lúc mấy giờ?',type:'time'},{key:'driving',label:'Bạn dự trù bao nhiêu giờ chạy xe riêng ngày này?',type:'number',min:0,max:24},{key:'visit',label:'Bạn dự trù bao nhiêu phút tham quan?',type:'number',min:0,max:1440},{key:'rest',label:'Bạn dành bao nhiêu phút ăn uống và nghỉ?',type:'number',min:0,max:1440},{key:'finishBy',label:'Bạn muốn kết thúc chạy xe trước mấy giờ?',type:'time'}].map(q=><button className="ai-context-edit" disabled={busy} key={q.key} onClick={()=>{setPending({...q,dayId:day.id});append({role:'assistant',text:q.label});}}>{({departure:'Giờ xuất phát',driving:'Thời gian chạy',visit:'Tham quan',rest:'Ăn và nghỉ',finishBy:'Giờ kết thúc'})[q.key]}: {day.rideReview?.[q.key]??'Chưa có'}</button>)}</details>
      {!!day.deferredPlaces?.length&&<details open><summary>Điểm để sau ({day.deferredPlaces.length})</summary>{day.deferredPlaces.map(p=><div className="ai-deferred" key={p.id}><span>{p.name}</span><button disabled={busy} onClick={()=>{const next=restorePlace(trip,day.id,p.id);setTrip(current=>restorePlace(current,day.id,p.id));respond('review',next.itinerary.find(d=>d.id===day.id),next,profile,`Đã đưa ${p.name} về cuối ngày. Cần tính lại thời gian.`);}}>Đưa lại lịch trình</button></div>)}</details>}
    </aside>
    <section className="card ai-conversation" aria-label="Trò chuyện với AI Assistant">
      <div className="ai-conversation-heading"><b>Đồng hành cùng chuyến đi của bạn</b><span>Dựa trên kế hoạch · hồ sơ người lái · dữ liệu bản đồ</span></div>
      <div className="ai-messages" ref={messageList} aria-live="polite" aria-relevant="additions">
        <article className="ai-message assistant"><span className="ai-author">RideMate</span><h2>Chuyến đi vừa sức bắt đầu từ một kế hoạch phù hợp.</h2><p>Tôi sẽ cùng bạn xem thời gian chạy, nhịp nghỉ và các điểm dừng. Tôi dùng thông tin đã có và chỉ hỏi thêm một điều cần thiết mỗi lần.</p></article>
        {messages.map(m=><article key={m.id} className={`ai-message ${m.role}`}><span className="ai-author">{m.role==='user'?'Bạn':'RideMate'}</span>{m.text&&<p>{m.text}</p>}{m.exploration&&<ExplorationReply exploration={m.exploration}/>}{m.reply&&<>
          <span className="ai-day-label">{m.reply.dayTitle}</span>{m.reply.intro&&<p>{m.reply.intro}</p>}
          <h3>Gợi ý cho chặng này</h3><p>{m.reply.suggestion}</p>
          {m.reply.assessment.driving!=null&&<p className="ai-evidence">{m.reply.assessment.source}: {Math.round(m.reply.assessment.driving)} phút chạy xe.{m.reply.assessment.total!=null&&` Tổng ${Math.round(m.reply.assessment.total)} phút gồm tham quan và ăn nghỉ, chưa tính phát sinh.`}</p>}
          <h3>Vì sao phù hợp với bạn</h3><ul>{m.reply.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
          <h3>Điểm dừng đề xuất</h3>{m.reply.stops.length?m.reply.stops.map(p=><div className="ai-stop" key={p.id}><b>{p.name}</b><p>{supportTypes[p.type].label} · ứng viên gần đoạn tuyến đã xác định của ngày này, khoảng {Math.round(p.segmentDistance)} m theo đường thẳng. Chưa tính đường đi vòng hoặc xác minh giờ mở cửa.</p><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${p.coordinates[1]},${p.coordinates[0]}`}>Xem ghim</a> · <a target="_blank" rel="noreferrer" href={p.source}>Nguồn OpenStreetMap</a></div>):<p>Chưa đủ dữ liệu tuyến của riêng ngày này để chọn điểm nghỉ, đổ xăng, ăn hoặc sửa xe phù hợp. Hãy định vị các điểm trong lịch trình; tôi sẽ không tự đoán địa điểm.</p>}
          <p className="ai-muted">Chưa xác minh thời tiết, lượng xăng còn lại hay khả năng đi xe máy trên toàn tuyến. Dữ liệu bản đồ có thể thiếu; cần đối chiếu biển báo thực tế.</p>
          {m.reply.proposal&&<div className="ai-proposal"><button className="soft" disabled={busy||daySignature(trip,trip.itinerary.find(d=>d.id===m.reply.dayId)||day)!==m.reply.signature} onClick={()=>setShowProposal(showProposal===m.id?null:m.id)}>Xem phương án điều chỉnh</button>{showProposal===m.id&&<div><p>Chuyển <b>{m.reply.proposal.name}</b> — điểm tham quan cuối còn phù hợp để giảm — sang Để sau để giảm một lượt tham quan. Chưa khẳng định giảm được thời gian chạy; cần tính lại tuyến. Các điểm khác được giữ nguyên.</p><button className="green" disabled={busy} onClick={()=>apply(m.reply,m.reply.proposal)}>Áp dụng: để điểm này lại sau</button></div>}</div>}
          {m.reply.question&&<><h3>Để tư vấn sát hơn (không bắt buộc)</h3><p>{m.reply.question.label}</p></>}
        </>}</article>)}

        {busy&&<p role="status" className="ai-thinking">Đang đọc yêu cầu và đối chiếu kế hoạch…</p>}
      </div>
      <div className="ai-compose-area">
        {service.ready&&service.authRequired&&!userId&&<p className="ai-muted">Bạn vẫn dùng được đánh giá cơ bản. <button className="soft" onClick={()=>setPage('account')}>Đăng nhập để trò chuyện với AI</button></p>}
        {pending&&<button className="soft" disabled={busy} onClick={()=>{setPending(null);append({role:'assistant',text:'Bạn có thể tiếp tục với gợi ý hiện tại hoặc hỏi câu khác. Tôi sẽ để các thông tin chưa có ở trạng thái chưa xác minh.'});}}>Bỏ qua câu hỏi này</button>}
        {pending?.options&&<div className="ai-answer-options" aria-label={pending.label}>{pending.options.map(([value,label])=><button className="soft" disabled={busy} key={value} onClick={()=>saveAnswer(pending,value,label)}>{label}</button>)}</div>}
        {pending&&!pending.options&&<form className="ai-answer-form" onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('answer');const parsed=parseAnswer(pending,String(value));if(parsed!==null)saveAnswer(pending,parsed,String(value));}} key={`${pending.dayId}:${pending.key}`}><label>{pending.label}<input name="answer" required type={pending.type} min={pending.min} max={pending.max} step={pending.type==='number'?'any':undefined} disabled={busy}/></label><button className="soft" disabled={busy}>Trả lời</button></form>}
        <div className="ai-quick-prompts">{quickPrompts.map(prompt=><button disabled={busy} key={prompt} onClick={()=>send(prompt)}>{prompt}</button>)}</div>
        {error&&<p role="alert" className="ai-error">{error}</p>}
        <form className="ai-composer" onSubmit={e=>{e.preventDefault();send();}}><label className="ai-sr-only" htmlFor="assistant-message">Tin nhắn cho AI Assistant</label><textarea id="assistant-message" value={text} maxLength={2000} disabled={busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}} placeholder="Hỏi về chặng đi hoặc cho tôi biết điều gì đã thay đổi…" rows={2}/><button className="green" disabled={busy||!text.trim()} type="submit">Gửi</button></form>
        <small>{online?'Khi gửi, câu hỏi, hồ sơ và tên các điểm trong kế hoạch được gửi tới OpenAI để hiểu yêu cầu.':'Chưa kết nối OpenAI. Các gợi ý hiện tại dựa trên tiêu chí và dữ liệu của RideMate.'} Chỉ thay đổi lịch trình khi bạn bấm Áp dụng.</small>
      </div>
    </section></div>
  </main>;
}

function ExplorationReply({exploration}) { return <div><span className="ai-author">RideMate · Gợi ý từ dữ liệu điểm đến</span><p>{exploration.text}</p><ul>{exploration.places.map(name=><li key={name}>{name} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${exploration.destination}`)}`} target="_blank" rel="noreferrer">Tìm trên bản đồ</a></li>)}</ul>{exploration.source?<a href={exploration.source} target="_blank" rel="noreferrer">Nguồn tham khảo: Vietnam Tourism</a>:<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`điểm tham quan ${exploration.destination}`)}`} target="_blank" rel="noreferrer">Tìm điểm tham quan trên bản đồ</a>}<p className="ai-muted">Chưa xác minh giờ mở cửa, vé, thời tiết hay điều kiện đường. Liên kết bản đồ là tìm kiếm theo tên, chưa phải ghim tọa độ đã xác minh.</p></div>; }
