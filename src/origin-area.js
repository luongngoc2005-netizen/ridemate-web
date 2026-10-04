const env=import.meta.env||{};
const tidy=value=>typeof value==='string'?value.trim().slice(0,180):'';
const distance=(a,b)=>{
  const radians=x=>x*Math.PI/180;
  const lat=radians(b[1]-a[1]),lon=radians(b[0]-a[0]);
  const h=Math.sin(lat/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(lon/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
};
export function originAreaResult(features,coordinates){
  const candidates=(Array.isArray(features)?features:[]).filter(f=>f.properties?.countrycode?.toUpperCase()==='VN'&&Array.isArray(f.geometry?.coordinates)&&f.geometry.coordinates.length===2&&f.geometry.coordinates.every(Number.isFinite))
    .map(f=>({feature:f,distance:distance(coordinates,f.geometry.coordinates)})).filter(f=>f.distance<=3000).sort((a,b)=>a.distance-b.distance);
  for(const {feature} of candidates){
    const p=feature.properties;
    const area=tidy(p.state)||tidy(p.city)||tidy(p.county)||(['city','town','province','state','district'].includes(p.osm_value)?tidy(p.name):'');
    if(!area)continue;
    const parts=[tidy(p.district),tidy(p.city),area].filter(Boolean);
    const label=[...new Set(parts)].join(', ');
    return {area,label,areaSource:'Photon / OpenStreetMap'};
  }
  return null;
}
export async function resolveOriginArea(point,{signal,fetchImpl=fetch,geocoder=env.VITE_GEOCODER_URL||'https://photon.komoot.io/api/'}={}){
  if(point.area||point.areaChecked)return point;
  const fallback={...point,areaChecked:true};
  try{
    const url=new URL(geocoder);
    url.pathname=url.pathname.replace(/\/api\/?$/,'/reverse');
    if(!url.pathname.endsWith('/reverse'))return fallback;
    url.search='';url.searchParams.set('lon',point.coordinates[0]);url.searchParams.set('lat',point.coordinates[1]);url.searchParams.set('radius','3');url.searchParams.set('limit','5');
    const response=await fetchImpl(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});
    if(!response.ok)return fallback;
    const body=await response.json(),result=originAreaResult(body.features,point.coordinates);
    return result?{...point,...result,areaChecked:true,coordinates:[...point.coordinates]}:fallback;
  }catch(error){if(signal?.aborted)throw error;return fallback;}
}
