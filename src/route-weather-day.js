import {loadRoute,resolveRoutePoint} from './route-data.js';
import {tripOrigin} from './origin-data.js';
import {validPoint} from './places-data.js';
import {cleanDayPlanning} from './trip-feasibility.js';

export async function loadWeatherDayRoute(trip,index,signal,{routeLoader=loadRoute,resolve=resolveRoutePoint}={}) {
  const day=trip.itinerary[index];
  if(!day)throw new Error('Ngày trong lịch trình không hợp lệ.');
  const missing=day.places.filter(p=>!validPoint(p.coordinates));
  if(missing.length)throw new Error(`Bổ sung vị trí trước khi phân tích: ${missing.map(p=>p.name).join(', ')}.`);
  const start=await resolve(tripOrigin(trip),signal),destination=await resolve(trip.destination,signal);
  const overnight=async i=>{
    const planning=cleanDayPlanning(trip.itinerary[i].planning);
    return planning.lodgingPoint?resolve(planning.lodgingPoint,signal):planning.lodgingName?resolve(planning.lodgingName,signal):destination;
  };
  const from=index===0?start:await overnight(index-1);
  const returning=index===trip.itinerary.length-1&&trip.returnToOrigin===true;
  const to=returning?start:await overnight(index);
  signal?.throwIfAborted();
  if(!day.places.length&&from.coordinates.every((v,i)=>v===to.coordinates[i]))throw new Error('Ngày này không có chặng di chuyển. Dùng dự báo tại điểm đến bên trên.');
  const route=await routeLoader(from,to,signal,day.places.map(p=>({...p,label:p.name,dayId:day.id,dayNumber:index+1})));
  return {route,lodgingAssumed:(index>0&&!trip.itinerary[index-1].planning?.lodgingPoint&&!trip.itinerary[index-1].planning?.lodgingName)||(!returning&&!day.planning?.lodgingPoint&&!day.planning?.lodgingName)};
}
