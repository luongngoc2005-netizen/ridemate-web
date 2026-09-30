import {readTrip,isStoredTrip} from './trip-data.js';
export const PLANS_KEY='ridemate.plans.v1';
export function validPlans(plans){return Array.isArray(plans)&&plans.every(isStoredTrip)&&new Set(plans.map(p=>p.id)).size===plans.length;}
export function readPlans(storage){
  try{const raw=storage.getItem(PLANS_KEY);if(raw!==null){const plans=JSON.parse(raw);if(!validPlans(plans))throw new Error();return {plans,error:''};}
    const old=readTrip(storage);return {plans:old.trip?[old.trip]:[],error:old.error};
  }catch{return {plans:[],error:'Không đọc được danh sách kế hoạch. Dữ liệu cũ chưa bị ghi đè.'};}
}
export function putPlan(plans,trip){return plans.some(p=>p.id===trip.id)?plans.map(p=>p.id===trip.id?trip:p):[trip,...plans];}
export function savePlans(storage,plans){if(!validPlans(plans))throw new Error('Danh sách kế hoạch không hợp lệ.');storage.setItem(PLANS_KEY,JSON.stringify(plans));}
