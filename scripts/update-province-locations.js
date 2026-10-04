// Refresh source-backed representative map points, never attraction/address pins.
import {writeFile} from 'node:fs/promises';
import {provinces} from '../src/provinces.js';
import {chooseLocation} from '../src/route-data.js';
const entries=[];
for(const name of provinces){
  const url=new URL('https://photon.komoot.io/api/');
  url.search=new URLSearchParams({q:name,lang:'default',limit:'30',bbox:'102,8,110,24'});
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  let features=(await response.json()).features;
  // Prioritize a named city over a province's broad representative point.
  features.sort((a,b)=>(a.properties.osm_value==='city'?0:1)-(b.properties.osm_value==='city'?0:1));
  let result=chooseLocation(features,name);
  if(!result){
    url.searchParams.set('q',`Tỉnh ${name}`);
    result=chooseLocation((await (await fetch(url,{signal:AbortSignal.timeout(20000)})).json()).features,name);
  }
  if(!result)throw new Error(`No exact geographic match: ${name}`);
  const p=result.properties,type={N:'node',W:'way',R:'relation'}[p.osm_type];
  if(!type||!p.osm_id)throw new Error(`Missing OSM source: ${name}`);
  entries.push({name,coordinates:result.geometry.coordinates,label:name,kind:p.osm_value,source:`https://www.openstreetmap.org/${type}/${p.osm_id}`,retrievedAt:new Date().toISOString().slice(0,10)});
  console.log(name,JSON.stringify(result.geometry.coordinates),p.osm_value);
  await new Promise(resolve=>setTimeout(resolve,350));
}
await writeFile(new URL('../src/data/province-locations.json',import.meta.url),JSON.stringify(entries,null,2)+'\n');
