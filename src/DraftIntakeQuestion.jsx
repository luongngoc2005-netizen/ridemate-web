import React,{useEffect,useRef,useState} from 'react';
import OriginSelect from './OriginSelect.jsx';
import {useLocation} from './Location.jsx';
import {requestLocation} from './geolocation.js';
import {chosenOrigin} from './origin-data.js';

export default function DraftIntakeQuestion({question,value,busy,onAnswer,onOrigin,onCancel}){
  const location=useLocation(),dispose=useRef(null),revision=useRef(0),lookup=useRef(null);
  const [locating,setLocating]=useState(false),[error,setError]=useState(''),[input,setInput]=useState('');
  useEffect(()=>()=>{revision.current++;dispose.current?.();lookup.current?.abort();},[]);
  const accept=async(point,version)=>{
    const controller=new AbortController();lookup.current?.abort();lookup.current=controller;
    try{
      const originPoint=await chosenOrigin(point.coordinates,{source:'gps',accuracy:point.accuracy,resolveArea:true,signal:controller.signal});
      if(version===revision.current){setLocating(false);onOrigin({origin:originPoint.label,originPoint});}
    }catch(e){if(version===revision.current){setError(e.message);setLocating(false);}}
  };
  const gps=()=>{
    dispose.current?.();lookup.current?.abort();const version=++revision.current;setError('');setLocating(true);
    const position=location?.position;
    if(position&&Number.isFinite(position.timestamp)&&Date.now()-position.timestamp<=30000){accept(position,version);return;}
    dispose.current=requestLocation({onPosition:point=>accept(point,version),onError:message=>{if(version===revision.current){setError(message);setLocating(false);}}});
  };
  const disabled=busy||locating;
  return <div className="ai-intake-question"><p><b>{question.label}</b></p>
    {question.type==='origin'&&<>
      <button type="button" className="green" disabled={disabled} onClick={gps}>{locating?'Đang lấy vị trí và nhận diện khu vực…':'Dùng vị trí hiện tại (GPS)'}</button>
      <p className="ai-muted">GPS dùng làm điểm đi và tra tên khu vực qua Photon/OpenStreetMap. Sau khi nhận diện, trợ lý tự tiếp tục. Nếu bị từ chối, nhập địa chỉ hoặc chọn trên bản đồ. Tọa độ chỉ lưu cùng kế hoạch sau khi xác nhận.</p>
      <fieldset disabled={disabled}><OriginSelect value={{origin:value.origin||'',originPoint:value.originPoint}} onChange={onOrigin}/></fieldset>
    </>}
    {question.options&&<div className="ai-answer-options">{question.options.map(([answer,label])=><button type="button" className="soft" disabled={disabled} key={answer} onClick={()=>onAnswer(answer,label)}>{label}</button>)}</div>}
    {['date','time','number'].includes(question.type)&&<form className="ai-answer-form" onSubmit={event=>{event.preventDefault();onAnswer(input);}}>
      <label>{question.type==='date'?'Ngày đi':question.type==='time'?'Giờ đi':'Câu trả lời'}<input type={question.type} value={input} min={question.min} max={question.max} step={question.key==='hours'?'0.5':undefined} required disabled={disabled} onChange={e=>setInput(e.target.value)}/></label>
      <button className="green" disabled={disabled||!input} type="submit">Tiếp tục</button>
    </form>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" className="soft" disabled={disabled} onClick={onCancel}>Hủy yêu cầu tạo lịch trình</button>
  </div>;
}
