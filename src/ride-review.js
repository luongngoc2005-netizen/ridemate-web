export const PROFILE_KEY = 'ridemate.rider.v1';
export const profileQuestions = [
  { key: 'bike', label: 'Bạn đi loại xe nào?', options: [['scooter','Xe ga'],['semi','Xe số'],['manual','Xe côn']] },
  { key: 'party', label: 'Bạn đi một mình hay chở thêm người?', options: [['solo','Một mình'],['passenger','Chở thêm người']] },
  { key: 'experience', label: 'Bạn đã quen chạy xe đường dài chưa?', options: [['new','Chưa quen'],['experienced','Đã quen']] },
  { key: 'hours', label: 'Bạn muốn chạy xe tối đa bao nhiêu giờ mỗi ngày?', type: 'number', min: 1, max: 12 },
  { key: 'avoidDark', label: 'Bạn có muốn tránh chạy tối không?', options: [['yes','Có'],['no','Không ưu tiên']] },
];
export function cleanProfile(value) {
  const result = {};
  for (const q of profileQuestions) {
    const v = value?.[q.key];
    if (q.options ? q.options.some(([key]) => key === v) : v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= q.min && Number(v) <= q.max) result[q.key] = v;
  }
  return result;
}
const timeValid = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes = v => Number(v.slice(0,2))*60 + Number(v.slice(3));
const numeric = (v, max) => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max;
export const daySignature = (trip,day) => JSON.stringify([trip.origin,trip.originPoint,trip.destination,trip.itinerary.slice(0,trip.itinerary.indexOf(day)+1).map(d=>[d.id,d.places.map(p=>[p.id,p.name,p.coordinates])])]);
export function assessDay(trip, day, profile, route, situation = '') {
  const p = cleanProfile(profile), input = {...day.rideReview};
  const signature = daySignature(trip,day);
  if(input.drivingSignature!==signature) input.driving='';
  if(input.visitSignature!==signature) input.visit='';
  // The existing route does not describe every day's origin/end or overnight stop.
  const routeUsable = trip.itinerary.length === 1 && route?.mode === 'motorcycle' && !route.unresolved?.length && Number.isFinite(route.durationSeconds);
  const driving = numeric(input.driving, 24) ? Number(input.driving)*60 : routeUsable ? route.durationSeconds/60 : null;
  // Ask for information relevant to this request, never walk through the profile.
  let question;
  if (situation === 'prepare' && !p.bike) question = profileQuestions.find(q => q.key === 'bike');
  if (situation === 'late') question = {key:'departure',label:'Bạn dự định xuất phát lúc mấy giờ sau thay đổi?',type:'time'};
  const reviewSchedule = ['', 'review', 'tomorrow', 'late'].includes(situation);
  if (reviewSchedule) {
  if (!question && !timeValid(input.departure)) question = {key:'departure',label:'Chặng này bạn dự định xuất phát lúc mấy giờ?',type:'time'};
  if (!question && driving == null) question = {key:'driving',label:'Bạn dự trù bao nhiêu giờ chạy xe cho riêng chặng ngày này (chưa tính dừng)?',type:'number',min:0,max:24};
  if (!question && !numeric(input.visit, 1440)) question = {key:'visit',label:'Bạn dự trù tổng cộng bao nhiêu phút tham quan trong ngày này?',type:'number',min:0,max:1440};
  if (!question && !numeric(input.rest, 1440)) question = {key:'rest',label:'Bạn dành tổng cộng bao nhiêu phút cho ăn uống và nghỉ giữa chặng?',type:'number',min:0,max:1440};
  if (!question && p.avoidDark === 'yes' && !timeValid(input.finishBy)) question = {key:'finishBy',label:'Bạn muốn kết thúc chạy xe trước mấy giờ? (Mốc bạn chọn, chưa phải giờ hoàng hôn.)',type:'time'};
  }
  const total = driving == null || !numeric(input.visit,1440) || !numeric(input.rest,1440) ? null : driving+Number(input.visit)+Number(input.rest);
  const issues = [];
  if (driving != null && p.hours && driving > Number(p.hours)*60) issues.push('Thời gian chạy xe vượt mức bạn muốn trong một ngày; cân nhắc chia lại chặng hoặc nghỉ sớm.');
  if (total != null && timeValid(input.departure) && p.avoidDark === 'yes' && timeValid(input.finishBy) && minutes(input.departure)+total > minutes(input.finishBy)) issues.push('Tổng thời gian chạy, tham quan và nghỉ vượt mốc kết thúc bạn chọn; nên giảm điểm tham quan hoặc chia chặng.');
  if (driving >= 120 && numeric(input.rest,1440) && Number(input.rest) < 15) issues.push('Lịch đang dành dưới 15 phút nghỉ cho ít nhất 2 giờ chạy; cân nhắc tăng thời gian nghỉ theo thể trạng.');
  if (situation === 'late') issues.push('Xuất phát muộn làm giảm quỹ thời gian còn lại. Cân nhắc để một điểm tham quan lại sau, không cố bù giờ bằng tăng tốc.');
  if (situation === 'tired') issues.push('Ưu tiên dừng ở nơi phù hợp để nghỉ và giảm lịch trình; chưa đủ dữ liệu để chỉ định nơi nghỉ gần vị trí hiện tại.');
  if (situation === 'rain') issues.push('Nếu bạn đang gặp mưa, cân nhắc trú nghỉ và giảm lịch trình. Chưa có dữ liệu để ước tính phần thời gian tăng thêm.');
  const preparation = p.bike === 'scooter' ? 'Xe ga: đối chiếu lịch kiểm tra lốp, phanh và bộ truyền động theo hướng dẫn xe.' : p.bike === 'manual' ? 'Xe côn: thêm kiểm tra côn và bộ truyền động theo hướng dẫn xe.' : p.bike === 'semi' ? 'Xe số: thêm kiểm tra bộ truyền động và thao tác sang số theo hướng dẫn xe.' : 'Cần loại xe để điều chỉnh phần chuẩn bị.';
  return {question,driving,total,issues,source: numeric(input.driving,24) ? 'Thời gian chạy do bạn dự trù' : routeUsable ? 'Ước tính tuyến Valhalla theo giả định lập kế hoạch của RideMate' : 'Chưa có thời gian chạy cho riêng ngày này',preparation: p.bike ? preparation : 'Kiểm tra lốp, phanh, đèn và bảo dưỡng theo hướng dẫn xe; bạn có thể bổ sung loại xe khi cần tư vấn cụ thể hơn.'};
}
export function deferPlace(trip, dayId, placeId) {
  return {...trip,itinerary:trip.itinerary.map(day => {
    const place = day.places.find(p=>p.id===placeId);
    if(day.id!==dayId || !place) return day;
    return {...day,places:day.places.filter(p=>p.id!==placeId),deferredPlaces:[...(day.deferredPlaces||[]),place],rideReview:{...day.rideReview,driving:'',visit:''}};
  })};
}
export function restorePlace(trip, dayId, placeId) {
  return {...trip,itinerary:trip.itinerary.map(day=> {
    const place = day.deferredPlaces?.find(p=>p.id===placeId);
    if(day.id!==dayId || !place || day.places.some(p=>p.id===placeId))return day;
    return {...day,places:[...day.places,place],deferredPlaces:day.deferredPlaces.filter(p=>p.id!==placeId),rideReview:{...day.rideReview,driving:'',visit:''}};
  })};
}
