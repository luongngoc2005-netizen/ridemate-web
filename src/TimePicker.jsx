import React,{useEffect,useId,useRef,useState} from 'react';
import ToolIcon from './ToolIcon.jsx';
import {clockParts,clockValue,clockLabel} from './time-data.js';
import './time-picker.css';

export default function TimePicker({label='Giờ xuất phát',name,value,defaultValue='',onChange,required=false,disabled=false}){
  const [stored,setStored]=useState(defaultValue),[open,setOpen]=useState(false);
  const current=value===undefined?stored:value;
  const [draft,setDraft]=useState(()=>clockParts(current)||{hour:8,minute:0,period:'AM'});
  const id=useId(),root=useRef(null),trigger=useRef(null),panel=useRef(null);
  useEffect(()=>{
    if(!open)return;
    panel.current?.querySelector('select')?.focus();
    const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return ()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  const show=()=>{setDraft(clockParts(current)||{hour:8,minute:0,period:'AM'});setOpen(true);};
  const close=()=>{setOpen(false);trigger.current?.focus();};
  const choose=()=>{const next=clockValue(draft);setStored(next);onChange?.(next);close();};
  const hourAngle=(draft.hour%12)*30+draft.minute/2,minuteAngle=draft.minute*6;
  return <div className="time-picker" ref={root} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();}}}>
    <span className="time-picker-label" id={`${id}-label`}>{label}</span>
    <input className="time-picker-value" aria-label={label} data-field-label={label} name={name} value={current||''} onChange={()=>{}} onFocus={show} tabIndex={-1} required={required} disabled={disabled} pattern="([01][0-9]|2[0-3]):[0-5][0-9]"/>
    <button ref={trigger} type="button" className="time-picker-trigger" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-panel`} onClick={()=>open?close():show()}><ToolIcon name="clock"/><span id={`${id}-value`}>{clockLabel(current)||'Chọn giờ · AM/PM'}</span></button>
    {open&&!disabled&&<div className="time-picker-panel" ref={panel} id={`${id}-panel`} role="group" aria-label={`Chọn ${label.toLowerCase()}`}>
      <div className="time-picker-controls"><label>Giờ<select value={draft.hour} onChange={e=>setDraft({...draft,hour:Number(e.target.value)})}>{Array.from({length:12},(_,i)=>i+1).map(hour=><option key={hour} value={hour}>{String(hour).padStart(2,'0')}</option>)}</select></label><span aria-hidden="true">:</span><label>Phút<select value={draft.minute} onChange={e=>setDraft({...draft,minute:Number(e.target.value)})}>{Array.from({length:60},(_,minute)=><option key={minute} value={minute}>{String(minute).padStart(2,'0')}</option>)}</select></label></div>
      <div className="time-picker-period" role="group" aria-label="Buổi trong ngày">{['AM','PM'].map(period=><button type="button" key={period} aria-pressed={draft.period===period} onClick={()=>setDraft({...draft,period})}>{period}<small>{period==='AM'?'Trước 12 giờ trưa':'Từ 12 giờ trưa'}</small></button>)}</div>
      <div className="time-picker-dial" role="group" aria-label="Mặt đồng hồ chọn giờ">
        <svg viewBox="0 0 200 200" aria-hidden="true"><line className="time-picker-hour-hand" x1="100" y1="100" x2="100" y2="54" transform={`rotate(${hourAngle} 100 100)`}/><line className="time-picker-minute-hand" x1="100" y1="100" x2="100" y2="35" transform={`rotate(${minuteAngle} 100 100)`}/><circle cx="100" cy="100" r="5"/></svg>
        {Array.from({length:12},(_,i)=>i+1).map(hour=>{const angle=hour*Math.PI/6;return <button type="button" key={hour} aria-label={`${hour} giờ`} aria-pressed={draft.hour===hour} style={{left:`${50+39*Math.sin(angle)}%`,top:`${50-39*Math.cos(angle)}%`}} onClick={()=>setDraft({...draft,hour})}>{hour}</button>;})}
      </div>
      <p className="time-picker-preview" aria-live="polite">{clockLabel(clockValue(draft))} <span>· {clockValue(draft)} giờ</span></p>
      <div className="time-picker-actions"><button type="button" className="soft" onClick={close}>Hủy</button><button type="button" className="green" onClick={choose}>Chọn giờ</button></div>
    </div>}
  </div>;
}
