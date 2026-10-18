import React,{useState} from 'react';
import OriginSelect from './OriginSelect.jsx';
import ProvinceSelect from './ProvinceSelect.jsx';
import TimePicker from './TimePicker.jsx';
import {withIntakeOrigin} from './assistant-intake.js';
import {validateTripIntake} from './trip-intake-data.js';

export default function TripIntakeForm({value,busy,onChange,onSubmit,onCancel,onOrigin}){
 const [error,setError]=useState('');
 const update=(key,next)=>{setError('');onChange({...value,[key]:next});};
 return <form className="trip-intake-form" onSubmit={event=>{event.preventDefault();try{const next=validateTripIntake(value);setError('');onSubmit(next);}catch(e){setError(e.message);}}}>
  <h3>Thông tin chuyến đi</h3><p>Điền một lần để tạo lịch trình phù hợp với bạn.</p>
  <fieldset disabled={busy}>
   <div className="trip-intake-fields"><OriginSelect showLocationHint={false} value={{origin:value.origin||'',originPoint:value.originPoint}} onChange={origin=>onOrigin?onOrigin(origin):onChange(withIntakeOrigin(value,origin))}/>
    <label>Điểm đến<ProvinceSelect required showLocationHint={false} value={value.destination||''} onChange={e=>update('destination',e.target.value)}/></label>
    <label>Ngày đi<input type="date" required value={value.date||''} onChange={e=>update('date',e.target.value)}/></label>
    <TimePicker label="Giờ xuất phát" value={value.departure||''} required onChange={next=>update('departure',next)} disabled={busy}/>
    <label>Số ngày<input type="number" min={1} max={7} required value={value.days??''} onChange={e=>update('days',e.target.value===''?null:Number(e.target.value))}/></label>
    <label>Số đêm<input type="number" min={0} max={value.days||7} required value={value.nights??''} onChange={e=>update('nights',e.target.value===''?null:Number(e.target.value))}/></label>
    <label>Số người<input type="number" min={1} max={30} required value={value.people??''} onChange={e=>update('people',e.target.value===''?null:Number(e.target.value))}/></label>
    <label>Số xe máy<input type="number" min={value.people?Math.ceil(value.people/2):1} max={value.people||30} required value={value.vehicles??''} onChange={e=>update('vehicles',e.target.value===''?null:Number(e.target.value))}/></label>
   </div>
   <label>Sở thích và yêu cầu<textarea maxLength={600} value={value.preferences||''} onChange={e=>update('preferences',e.target.value)} placeholder="Thiên nhiên, ẩm thực, văn hóa, nghỉ dưỡng; điểm muốn ghé hoặc mức chi dự kiến…"/></label>
   <div className="intake-interest-options">{['Thiên nhiên','Ẩm thực','Văn hóa','Nghỉ dưỡng'].map(interest=>{const selected=(value.preferences||'').split(', ').includes(interest);return <button type="button" key={interest} aria-pressed={selected} onClick={()=>{const current=(value.preferences||'').split(', ').filter(Boolean);update('preferences',selected?current.filter(p=>p!==interest).join(', '):[...current,interest].join(', '));}}>{interest}</button>;})}</div>
   <label className="intake-return"><input type="checkbox" checked={value.returnToOrigin!==false} onChange={e=>update('returnToOrigin',e.target.checked)}/><span>Quay về điểm xuất phát vào ngày cuối</span></label>
   <details><summary>Thông tin xe và sức chạy (không bắt buộc)</summary><div className="trip-intake-fields"><label>Loại xe<select value={value.bike||''} onChange={e=>update('bike',e.target.value)}><option value="">Chưa cung cấp</option><option value="scooter">Xe ga</option><option value="semi">Xe số</option><option value="manual">Xe côn</option></select></label><label>Kinh nghiệm<select value={value.experience||''} onChange={e=>update('experience',e.target.value)}><option value="">Chưa cung cấp</option><option value="new">Chưa quen đi xa</option><option value="experienced">Đã quen đi xa</option></select></label><label>Giờ chạy tối đa/ngày<input type="number" min={1} max={12} step="0.5" value={value.hours??''} onChange={e=>update('hours',e.target.value)}/></label><label>Tránh chạy tối<select value={value.avoidDark||''} onChange={e=>update('avoidDark',e.target.value)}><option value="">Chưa cung cấp</option><option value="yes">Có</option><option value="no">Không ưu tiên</option></select></label></div></details>
   {error&&<p className="ai-error" role="alert">{error}</p>}
   <div className="intake-submit"><button className="green" type="submit">{busy?'Đang tạo lịch trình…':'Tạo lịch trình'}</button><button className="soft" type="button" onClick={onCancel}>Hủy yêu cầu</button></div>
  </fieldset>
 </form>;
}
