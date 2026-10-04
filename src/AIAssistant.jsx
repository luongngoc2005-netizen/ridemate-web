import React, {useEffect, useRef, useState} from 'react';
import {useTripRoute} from './TripRouteContext.jsx';
import {PROFILE_KEY, cleanProfile, profileQuestions, deferPlace, restorePlace, daySignature} from './ride-review.js';
import {buildReply, detectIntent, tomorrowDay, parseAnswer, setDayAnswer, nextProfile, isProfileKey, destinationReply, intents} from './assistant-data.js';
import {supportTypes} from './places-data.js';
import {supabase} from './supabase.js';
import {requestAssistant} from './assistant-client.js';
import './ai-assistant.css';
import DraftReply from './DraftReply.jsx';
import {basicDraft,cleanDraft} from './assistant-draft.js';
import {chatAction,draftExample} from './assistant-chat.js';
import {startIntake,intakeQuestion,answerIntake,intakeContext,attachIntake} from './assistant-intake.js';
import DraftIntakeQuestion from './DraftIntakeQuestion.jsx';
import {useLocation} from './Location.jsx';
import {chosenOrigin} from './origin-data.js';

const quickPrompts=['Kiểm tra chuyến đi của tôi','Ngày mai tôi nên đi thế nào?','Tôi xuất phát muộn','Tôi đang mệt','Tôi đang gặp mưa','Chuẩn bị theo xe của tôi'];
const profileNames={bike:'Loại xe',party:'Người đi cùng',experience:'Kinh nghiệm',hours:'Giờ chạy mỗi ngày',avoidDark:'Tránh chạy tối'};

export default function AIAssistant(props) {
  return <Conversation key={props.userId||'guest'} {...props}/>;
}

function Conversation({trip,setTrip,initialReview,userId,setPage,onCreatePlan,onOpenPlan}) {
  const location=useLocation();
  const routeState=useTripRoute();
  const [profile,setProfile]=useState(()=>{try{return cleanProfile(JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}'));}catch{return {};}});
  const [storageError,setStorageError]=useState('');
  const [dayId,setDayId]=useState(trip?.itinerary[0]?.id);
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
  const day=trip?.itinerary.find(d=>d.id===dayId)||trip?.itinerary[0];
  const [draftId,setDraftId]=useState(null);
  const [intake,setIntake]=useState(null);
  const draftQuestion=intake?intakeQuestion(intake):null;
  const activeDraft=messages.find(m=>m.id===draftId&&!m.saved)?.draft||null;
  const contextRef=useRef();contextRef.current={trip,profile,day,routeState};
  const append=message=>setMessages(current=>[...current,{...message,id:++sequence.current}]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/assistant/status',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!controller.signal.aborted)setService({ready:data?.ready===true,authRequired:data?.authRequired!==false});}).catch(()=>{});
    return ()=>{controller.abort();request.current?.abort();};
  },[]);
  useEffect(()=>{const list=messageList.current;const last=list?.lastElementChild;if(last)list.scrollTo({top:last.offsetTop-list.offsetTop,behavior:'smooth'});},[messages.length,busy]);

  const respond=(messageIntent,target=day,currentTrip=trip,currentProfile=profile,intro='',askFollowUp=true)=>{
    if(!currentTrip||!target)return;
    const reply=buildReply({trip:currentTrip,day:target,profile:currentProfile,route:routeState.route,places:routeState.places,intent:messageIntent,intro,askFollowUp});
    append({role:'assistant',reply});
    setPending(reply.question?{...reply.question,dayId:target.id}:null);
    setIntent(messageIntent);
  };
  useEffect(()=>{
    if(initialReview&&trip&&!started.current){started.current=true;append({role:'user',text:quickPrompts[0]});respond('review');}
  },[initialReview]);

  const saveAnswer=(question,value,label=value)=>{
    if(!trip)return;
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

  const generatePlan=async(message,previous=null,details=null)=>{
    setPending(null);
    let next=null,mode='Gợi ý từ dữ liệu có sẵn';
    if(online){
      setBusy(true);const controller=new AbortController();request.current=controller;
      try{
        const result=await requestAssistant({message,previous,...(details?{context:intakeContext(details)}:{})},{client:supabase,signal:controller.signal,expectedUserId:userId,drafting:true});
        next=cleanDraft(result.draft);mode='Bản nháp do AI đề xuất';
      }catch(failure){if(controller.signal.aborted)return;append({role:'assistant',text:failure.message});return;}
      finally{setBusy(false);request.current=null;}
    }else if(!previous){
      const basic=basicDraft(message);
      if(basic&&(!details||details.days===3&&details.nights===2&&details.returnToOrigin))next=basic;
    }
    if(next){
      if(details)next=attachIntake(next,details);
      const id=++sequence.current;setMessages(current=>[...current,{id,role:'assistant',draft:next,mode}]);setDraftId(id);setIntake(null);
    }else append({role:'assistant',text:previous?'Tôi chưa xử lý được thay đổi này khi AI không sẵn sàng. Bản nháp vẫn được giữ ở trên.':'Thông tin chuyến đi đã được giữ trong cuộc trò chuyện. Hãy đăng nhập và cấu hình AI để tạo lịch trình theo yêu cầu, rồi bấm Thử tạo lịch trình.'});
  };
  const continueIntake=async(next)=>{
    setIntake(next);setError('');
    if(!intakeQuestion(next))await generatePlan(next.message,null,next);
  };
  const answerDraft=async(value,label=value)=>{
    if(!intake||!draftQuestion||busy)return;
    try{
      const next=answerIntake(intake,draftQuestion,String(value));
      append({role:'assistant',text:draftQuestion.label});append({role:'user',text:String(label)});
      await continueIntake(next);
    }catch(failure){setError(failure.message);}
  };
  const selectDraftOrigin=async(value)=>{
    if(!intake||busy||!value.origin?.trim())return;
    append({role:'assistant',text:draftQuestion?.label});append({role:'user',text:`Điểm đi: ${value.origin}`});
    await continueIntake({...intake,origin:value.origin,originPoint:value.originPoint||null,originArea:''});
  };

  const send=async raw=>{
    const message=String(raw??text).trim();if(!message||busy)return;
    setText('');setError('');
    const intakeAction=chatAction(message,{hasTrip:!!trip,hasDraft:!!activeDraft});
    if(intake&&/^(hủy|huỷ|huy|dừng|dung)(?:\s+yêu cầu)?[.!]?$/i.test(message)){
      setIntake(null);append({role:'user',text:message});append({role:'assistant',text:'Đã hủy yêu cầu đang trao đổi. Các kế hoạch và bản nháp đã có vẫn được giữ.'});return;
    }
    if(intake&&draftQuestion&&!['newDraft','greeting','thanks'].includes(intakeAction)){
      await answerDraft(message);return;
    }
    const answer=parseAnswer(pending,message);
    if(answer!==null){saveAnswer(pending,answer,message);return;}
    const action=chatAction(message,{hasTrip:!!trip,hasDraft:!!activeDraft});
    if(['greeting','thanks','clarify'].includes(action)){
      append({role:'user',text:message});
      append({role:'assistant',text:action==='greeting'?'Xin chào! Tôi là RideMate, hỗ trợ lên lịch và chuẩn bị chuyến du lịch bằng xe máy. Bạn muốn đi đâu và đi mấy ngày? Nếu chưa nêu điểm đi, tôi sẽ hỏi để dùng vị trí hiện tại.':action==='thanks'?'Rất vui được hỗ trợ bạn! Khi cần, bạn có thể hỏi thêm về lịch trình hoặc chuẩn bị xe trước chuyến đi.':'Bạn muốn tạo lịch trình, chỉnh bản nháp hay hỏi về chuyến đi? Hãy nói rõ yêu cầu; tôi sẽ không tự tạo hoặc thay đổi lịch khi chưa rõ ý bạn.'});
      return;
    }
    if(['draft','newDraft','editDraft'].includes(action)){
      setPending(null);append({role:'user',text:message});
      const previous=action==='newDraft'?null:activeDraft;
      if(!previous){
        let next=startIntake(message,profile);
        const position=location?.position;
        if(!next.origin&&position&&Number.isFinite(position.timestamp)&&Date.now()-position.timestamp<=30000){
          setBusy(true);
          try{
            const originPoint=await chosenOrigin(position.coordinates,{source:'gps',accuracy:position.accuracy});
            next={...next,origin:originPoint.label,originPoint};
          }catch(failure){setError(failure.message);}
          finally{setBusy(false);}
        }
        append({role:'assistant',text:next.returnToOrigin?'Tôi sẽ hỏi từng thông tin còn thiếu rồi tạo bản nháp. Lịch mặc định gồm chặng đi và quay về điểm xuất phát vào ngày cuối; bạn có thể yêu cầu đổi.':'Tôi sẽ hỏi từng thông tin còn thiếu rồi tạo bản nháp một chiều theo yêu cầu của bạn.'});
        await continueIntake(next);
      }else{
        // Edits retain confirmed metadata unless the user explicitly changes it.
        const parsed=startIntake(message);
        const details={...previous.details,originPoint:previous.originPoint,origin:previous.origin,destination:previous.destination,nights:previous.nights??previous.days.length-1,days:previous.days.length,returnToOrigin:previous.returnToOrigin!==false};
        if(parsed.origin){details.origin=parsed.origin;details.originPoint=null;}
        if(parsed.destination&&/(?:^|\s)(?:ở|tại|đến|tới)\s/i.test(message))details.destination=parsed.destination;
        if(parsed.days!=null)details.days=parsed.days;
        if(parsed.nights!=null)details.nights=parsed.nights;
        if(/không (?:quay )?về|một chiều/i.test(message))details.returnToOrigin=false;
        if(/(?:có|thêm) (?:chặng )?(?:quay )?về/i.test(message))details.returnToOrigin=true;
        await generatePlan(message,previous,details);
      }
      return;
    }
    let detected=detectIntent(message), target=day, interpreted=null;
    const explore=()=>{append({role:'user',text:message});append({role:'assistant',exploration:destinationReply(message,activeDraft||trip||{destination:"điểm đến bạn muốn khám phá"})});setPending(null);};
    // Source-backed destination suggestions also work without a paid AI call.
    if(detected==='explore'){explore();return;}
    if(online&&trip){
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
    <section className="card ai-conversation" aria-label="Trò chuyện với AI Assistant">
    {trip&&<details className="ai-context"><summary>Kế hoạch tham khảo: {trip.origin} → {trip.destination}</summary><span className="ai-kicker">KẾ HOẠCH ĐANG MỞ</span><h2>{trip.origin} → {trip.destination}</h2><p>{trip.days} ngày · {trip.date}</p>
      <label>Chặng đang trao đổi<select value={day.id} disabled={busy} onChange={e=>{setDayId(e.target.value);setPending(null);setIntent('review');setShowProposal(null);setError('');}}>{trip.itinerary.map((d,i)=><option key={d.id} value={d.id}>Ngày {i+1}: {d.title}</option>)}</select></label>
      <ol>{day.places.map(p=><li key={p.id}>{p.name}</li>)}</ol>{!day.places.length&&<p>Chưa có điểm dừng trong ngày này.</p>}
      <details><summary>Hồ sơ người lái</summary><p className="ai-muted">Dùng cho kế hoạch sau trên trình duyệt này, chưa đồng bộ tài khoản.</p><dl>{profileQuestions.map(q=><React.Fragment key={q.key}><dt>{profileNames[q.key]}</dt><dd>{q.options?.find(([v])=>v===profile[q.key])?.[1]||profile[q.key]||'Chưa có'} <button disabled={busy} onClick={()=>{setPending({...q,dayId:day.id});append({role:'assistant',text:q.label});}}>Sửa</button></dd></React.Fragment>)}</dl>{storageError&&<p role="alert">{storageError}</p>}</details>
      <details><summary>Điều chỉnh giờ và thời gian</summary><p className="ai-muted">Chọn thông tin cần cập nhật; trợ lý sẽ hỏi ngay trong cuộc trò chuyện.</p>{[{key:'departure',label:'Bạn dự định xuất phát lúc mấy giờ?',type:'time'},{key:'driving',label:'Bạn dự trù bao nhiêu giờ chạy xe riêng ngày này?',type:'number',min:0,max:24},{key:'visit',label:'Bạn dự trù bao nhiêu phút tham quan?',type:'number',min:0,max:1440},{key:'rest',label:'Bạn dành bao nhiêu phút ăn uống và nghỉ?',type:'number',min:0,max:1440},{key:'finishBy',label:'Bạn muốn kết thúc chạy xe trước mấy giờ?',type:'time'}].map(q=><button className="ai-context-edit" disabled={busy} key={q.key} onClick={()=>{setPending({...q,dayId:day.id});append({role:'assistant',text:q.label});}}>{({departure:'Giờ xuất phát',driving:'Thời gian chạy',visit:'Tham quan',rest:'Ăn và nghỉ',finishBy:'Giờ kết thúc'})[q.key]}: {day.rideReview?.[q.key]??'Chưa có'}</button>)}</details>
      {!!day.deferredPlaces?.length&&<details open><summary>Điểm để sau ({day.deferredPlaces.length})</summary>{day.deferredPlaces.map(p=><div className="ai-deferred" key={p.id}><span>{p.name}</span><button disabled={busy} onClick={()=>{const next=restorePlace(trip,day.id,p.id);setTrip(current=>restorePlace(current,day.id,p.id));respond('review',next.itinerary.find(d=>d.id===day.id),next,profile,`Đã đưa ${p.name} về cuối ngày. Cần tính lại thời gian.`);}}>Đưa lại lịch trình</button></div>)}</details>}
    </details>}
      <div className="ai-conversation-heading"><b>Đồng hành cùng chuyến đi của bạn</b><span>Dựa trên kế hoạch · hồ sơ người lái · dữ liệu bản đồ</span></div>
      <div className="ai-messages" ref={messageList} aria-live="polite" aria-relevant="additions">
        <article className="ai-message assistant"><span className="ai-author">RideMate</span><h2>Bạn muốn đi đâu?</h2><p>Hỏi về điểm đến hoặc nói chuyến đi bạn muốn. Tôi sẽ gợi ý lịch trình, cùng bạn chỉnh sửa và chỉ tạo kế hoạch sau khi bạn xác nhận — ngay trong cuộc trò chuyện này.</p></article>
        {messages.map(m=><article key={m.id} className={`ai-message ${m.role}`}><span className="ai-author">{m.role==='user'?'Bạn':'RideMate'}</span>{m.text&&<p>{m.text}</p>}{m.draft&&<DraftReply draft={m.draft} mode={m.mode} active={m.id===draftId} busy={busy} saved={m.saved} onOpenPlan={onOpenPlan} onChange={draft=>setMessages(current=>current.map(item=>item.id===m.id?{...item,draft}:item))} onCreatePlan={plan=>{onCreatePlan(plan);setMessages(current=>current.map(item=>item.id===m.id?{...item,saved:plan}:item));append({role:'assistant',text:'Đã lưu kế hoạch bạn xác nhận. Bạn có thể tiếp tục trò chuyện hoặc bấm Mở kế hoạch trong tin nhắn trên.'});}}/>}{m.exploration&&<ExplorationReply exploration={m.exploration}/>}{m.reply&&<>
          <span className="ai-day-label">{m.reply.dayTitle}</span>{m.reply.intro&&<p>{m.reply.intro}</p>}
          <h3>Gợi ý cho chặng này</h3><p>{m.reply.suggestion}</p>
          {m.reply.assessment.driving!=null&&<p className="ai-evidence">{m.reply.assessment.source}: {Math.round(m.reply.assessment.driving)} phút chạy xe.{m.reply.assessment.total!=null&&` Tổng ${Math.round(m.reply.assessment.total)} phút gồm tham quan và ăn nghỉ, chưa tính phát sinh.`}</p>}
          <h3>Vì sao phù hợp với bạn</h3><ul>{m.reply.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
          <h3>Điểm dừng đề xuất</h3>{m.reply.stops.length?m.reply.stops.map(p=><div className="ai-stop" key={p.id}><b>{p.name}</b><p>{supportTypes[p.type].label} · ứng viên gần đoạn tuyến đã xác định của ngày này, khoảng {Math.round(p.segmentDistance)} m theo đường thẳng. Chưa tính đường đi vòng hoặc xác minh giờ mở cửa.</p><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${p.coordinates[1]},${p.coordinates[0]}`}>Xem ghim</a> · <a target="_blank" rel="noreferrer" href={p.source}>Nguồn OpenStreetMap</a></div>):<p>Chưa đủ dữ liệu tuyến của riêng ngày này để chọn điểm nghỉ, đổ xăng, ăn hoặc sửa xe phù hợp. Hãy định vị các điểm trong lịch trình; tôi sẽ không tự đoán địa điểm.</p>}
          <p className="ai-muted">Chưa xác minh thời tiết, lượng xăng còn lại hay khả năng đi xe máy trên toàn tuyến. Dữ liệu bản đồ có thể thiếu; cần đối chiếu biển báo thực tế.</p>
          {m.reply.proposal&&<div className="ai-proposal"><button className="soft" disabled={busy||!trip||!day||daySignature(trip,trip.itinerary.find(d=>d.id===m.reply.dayId)||day)!==m.reply.signature} onClick={()=>setShowProposal(showProposal===m.id?null:m.id)}>Xem phương án điều chỉnh</button>{showProposal===m.id&&<div><p>Chuyển <b>{m.reply.proposal.name}</b> — điểm tham quan cuối còn phù hợp để giảm — sang Để sau để giảm một lượt tham quan. Chưa khẳng định giảm được thời gian chạy; cần tính lại tuyến. Các điểm khác được giữ nguyên.</p><button className="green" disabled={busy} onClick={()=>apply(m.reply,m.reply.proposal)}>Áp dụng: để điểm này lại sau</button></div>}</div>}
          {m.reply.question&&<><h3>Để tư vấn sát hơn (không bắt buộc)</h3><p>{m.reply.question.label}</p></>}
        </>}</article>)}

        {busy&&<p role="status" className="ai-thinking">Đang đọc yêu cầu và đối chiếu kế hoạch…</p>}
      </div>
      <div className="ai-compose-area">
        {intake&&draftQuestion&&<DraftIntakeQuestion key={draftQuestion.key} question={draftQuestion} value={intake} busy={busy} onAnswer={answerDraft} onOrigin={selectDraftOrigin} onCancel={()=>{setIntake(null);setError('');append({role:'assistant',text:'Đã hủy yêu cầu tạo lịch trình. Chưa lưu kế hoạch mới.'});}}/>}
        {intake&&!draftQuestion&&!busy&&<button className="green" onClick={()=>generatePlan(intake.message,null,intake)}>Thử tạo lịch trình</button>}
        {service.ready&&service.authRequired&&!userId&&<p className="ai-muted">Bạn vẫn dùng được đánh giá cơ bản. <button className="soft" onClick={()=>setPage('account')}>Đăng nhập để trò chuyện với AI</button></p>}
        {pending&&<button className="soft" disabled={busy} onClick={()=>{setPending(null);append({role:'assistant',text:'Bạn có thể tiếp tục với gợi ý hiện tại hoặc hỏi câu khác. Tôi sẽ để các thông tin chưa có ở trạng thái chưa xác minh.'});}}>Bỏ qua câu hỏi này</button>}
        {pending?.options&&<div className="ai-answer-options" aria-label={pending.label}>{pending.options.map(([value,label])=><button className="soft" disabled={busy} key={value} onClick={()=>saveAnswer(pending,value,label)}>{label}</button>)}</div>}
        <div className="ai-quick-prompts">{[draftExample,'Cao Bằng có gì chơi?',...(trip?quickPrompts:[])].map(prompt=><button disabled={busy} key={prompt} onClick={()=>send(prompt)}>{prompt}</button>)}</div>
        {error&&<p role="alert" className="ai-error">{error}</p>}
        <form className="ai-composer" onSubmit={e=>{e.preventDefault();send();}}><label className="ai-sr-only" htmlFor="assistant-message">Tin nhắn cho AI Assistant</label><textarea id="assistant-message" value={text} maxLength={2000} disabled={busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}} placeholder="Ví dụ: Cho tôi lịch trình 3N2Đ từ HN–CB…" rows={2}/><button className="green" disabled={busy||!text.trim()} type="submit">Gửi</button></form>
        <small>{online?'Khi tạo bản nháp, yêu cầu và thông tin chuyến đi được gửi tới model AI đã cấu hình. Tọa độ GPS được giữ để vẽ tuyến, không gửi trong thông tin tạo lịch trình.':'Chưa kết nối AI. Thông tin bạn trả lời vẫn được giữ trong phiên chat để tiếp tục.'} Chỉ lưu kế hoạch khi bạn xác nhận.</small>
      </div>
    </section>
  </main>;
}

function ExplorationReply({exploration}) { return <div><span className="ai-author">RideMate · Gợi ý từ dữ liệu điểm đến</span><p>{exploration.text}</p><ul>{exploration.places.map(name=><li key={name}>{name} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${exploration.destination}`)}`} target="_blank" rel="noreferrer">Tìm trên bản đồ</a></li>)}</ul>{exploration.source?<a href={exploration.source} target="_blank" rel="noreferrer">Nguồn tham khảo: Vietnam Tourism</a>:<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`điểm tham quan ${exploration.destination}`)}`} target="_blank" rel="noreferrer">Tìm điểm tham quan trên bản đồ</a>}<p className="ai-muted">Chưa xác minh giờ mở cửa, vé, thời tiết hay điều kiện đường. Liên kết bản đồ là tìm kiếm theo tên, chưa phải ghim tọa độ đã xác minh.</p></div>; }
