import {cleanProfile,profileQuestions} from './ride-review.js';
import {validOriginPoint} from './origin-data.js';

const fold=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
const text=value=>typeof value==='string'?value.trim():'';
const place=value=>{
  const s=text(value).replace(/[.!?]+$/,'').trim();
  return ({hn:'Hà Nội',cb:'Cao Bằng'})[fold(s)]||s;
};
const validDate=value=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
export function requestedDuration(message){
  const q=fold(message);
  const compact=q.match(/\b(\d+)\s*n\s*(\d+)\s*d\b/);
  const days=q.match(/\b(\d+)\s*ngay\b/),nights=q.match(/\b(\d+)\s*dem\b/);
  return {days:compact?+compact[1]:days?+days[1]:null,nights:compact?+compact[2]:nights?+nights[1]:null};
}
export function requestedPlaces(message){
  const q=fold(message);
  const truncate=value=>place(value.split(/\s+(?=\d+\s*(?:ngày|ngay|n\s*\d))/i)[0].split(/\s+(?:gồm|bao gồm|với|ngày đi|khởi hành|xuất phát lúc)(?:\s|$)/i)[0].split(/[,;]\s*(?:không|có|thích|ưu tiên|gồm|với|ngày|xuất|chỉ|một chiều)/i)[0]);
  const route=q.match(/\btu\s+(.+?)\s*(?:den\b|toi\b|di\b|[-–→])\s*(.+)/);
  if(route){
    const start=route.index+route[0].indexOf(route[1]);
    const end=route.index+route[0].lastIndexOf(route[2]);
    return {origin:truncate(message.slice(start,start+route[1].length)),destination:truncate(message.slice(end))};
  }
  // Abbreviated explicit routes such as HN–CB remain supported.
  if(/\bhn\s*[-–→]\s*cb\b/.test(q))return {origin:'Hà Nội',destination:'Cao Bằng'};
  const destination=message.match(/(?:^|\s)(?:ở|tại|đến|tới|đi|o|tai|den)\s+(?:địa điểm\s+)?(.+)/i);
  if(!destination)return {origin:'',destination:''};
  const start=destination.index+destination[0].lastIndexOf(destination[1]);
  return {origin:'',destination:truncate(message.slice(start))};
}
export function startIntake(message,profile={}){
  const locations=requestedPlaces(message),duration=requestedDuration(message);
  if(/^(?:vi tri hien tai(?: cua toi)?|vi tri cua toi|day|toi)$/.test(fold(locations.origin)))locations.origin='';
  return {message,...locations,...duration,...cleanProfile(profile),date:'',departure:'',people:null,vehicles:null,preferences:null,originPoint:null,returnToOrigin:! /(?:khong\s+(?:quay\s+)?ve|mot chieu)/.test(fold(message))};
}
export function intakeQuestion(value){
  if(!text(value.origin))return {key:'origin',label:'Bạn chưa nêu điểm đi. Tôi sẽ dùng vị trí hiện tại khi bạn cho phép GPS. Bạn muốn lấy GPS hay nhập địa điểm xuất phát?',type:'origin'};
  if(validOriginPoint(value.originPoint)&&!text(value.originArea)&&!text(value.originPoint.area))return {key:'originArea',label:'Đã giữ tọa độ nhưng bản đồ chưa nhận diện được tên khu vực. Bạn đang ở tỉnh/thành hoặc khu vực nào?',type:'text'};
  if(!text(value.destination))return {key:'destination',label:'Bạn muốn đến địa điểm nào?',type:'text'};
  if(!Number.isInteger(value.days)||value.days<1||value.days>7)return {key:'days',label:'Bạn muốn đi bao nhiêu ngày? Hiện trợ lý tạo bản nháp từ 1 đến 7 ngày.',type:'number',min:1,max:7};
  if(!Number.isInteger(value.nights)||value.nights<0||value.nights>value.days)return {key:'nights',label:`Bạn muốn nghỉ bao nhiêu đêm trong ${value.days} ngày?`,type:'number',min:0,max:value.days};
  if(!validDate(value.date))return {key:'date',label:'Bạn dự định khởi hành ngày nào? Nhập ngày/tháng/năm hoặc chọn ngày bên dưới.',type:'date'};
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.departure||''))return {key:'departure',label:'Bạn muốn xuất phát lúc mấy giờ? Ví dụ 06:30.',type:'time'};
  if(!Number.isInteger(value.people)||value.people<1||value.people>30)return {key:'people',label:'Chuyến đi có bao nhiêu người?',type:'number',min:1,max:30};
  if(!Number.isInteger(value.vehicles)||value.vehicles<1||value.vehicles>value.people||value.people>value.vehicles*2)return {key:'vehicles',label:`${value.people} người đi bao nhiêu xe máy? Mỗi xe tối đa 2 người.`,type:'number',min:Math.ceil(value.people/2),max:value.people};
  for(const key of ['bike','experience','hours','avoidDark']){
    if(cleanProfile(value)[key]==null)return {...profileQuestions.find(q=>q.key===key)};
  }
  if(value.preferences==null)return {key:'preferences',label:'Bạn thích thiên nhiên, ẩm thực, văn hóa hay nghỉ dưỡng? Có điểm bắt buộc ghé, mức chi dự kiến hoặc yêu cầu chỗ nghỉ nào không?',type:'text',options:[['Thiên nhiên, lịch nhẹ','Thiên nhiên, lịch nhẹ'],['Ẩm thực và văn hóa','Ẩm thực và văn hóa'],['Không có yêu cầu riêng','Không có yêu cầu riêng']]};
  return null;
}
export function withIntakeOrigin(current,value){
  const point=validOriginPoint(value.originPoint)?value.originPoint:null;
  return {...current,origin:value.origin,originPoint:point,originArea:point?text(point.area)||text(value.originArea):''};
}
export function answerIntake(current,question,raw){
  const value=text(String(raw)),q=fold(value);
  let parsed=value;
  if(['days','nights','people','vehicles','hours'].includes(question.key)){
    const match=q.match(/^(\d+(?:[.,]\d+)?)\s*(?:ngay|dem|nguoi|xe|gio|tieng)?$/);
    parsed=match?Number(match[1].replace(',','.')):NaN;
    if(!Number.isFinite(parsed)||parsed<question.min||parsed>question.max||question.key!=='hours'&&!Number.isInteger(parsed))throw new Error(`Hãy nhập số ${question.key==='hours'?'': 'nguyên '}từ ${question.min} đến ${question.max}.`);
  }else if(question.key==='date'){
    const match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(match)parsed=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
    if(!validDate(parsed))throw new Error('Hãy nhập ngày hợp lệ dạng ngày/tháng/năm hoặc chọn ngày.');
  }else if(question.key==='departure'){
    const match=q.match(/^(\d{1,2})(?:[:h](\d{2}))?\s*(?:gio)?$/);
    if(match)parsed=`${match[1].padStart(2,'0')}:${match[2]||'00'}`;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(parsed))throw new Error('Hãy nhập giờ dạng HH:MM, ví dụ 06:30.');
  }else if(question.options&&question.key!=='preferences'){
    const choice=question.options.find(([key,label])=>q===fold(key)||q===fold(label));
    if(!choice)throw new Error('Hãy chọn một câu trả lời bên dưới.');
    parsed=choice[0];
  }else if(!value||value.length>(question.key==='preferences'?600:200))throw new Error('Hãy nhập thông tin ngắn gọn, không để trống.');
  let next={...current,[question.key]:parsed};
  if(question.key==='origin')next={...next,origin:place(parsed),originPoint:null,originArea:''};
  if(question.key==='destination')next.destination=place(parsed);
  if(question.key==='originArea'){
    const label=place(parsed);
    next={...next,origin:label,originArea:label,originPoint:{...current.originPoint,label}};
  }
  return next;
}
export function intakeContext(value){
  const context={};
  for(const key of ['origin','destination','date','departure','preferences'])if(text(value[key]))context[key]=text(value[key]);
  for(const key of ['days','nights','people','vehicles'])if(value[key]!=null)context[key]=value[key];
  return {...context,...cleanProfile(value),returnToOrigin:value.returnToOrigin!==false};
}
export function attachIntake(draft,value){
  return {...draft,...(value.origin?{origin:value.origin}:{}),...(value.destination?{destination:value.destination}:{}),nights:value.nights,returnToOrigin:value.returnToOrigin,details:intakeContext(value),
    ...(validOriginPoint(value.originPoint)?{originPoint:{...value.originPoint,coordinates:[...value.originPoint.coordinates]}}:{})};
}
