import locations from './data/province-locations.json' with {type:'json'};
export const provinceLocations=locations;
const fold=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim();
const aliases={hn:'ha noi',cb:'cao bang',hcm:'ho chi minh',tphcm:'ho chi minh','tp.hcm':'ho chi minh','sai gon':'ho chi minh','tp hcm':'ho chi minh'};
export function provinceLocation(value){
  let key=fold(value).replace(/^(?:tinh|thanh pho|tp\.?)\s+/,'').replace(/,?\s+viet nam$/,'').trim();
  key=aliases[key]||key;
  const entry=locations.find(item=>fold(item.name)===key);
  return entry?{...entry,coordinates:[...entry.coordinates]}:null;
}
export function provinceMapUrl(entry){
  const [lon,lat]=entry.coordinates;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`;
}
