import React,{useState} from 'react';
import {provinceLocations,provinceMapUrl} from './province-locations.js';
export default function ProvinceDirectory(){
  const [query,setQuery]=useState('');
  const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
  return <section className="box"><h2>Vị trí tỉnh/thành Việt Nam</h2><p>34 tỉnh/thành có sẵn tọa độ để tải bản đồ nhanh. Ghim là điểm đại diện của khu vực; hãy chọn địa chỉ xuất phát và nơi nghỉ cụ thể trước khi chốt hành trình.</p><label>Tìm tỉnh/thành<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ví dụ: Cao Bằng, Lạng Sơn"/></label><ul>{provinceLocations.filter(p=>fold(p.name).includes(fold(query))).map(p=><li key={p.name}><a href={provinceMapUrl(p)} target="_blank" rel="noopener noreferrer">{p.name} — Xem ghim</a> · <a href={p.source} target="_blank" rel="noopener noreferrer">Nguồn OpenStreetMap</a></li>)}</ul></section>;
}
