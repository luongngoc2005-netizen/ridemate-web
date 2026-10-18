const pad=value=>String(value).padStart(2,'0');
export function clockParts(value){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value||''))return null;
  const [hour,minute]=value.split(':').map(Number);
  return {hour:hour%12||12,minute,period:hour>=12?'PM':'AM'};
}
export function clockValue({hour,minute,period}){
  if(!Number.isInteger(hour)||hour<1||hour>12||!Number.isInteger(minute)||minute<0||minute>59||!['AM','PM'].includes(period))return '';
  return `${pad(hour%12+(period==='PM'?12:0))}:${pad(minute)}`;
}
export function clockLabel(value){const parts=clockParts(value);return parts?`${pad(parts.hour)}:${pad(parts.minute)} ${parts.period}`:'';}
