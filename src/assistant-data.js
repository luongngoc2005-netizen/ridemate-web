import {assessDay, cleanProfile, daySignature, profileQuestions} from './ride-review.js';
import {routePosition, validPoint} from './places-data.js';
import {suggestionsFor} from './trip-data.js';

const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim();
export const intents = ['review','tomorrow','late','tired','rain','stops','prepare','explore','unknown'];
export function destinationReply(message,trip){
  const explicit=String(message).match(/(?:\sở\s|\stại\s)(.+?)[?!.]*$/i)?.[1]?.trim();
  const destination=explicit||trip.destination;
  const catalog=suggestionsFor(destination);
  return {destination:catalog?.name||destination,places:catalog?.places||[],source:catalog?.source,
    text:catalog?`Ở ${catalog.name}, bạn có thể cân nhắc ${catalog.places.join(', ')}. Đây là các gợi ý tham quan, chưa phải lịch đi trong một ngày. Với chuyến xe máy, nên chọn điểm muốn đi nhất trước rồi kiểm tra tuyến và thời gian còn lại để ghép lịch.`:`Tôi chưa có danh sách tham quan đã có nguồn cho ${destination}. Bạn có thể tìm trên bản đồ bên dưới; tôi chưa xác minh các kết quả đó.`};
}
export function detectIntent(text) {
  const q=normalize(text);
  if(/choi gi|di dau choi|tham quan|kham pha|diem du lich|co gi (?:hay|dep)|check.?in/.test(q))return 'explore';
  if(/khong (?:bi |thay |con |co )?(met|mua)|chua (met|mua)/.test(q))return 'unknown';
  if(/\b(met|duoi suc|buon ngu)\b/.test(q))return 'tired';
  if(/\b(mua|troi mua)\b/.test(q))return 'rain';
  if(/\b(muon|tre gio|tre hon)\b/.test(q) && /xuat phat|di tre|di muon|tre gio/.test(q))return 'late';
  if(/ngay mai/.test(q))return 'tomorrow';
  if(/cay xang|do xang|sua xe|diem dung|cho nghi|quan an/.test(q))return 'stops';
  if(/chuan bi|checklist|kiem tra xe/.test(q))return 'prepare';
  if(/kiem tra|lich trinh|ke hoach|chang|di the nao|danh gia/.test(q))return 'review';
  return 'unknown';
}
export function tomorrowDay(trip, now=new Date()) {
  // Use formatToParts rather than assuming the locale's field order.
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  const offset=Math.round((Date.UTC(+fields.year,+fields.month-1,+fields.day)+86400000-Date.parse(`${trip.date}T00:00:00Z`))/86400000);
  return Number.isInteger(offset)&&offset>=0&&offset<trip.itinerary.length ? trip.itinerary[offset] : null;
}
export function parseAnswer(question, text) {
  if(!question)return null;
  const q=normalize(text);
  if(question.options){
    const exact=question.options.find(([value,label])=>q===normalize(label)||q===value);
    if(exact)return exact[0];
    const aliases={bike:[['scooter',/^(toi di )?xe ga$/],['semi',/^(toi di )?xe so$/],['manual',/^(toi di )?xe con( tay)?$/]],party:[['solo',/^(toi )?di mot minh$/],['passenger',/^cho (them )?(mot nguoi|nguoi|ban)$/]],experience:[['new',/^(toi )?(chua quen|moi di|chua di xa)$/],['experienced',/^(toi )?(da quen|quen di xa)$/]],avoidDark:[['yes',/^(co|co tranh|tranh chay toi|toi muon tranh chay toi)$/],['no',/^(khong|khong uu tien)$/]]};
    return aliases[question.key]?.find(([,pattern])=>pattern.test(q))?.[0]||null;
  }
  if(question.type==='time'){
    const match=q.match(/^(?:(?:toi )?(?:du dinh )?(?:xuat phat|di|ket thuc)(?: luc)?\s*)?(\d{1,2})(?::|h| gio)(\d{2})?(?:\s*phut)?$/);
    if(!match||+match[1]>23||+(match[2]||0)>59)return null;
    return `${match[1].padStart(2,'0')}:${(match[2]||'00').padStart(2,'0')}`;
  }
  const match=q.match(/^(\d+(?:[.,]\d+)?)\s*(gio|tieng|phut)?$/);
  if(!match)return null;
  let n=Number(match[1].replace(',','.'));
  const hours=['hours','driving'].includes(question.key);
  if(hours&&match[2]==='phut')n/=60;
  if(!hours&&['gio','tieng'].includes(match[2]))n*=60;
  return n>=question.min&&n<=question.max ? String(n):null;
}
export function setDayAnswer(trip,dayId,key,value){
  return {...trip,itinerary:trip.itinerary.map(day=>day.id!==dayId?day:{...day,rideReview:{...day.rideReview,[key]:value,...(['driving','visit'].includes(key)?{[`${key}Signature`]:daySignature(trip,day)}:{})}})};
}
export function dayCandidates(trip,day,route,places,intent){
  if(!route)return [];
  // For multi-day plans, only consecutive located stops in this day define a known segment.
  const coordinates=trip.itinerary.length===1 ? route.coordinates : (route.legs||[]).filter(leg=>leg.start?.dayId===day.id&&leg.end?.dayId===day.id).flatMap(leg=>leg.coordinates||[]);
  if(!coordinates||coordinates.length<2)return [];
  const wanted=intent==='tired'||intent==='rain'?['rest','drink']:['fuel','rest','food','repair'];
  return wanted.flatMap(type=>{
    const eligible=places.filter(p=>p.type===type&&validPoint(p.coordinates)&&/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(p.source||''))
      .map(p=>({...p,segmentDistance:routePosition(p.coordinates,coordinates).distance}))
      .filter(p=>p.segmentDistance<=1500).sort((a,b)=>a.segmentDistance-b.segmentDistance);
    return eligible.slice(0,1);
  });
}
export function buildReply({trip,day,profile,route,places=[],intent='review',intro='',askFollowUp=true}){
  const assessment=assessDay(trip,day,profile,route,intent);
  const reasons=[assessment.preparation];
  if(profile.party==='passenger')reasons.push('Bạn chở thêm người: dành nhịp nghỉ phù hợp cho cả hai và đối chiếu giới hạn tải của xe.');
  if(profile.experience==='new')reasons.push('Bạn chưa quen đi xa: giữ lịch linh hoạt để có thể nghỉ thêm hoặc kết thúc chặng sớm.');
  if(profile.hours)reasons.push(`Bạn chọn tối đa ${profile.hours} giờ chạy/ngày; đây là mốc cá nhân để so sánh, không phải giới hạn an toàn chung.`);
  if(profile.avoidDark==='yes')reasons.push('Bạn muốn tránh chạy tối; giờ kết thúc do bạn chọn chưa phải giờ hoàng hôn đã xác minh.');
  const overview=day.places.length ? `Chặng này có ${day.places.length} điểm đã lên lịch: ${day.places.slice(0,3).map(p=>p.name).join(', ')}${day.places.length>3?'…':''}. Ưu tiên những điểm bạn muốn giữ nhất, dành thời gian nghỉ giữa chặng và để các điểm còn lại linh hoạt. Chưa đủ cơ sở để kết luận lịch vừa sức nếu thiếu thời gian hoặc giới hạn người lái.` : 'Chặng này chưa có điểm dừng. Hãy chọn điểm đến chính trước, sau đó bổ sung chỗ nghỉ và đổ xăng theo tuyến đã xác định.';
  let suggestion=assessment.issues.join(' ') || overview;
  if(intent==='stops')suggestion='Tôi sẽ ưu tiên điểm nghỉ, đổ xăng, ăn và sửa xe gần đoạn tuyến của ngày này. Các ứng viên có dữ liệu bản đồ được liệt kê bên dưới; giờ mở cửa và đường đi vòng vẫn cần kiểm tra.';
  if(intent==='prepare')suggestion='Đối chiếu checklist giấy tờ, lốp, phanh, đèn và bảo dưỡng theo hướng dẫn xe. Phần chuẩn bị cụ thể bên dưới dựa trên hồ sơ của bạn.';
  if(intent==='unknown')suggestion='Ở chế độ cơ bản, tôi chưa hiểu chắc câu này. Bạn có thể chọn “Kiểm tra chuyến đi của tôi”, hỏi về điểm dừng hoặc báo thay đổi hành trình.';
  return {intro,dayId:day.id,dayTitle:`Ngày ${trip.itinerary.indexOf(day)+1}: ${day.title}`,signature:daySignature(trip,day),suggestion,reasons,assessment,
    question:askFollowUp?assessment.question:undefined,stops:dayCandidates(trip,day,route,places,intent),
    proposal:assessment.issues.length>0?day.places.filter(p=>!p.category||p.category==='attraction').at(-1)||null:null,
    capturedAt:Date.now()};
}
export function nextProfile(profile,key,value){return cleanProfile({...profile,[key]:value});}
export const isProfileKey=key=>profileQuestions.some(q=>q.key===key);
