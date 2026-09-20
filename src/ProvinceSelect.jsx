import React from 'react';
import { provinces, travelDestinations } from './provinces.js';

export default function ProvinceSelect({ value = '', onChange, required = false, ...props }) {
  const legacy = value && !provinces.includes(value) && !travelDestinations.includes(value);
  return <select {...props} className="province-select" value={value} onChange={onChange} required={required}>
    <option value="">Chọn tỉnh/thành phố</option>
    <optgroup label="Tỉnh / thành phố">{provinces.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
    <optgroup label="Điểm đến du lịch">{travelDestinations.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
    {legacy && <optgroup label="Địa điểm đã lưu"><option value={value}>{value}</option></optgroup>}
  </select>;
}
