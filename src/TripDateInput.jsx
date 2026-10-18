import React, { useEffect, useRef, useState } from 'react';
import ToolIcon from './ToolIcon.jsx';

const displayDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : '';
function isoDate(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return '';
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number(year) > 0 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

export default function TripDateInput({ value, onChange }) {
  const [text, setText] = useState(() => displayDate(value));
  const emitted = useRef(value), input = useRef(null);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value; setText(displayDate(value)); input.current?.setCustomValidity('');
    }
  }, [value]);
  const update = next => {
    const iso = isoDate(next);
    setText(next); emitted.current = iso;
    input.current?.setCustomValidity(next && !iso ? 'Nhập ngày hợp lệ theo dạng dd/mm/yyyy.' : '');
    onChange(iso);
  };
  return <span className="trip-date-input">
    <input ref={input} aria-label="Ngày đi" type="text" inputMode="numeric" required maxLength={10} placeholder="dd/mm/yyyy" value={text} onChange={event => { const digits = event.target.value.replace(/\D/g, '').slice(0, 8); update([digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/')); }} />
    <span className="trip-date-picker"><ToolIcon name="calendar" className="inline-icon"/><input aria-label="Chọn ngày đi trên lịch" type="date" value={value || ''} onChange={event => update(displayDate(event.target.value))}/></span>
  </span>;
}
