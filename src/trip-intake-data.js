import {answerIntake,startIntake} from './assistant-intake.js';
import {cleanProfile} from './ride-review.js';
import {validOriginPoint} from './origin-data.js';

export function startFormIntake(message,profile={}){
 const next=startIntake(message,profile),q=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 const people=q.match(/\b(\d+)\s*nguoi\b/),vehicles=q.match(/\b(\d+)\s*xe\b/);
 const date=q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/),dateVN=q.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
 const time=q.match(/\b(?:luc|gio di|xuat phat)\s*(\d{1,2})(?::|h)(\d{2})\b/);
 if(people)next.people=Number(people[1]);if(vehicles)next.vehicles=Number(vehicles[1]);
 if(date)next.date=date[0];else if(dateVN)next.date=`${dateVN[3]}-${dateVN[2].padStart(2,'0')}-${dateVN[1].padStart(2,'0')}`;
 if(time)next.departure=`${time[1].padStart(2,'0')}:${time[2]}`;
 if(/\bxe (?:tay )?ga\b/.test(q))next.bike='scooter';else if(/\bxe so\b/.test(q))next.bike='semi';else if(/\bxe con\b/.test(q))next.bike='manual';
 const interests=[['thien nhien','Thiên nhiên'],['am thuc','Ẩm thực'],['van hoa','Văn hóa'],['nghi duong','Nghỉ dưỡng']].filter(([match])=>q.includes(match)).map(([,label])=>label);
 if(interests.length)next.preferences=interests.join(', ');
 return next;
}

export function validateTripIntake(value){
 let next={...startIntake(value.message||'Tạo lịch trình'),...value,...cleanProfile(value)};
 for(const key of ['origin','destination'])if(typeof next[key]!=='string'||!next[key].trim()||next[key].length>200||next[key]==='Chưa xác định')throw Error('Hãy chọn điểm xuất phát và điểm đến.');
 for(const [key,min,max] of [['days',1,7],['nights',0,7],['people',1,30],['vehicles',1,30]]){
  if(next[key]==null)throw Error('Hãy điền số ngày, số đêm, số người và số xe.');
  next=answerIntake(next,{key,min,max},String(next[key]));
 }
 if(next.nights>next.days)throw Error('Số đêm không được lớn hơn số ngày.');
 if(next.vehicles>next.people||next.people>next.vehicles*2)throw Error('Mỗi xe tối đa 2 người; số xe không lớn hơn số người.');
 next=answerIntake(next,{key:'date'},next.date||'');next=answerIntake(next,{key:'departure'},next.departure||'');
 if(typeof next.preferences!=='string'&&next.preferences!=null||next.preferences?.length>600)throw Error('Sở thích tối đa 600 ký tự.');
 next.preferences=next.preferences?.trim()||'Không có yêu cầu riêng';
 if(validOriginPoint(next.originPoint)&&!next.originPoint.area&&!next.originArea)throw Error('Chưa nhận diện được khu vực GPS. Hãy chọn tỉnh/thành xuất phát hoặc một địa chỉ có tên.');
 return next;
}
