import {detectIntent} from './assistant-data.js';
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
export const draftExample='Cho tôi lịch trình 3N2Đ từ HN - CB gồm các điểm chơi, nghỉ, phí vé tham quan và đồ nên chuẩn bị';
export function chatAction(message,{hasTrip=false,hasDraft=false}={}){
  const q=normalize(message),intent=detectIntent(message);
  const newDraft=/\b\d+\s*(?:n\s*\d+\s*d|ngay)\b/.test(q)&&/lich trinh|ke hoach|tu |di |hn|cb/.test(q)||/lap lich|len lich|tao (?:lich trinh|ke hoach)|lich trinh moi/.test(q);
  const editDraft=hasDraft&&/bo |bot |them |doi |sua |giam |nhe hon|nghi hon|homestay|chi co|neu chi|thay /.test(q);
  if(newDraft)return 'newDraft';
  if(editDraft)return 'editDraft';
  if(intent==='explore')return 'explore';
  if(hasTrip&&intent!=='unknown')return 'review';
  if(hasDraft)return 'editDraft';
  return hasTrip?'review':'draft';
}
