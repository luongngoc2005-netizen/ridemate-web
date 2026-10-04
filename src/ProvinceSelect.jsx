import React from 'react';
import { provinces, travelDestinations } from './provinces.js';
import {provinceLocation,provinceMapUrl} from './province-locations.js';

export default function ProvinceSelect({ value = '', onChange, required = false, extraOptions, ...props }) {
  const legacy = value && !provinces.includes(value) && !travelDestinations.includes(value);
  const point=provinceLocation(value);
  return <><select {...props} className="province-select" value={value} onChange={onChange} required={required}>
    <option value="">Chọn tỉnh/thành phố</option>
    {extraOptions}
    <optgroup label="Tỉnh / thành phố">{provinces.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
    <optgroup label="Điểm đến du lịch">{travelDestinations.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
    {legacy && <optgroup label="Địa điểm đã lưu"><option value={value}>{value}</option></optgroup>}
  </select>{point&&<small><a href={provinceMapUrl(point)} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>Xem ghim {point.name}</a> · Điểm đại diện, cần chọn địa chỉ cụ thể khi chốt tuyến.</small>}</>;
}
