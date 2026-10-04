import React,{useEffect,useRef,useState} from 'react';
import ProvinceSelect from './ProvinceSelect.jsx';
import RouteMap from './RouteMap.jsx';
import {requestLocation} from './geolocation.js';
import {chosenOrigin,validOriginPoint} from './origin-data.js';
import {searchPlannedCandidates} from './route-data.js';
import './origin-select.css';

export default function OriginSelect({value,onChange,label='Điểm xuất phát',confirmLabel='Dùng làm điểm xuất phát'}) {
  const [open,setOpen]=useState(false),[candidate,setCandidate]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState([]),[searching,setSearching]=useState(false);
  const dialog=useRef(null),dispose=useRef(null),sequence=useRef(0),searchRequest=useRef(null);
  useEffect(()=>()=>{sequence.current++;dispose.current?.();searchRequest.current?.abort();},[]);
  useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
  function close(){sequence.current++;dispose.current?.();searchRequest.current?.abort();setPending(false);setSearching(false);setOpen(false);}
  async function pick(coordinates,options) {
    const revision=++sequence.current;dispose.current?.();setPending(true);setError('');
    try {const point=await chosenOrigin(coordinates,options);if(revision===sequence.current)setCandidate(point);}
    catch(e){if(revision===sequence.current){setCandidate(null);setError(e.message);}}
    finally{if(revision===sequence.current)setPending(false);}
  }
  function gps(){dispose.current?.();const revision=++sequence.current;setPending(true);setError('');setCandidate(null);
    dispose.current=requestLocation({onPosition:point=>{if(revision===sequence.current)pick(point.coordinates,{source:'gps',accuracy:point.accuracy});},onError:message=>{if(revision===sequence.current){setPending(false);setError(message);}}});}
  function launch(mode){setOpen(true);setError('');setResults([]);setCandidate(validOriginPoint(value.originPoint)?value.originPoint:null);if(mode==='gps')gps();}
  async function search(){searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;setSearching(true);setError('');setResults([]);
    try{const found=await searchPlannedCandidates(query,null,controller.signal);if(!controller.signal.aborted){setResults(found);if(!found.length)setError('Chưa tìm thấy địa chỉ. Thử tên đường, phường/xã hoặc chọn trực tiếp trên bản đồ.');}}
    catch(e){if(!controller.signal.aborted)setError(e.message);}finally{if(!controller.signal.aborted)setSearching(false);}}
  return <div className="origin-field"><label>{label}<ProvinceSelect required value={value.origin} onChange={e=>{
    if(e.target.value==='__gps__'||e.target.value==='__map__'){launch(e.target.value==='__gps__'?'gps':'map');return;}
    onChange({...value,origin:e.target.value,originPoint:null});
  }} extraOptions={<optgroup label="Vị trí cụ thể"><option value="__gps__">Vị trí hiện tại của tôi (GPS)</option><option value="__map__">Chọn địa chỉ / ghim trên bản đồ</option></optgroup>}/></label><button type="button" className="origin-adjust" onClick={()=>launch('map')}>Chọn vị trí chính xác hơn</button>{validOriginPoint(value.originPoint)&&<small>Đã lưu tọa độ xuất phát. Vị trí không tự đổi khi bạn di chuyển.</small>}
    {open&&<dialog className="origin-dialog" ref={dialog} onCancel={close}><div className="title"><h2>Chọn điểm xuất phát</h2><button type="button" onClick={close} aria-label="Đóng chọn điểm xuất phát">Đóng</button></div><p>Dùng GPS hoặc bấm bản đồ để chọn đúng nơi bắt đầu. Bạn cần xác nhận trước khi lưu.</p><button type="button" className="soft" onClick={gps} disabled={pending}>Lấy vị trí hiện tại</button><div className="origin-search"><label>Tìm địa chỉ<input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(query.trim())search();}}} placeholder="Số nhà, tên đường, phường/xã, tỉnh/thành"/></label><button type="button" disabled={searching||!query.trim()} onClick={search}>{searching?'Đang tìm…':'Tìm'}</button></div>{results.length>0&&<ul>{results.map(p=><li key={p.id}><button type="button" onClick={()=>pick(p.coordinates,{source:'search'})}>{p.name} · {p.address}</button></li>)}</ul>}
      <RouteMap center={candidate} selected={candidate} onMapPick={coordinates=>pick(coordinates,{source:'map'})}/>
      {pending&&<p role="status">Đang xác định vị trí…</p>}{error&&<p role="alert">{error}</p>}{candidate&&<p>{candidate.label}{candidate.source==='gps'&&Number.isFinite(candidate.accuracy)?` · Sai số thiết bị khoảng ${Math.round(candidate.accuracy)} m. Nếu ghim chưa đúng, bấm bản đồ để chỉnh lại.`:' · Vị trí do bạn chọn, chưa xác minh địa chỉ.'}</p>}
      <p>Tọa độ này được lưu cùng hành trình, kể cả khi bạn lưu hành trình lên tài khoản.</p><button type="button" className="green" disabled={!candidate||pending} onClick={()=>{onChange({...value,origin:candidate.label,originPoint:candidate});close();}}>{confirmLabel}</button>
    </dialog>}
  </div>;
}
