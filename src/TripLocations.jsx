import React from 'react';
import DraftLocations from './DraftLocations.jsx';
import {locationKey} from './attraction-location.js';
import {validPoint} from './places-data.js';
export default function TripLocations({trip,setTrip}){
  const locations={};
  for(const day of trip.itinerary)for(const p of day.places)if(validPoint(p.coordinates))locations[locationKey(p.name,trip.destination)]={...p,requestedName:p.name,destination:trip.destination,confirmed:true};
  const draft={destination:trip.destination,days:trip.itinerary.map(d=>({stops:d.places.map(p=>p.name)})),stopLocations:locations};
  return <details className="box"><summary>Kiểm tra và bổ sung vị trí các điểm tham quan</summary><DraftLocations draft={draft} onChange={next=>setTrip(current=>{
    if(current.destination!==trip.destination)return current;
    return {...current,itinerary:current.itinerary.map(day=>({...day,places:day.places.map(p=>{
      const old=trip.itinerary.flatMap(d=>d.places).find(x=>x.id===p.id);
      if(!old||old.name!==p.name||JSON.stringify(old.coordinates)!==JSON.stringify(p.coordinates))return p;
      const candidate=next.stopLocations?.[locationKey(p.name,current.destination)];
      if(candidate)return {...p,coordinates:[...candidate.coordinates],address:candidate.address,source:candidate.source,sourceId:candidate.id};
      const {coordinates,address,source,sourceId,...rest}=p;return rest;
    })}))};
  })}/></details>;
}
