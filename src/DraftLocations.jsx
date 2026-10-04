import React, {useEffect,useState} from 'react';
import {findAttraction,locationKey} from './attraction-location.js';
import {chosenOrigin} from './origin-data.js';

export default function DraftLocations({draft,disabled,onChange}) {
  const [results,setResults]=useState({}),[retry,setRetry]=useState(0);
  const [manual,setManual]=useState({});
  const choose=(name,key,candidate)=>onChange({...draft,stopLocations:{...draft.stopLocations,[key]:{...candidate,requestedName:name,destination:draft.destination,confirmed:true}}});
  const manualPick=async(name,key)=>{
    try{
      const parts=(manual[key]||'').split(/[,;\s]+/).filter(Boolean).map(Number);
      if(parts.length!==2||!parts.every(Number.isFinite))throw new Error('Nhập vĩ độ, kinh độ, ví dụ 22.854, 106.722.');
      const point=await chosenOrigin([parts[1],parts[0]],{source:'manual'});
      choose(name,key,{...point,name,address:'Tọa độ do bạn đối chiếu và xác nhận',source:''});
    }catch(error){setResults(s=>({...s,[key]:{...s[key],error:error.message}}));}
  };
  const names=[...new Set(draft.days.flatMap(d=>d.stops).filter(n=>n.trim()))];
  const signature=JSON.stringify([draft.destination,names]);
  useEffect(()=>{
    if(disabled)return;
    const controller=new AbortController();setResults({});
    (async()=>{
      for(const name of names){
        if(controller.signal.aborted)return;
        const key=locationKey(name,draft.destination);
        if(draft.stopLocations?.[key])continue;
        try {
          const result=await findAttraction(name,draft.destination,controller.signal);
          if(!controller.signal.aborted)setResults(s=>({...s,[key]:result}));
        } catch(error){if(!controller.signal.aborted)setResults(s=>({...s,[key]:{error:error.message,candidates:[]}}));}
      }
    })();return ()=>controller.abort();
  },[signature,disabled,retry]);
  useEffect(()=>{
    const locations={...draft.stopLocations};let changed=false;
    for(const name of names){const key=locationKey(name,draft.destination),candidate=results[key]?.automatic;
      if(candidate&&!locations[key]){locations[key]={...candidate,requestedName:name,destination:draft.destination,confirmed:true};changed=true;}}
    if(changed&&!disabled)onChange({...draft,stopLocations:locations});
  },[results,draft,disabled]);
  return <section><h3>Vị trí điểm tham quan</h3><p>Đối chiếu tên và địa chỉ trước khi chọn. Điểm chưa xác định sẽ được báo thiếu trong kiểm tra lịch.</p>{names.map(name=>{
    const key=locationKey(name,draft.destination),p=draft.stopLocations?.[key],r=results[key];
    return <div className="box" key={key}><b>{name}</b>{p?<><p>{p.address || p.name} · {p.coordinates[1].toFixed(5)}, {p.coordinates[0].toFixed(5)}</p>{p.source&&<a href={p.source} target="_blank" rel="noreferrer">Nguồn OpenStreetMap</a>}{!disabled&&<button className="soft" onClick={()=>{const locations={...draft.stopLocations};delete locations[key];setResults(s=>({...s,[key]:{...s[key],automatic:null}}));onChange({...draft,stopLocations:locations});}}>Chọn lại</button>}</>:<><p role="status">{r?.error || (r ? r.candidates.length?'Chọn đúng địa điểm bên dưới.':'Chưa tìm thấy tọa độ phù hợp.':disabled?'Chưa có tọa độ đã xác nhận.':'Đang tìm địa điểm…')}</p>{r?.candidates.map(c=><button type="button" className="soft" disabled={disabled} key={c.id} onClick={()=>choose(name,key,c)}>{c.name} · {c.address} · {c.subtype==='cave_entrance'?'Cửa hang':c.subtype==='waterfall'?'Thác nước':c.subtype==='attraction'?'Điểm tham quan':c.subtype} · {c.coordinates[1].toFixed(5)}, {c.coordinates[0].toFixed(5)}</button>)}</>}
      <p><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p?`${p.coordinates[1]},${p.coordinates[0]}`:`${name}, ${draft.destination}`)}`}>Đối chiếu Google Maps</a></p>
      {!disabled&&<details><summary>Nhập tọa độ đã đối chiếu</summary><p>Trên Google Maps, bấm chuột phải đúng điểm → sao chép vĩ độ, kinh độ. Kiểm tra tên và địa chỉ trước khi xác nhận.</p><label>Vĩ độ, kinh độ<input value={manual[key]||''} onChange={e=>setManual(s=>({...s,[key]:e.target.value}))} placeholder="22.854, 106.722"/></label><button type="button" className="soft" onClick={()=>manualPick(name,key)}>Xác nhận vị trí này</button></details>}</div>;
  })}{!disabled&&<button className="soft" onClick={()=>setRetry(n=>n+1)}>Tìm lại các điểm còn thiếu</button>}</section>;
}
