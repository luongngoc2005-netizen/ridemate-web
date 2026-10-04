import {fingerprint} from './journal-sync.js';
import {validPlans} from './plans-data.js';
export const cloudPlans=payload=>payload?.trips || (payload?.trip?[payload.trip]:[]);
export const accountPlansKey=id=>`ridemate.account-plans.v1:${id}`;
export function readAccountPlans(storage,id){
  const raw=storage.getItem(accountPlansKey(id));
  if(!raw)return {plans:[],base:[]};
  const data=JSON.parse(raw);
  if(!validPlans(data.plans)||!validPlans(data.base))throw new Error('Không đọc được bản kế hoạch của tài khoản; dữ liệu cũ vẫn được giữ.');
  return data;
}
export function writeAccountPlans(storage,id,data){
  if(!validPlans(data.plans)||!validPlans(data.base))throw new Error('Dữ liệu kế hoạch không hợp lệ.');
  storage.setItem(accountPlansKey(id),JSON.stringify({plans:data.plans,base:data.base}));
}
const equal=(a,b)=>fingerprint({value:a})===fingerprint({value:b});
const keyed=a=>Array.isArray(a)&&a.every(x=>x&&typeof x.id==='string')&&new Set(a.map(x=>x.id)).size===a.length;
export function mergeValue(base,local,remote,path='plans',prefer=null) {
  if(equal(local,remote)||equal(base,remote))return local;
  if(equal(base,local))return remote;
  if([base,local,remote].every(keyed)){
    const b=new Map(base.map(x=>[x.id,x])),l=new Map(local.map(x=>[x.id,x])),r=new Map(remote.map(x=>[x.id,x]));
    const order=a=>a.filter(x=>b.has(x.id)).map(x=>x.id);
    const bo=order(base),lo=order(local),ro=order(remote);
    let ordered=remote;
    if(!equal(bo,lo)&&!equal(bo,ro)&&!equal(lo,ro)) {
      if(!prefer)throw Object.assign(new Error(`Xung đột thứ tự tại ${path}.`),{code:'PLAN_CONFLICT'});
      ordered=prefer==='local'?local:remote;
    }else if(!equal(bo,lo))ordered=local;
    const ids=[...new Set([...ordered,...local,...remote].map(x=>x.id))];
    return ids.map(id=>mergeValue(b.get(id),l.get(id),r.get(id),`${path}/${id}`,prefer)).filter(x=>x!==undefined);
  }
  if([base,local,remote].every(x=>x&&typeof x==='object'&&!Array.isArray(x))){
    const output={};for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
      const value=mergeValue(base[key],local[key],remote[key],`${path}/${key}`,prefer);if(value!==undefined)output[key]=value;
    }return output;
  }
  if(prefer)return prefer==='local'?local:remote;
  throw Object.assign(new Error(`Kế hoạch có thay đổi trùng nhau trên thiết bị khác (${path}). Bản đang sửa được giữ trên thiết bị này.`),{code:'PLAN_CONFLICT'});
}
export function mergePlans(base,local,remote,prefer=null){
  if(![base,local,remote].every(validPlans))throw new Error('Dữ liệu kế hoạch không hợp lệ.');
  const plans=mergeValue(base,local,remote,'plans',prefer);
  if(!validPlans(plans))throw new Error('Không thể hợp nhất kế hoạch.');return plans;
}
export async function syncPlans({base,local,read,commit,prefer=null}) {
  for(let attempt=0;attempt<3;attempt++){
    const row=await read(),payload=row?.payload||{version:1,trip:null,entries:[]};
    const remote=cloudPlans(payload),plans=mergePlans(base,local,remote,prefer);
    if(equal(plans,remote))return {plans,base:plans};
    try{
      // Preserve journals, photos and every unrelated workspace field.
      await commit({...payload,trips:plans,trip:plans.find(p=>p.id===payload.trip?.id)||plans[0]||null},row?.revision||0);
      return {plans,base:plans};
    }catch(error){if(error.code!=='40001')throw error;}
  }
  throw new Error('Tài khoản đang được cập nhật. Bản sửa được giữ; hãy thử đồng bộ lại.');
}
