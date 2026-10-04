import {resolveOriginArea} from './origin-area.js';
export const validOriginPoint = point => point && Array.isArray(point.coordinates) && point.coordinates.length===2 && point.coordinates.every(Number.isFinite) && Math.abs(point.coordinates[0])<=180 && Math.abs(point.coordinates[1])<=90 && typeof point.label==='string' && point.label.trim().length>0;
export const tripOrigin = trip => validOriginPoint(trip.originPoint)&&trip.originPoint.label===trip.origin ? trip.originPoint : trip.origin;
export async function chosenOrigin(coordinates,{source='map',accuracy=null,resolveArea=false,signal,fetchImpl,geocoder}={}) {
  const point={coordinates:[...coordinates],label:source==='gps'?'Vị trí của tôi':'Vị trí đã chọn',source,accuracy};
  if(!validOriginPoint(point))throw new Error('Tọa độ điểm xuất phát không hợp lệ.');
  const {vietnam}=await import('./vietnam-guard.js');
  if(!vietnam.containsPoint(coordinates))throw new Error('Chỉ chọn điểm xuất phát trong Việt Nam.');
  point.label+=` (${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)})`;
  if(resolveArea)return resolveOriginArea(point,{signal,fetchImpl,geocoder});
  return point;
}
