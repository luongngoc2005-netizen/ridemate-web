const hourlyVariables=['precipitation','precipitation_probability','weather_code','temperature_2m','cloud_cover','wind_gusts_10m','visibility'];
export function weatherQuery(search,now=Date.now()/1000) {
  const params=new URLSearchParams(search),allowed=['latitudes','longitudes','start','end'];
  if([...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1))throw new Error('INVALID_REQUEST');
  const parse=key=>{const value=params.get(key);if(!value||!/^[-\d.,]+$/.test(value))throw new Error('INVALID_REQUEST');return value.split(',').map(Number);};
  const latitudes=parse('latitudes'),longitudes=parse('longitudes');
  const start=Number(params.get('start')),end=Number(params.get('end'));
  if(!latitudes.length||latitudes.length>15||latitudes.length!==longitudes.length||latitudes.some(n=>!Number.isFinite(n)||n<8||n>24)||longitudes.some(n=>!Number.isFinite(n)||n<102||n>110.2)||!params.has('start')||!params.has('end')||!Number.isInteger(start)||!Number.isInteger(end)||start%3600||end%3600||start<now-4*3600||end>now+7*86400+3*3600||end<=start||end-start>48*3600)throw new Error('INVALID_REQUEST');
  return {latitudes,longitudes,start,end};
}
export function routeWeatherMiddleware({fetchImpl=fetch,apiKey=process.env.WEATHER_OPEN_METEO_API_KEY||'',now=()=>Date.now()}={}) {
  const cache=new Map(),pending=new Map();let active=0,budgetStart=0,budget=0;
  return async(req,res,next)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname!=='/api/route-weather')return next();
    const send=(status,data)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...(status===429?{'Retry-After':'60'}:{})});res.end(JSON.stringify(data));}};
    if(req.method!=='GET')return send(405,{error:'METHOD_NOT_ALLOWED'});
    let query;try{query=weatherQuery(url.search,now()/1000);}catch{return send(400,{error:'INVALID_REQUEST'});}
    const key=JSON.stringify(query),saved=cache.get(key);
    if(saved&&now()-saved.fetchedAt<30*60000)return send(200,saved);
    if(pending.has(key)){try{return send(200,await pending.get(key));}catch{return send(503,{error:'WEATHER_UNAVAILABLE'});}}
    if(now()-budgetStart>=60000){budgetStart=now();budget=0;}
    if(active>=4||budget>=60)return send(429,{error:'WEATHER_BUSY'});
    budget++;active++;
    const work=(async()=>{
      const endpoint=new URL(apiKey?'https://customer-api.open-meteo.com/v1/forecast':'https://api.open-meteo.com/v1/forecast');
      const iso=epoch=>new Date(epoch*1000).toISOString().slice(0,16);
      endpoint.search=new URLSearchParams({latitude:query.latitudes.join(','),longitude:query.longitudes.join(','),hourly:hourlyVariables.join(','),timezone:'GMT',timeformat:'unixtime',start_hour:iso(query.start),end_hour:iso(query.end),wind_speed_unit:'kmh',precipitation_unit:'mm',...(apiKey?{apikey:apiKey}:{})});
      for(let attempt=0;attempt<2;attempt++){
        const response=await fetchImpl(endpoint,{signal:AbortSignal.timeout(12000)});
        if((response.status===429||response.status>=500)&&attempt===0){await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,1000));continue;}
        if(!response.ok)throw new Error('WEATHER_UNAVAILABLE');
        const raw=await response.json(),records=Array.isArray(raw)?raw:[raw];
        if(records.length!==query.latitudes.length)throw new Error('INVALID_RESPONSE');
        const forecasts=records.map(record=>{
          const h=record?.hourly;
          if(!Array.isArray(h?.time)||h.time.length>60||!h.time.every(Number.isFinite))return null;
          return {hourly:Object.fromEntries(['time',...hourlyVariables].map(name=>[name,Array.isArray(h[name])?h[name].slice(0,h.time.length):[]]))};
        });
        const data={forecasts,fetchedAt:now()};
        // Invalid or absent locations are never cached as successful forecasts.
        if(forecasts.every(Boolean)){cache.delete(key);cache.set(key,data);while(cache.size>64)cache.delete(cache.keys().next().value);}
        return data;
      }
    })();
    pending.set(key,work);
    try{send(200,await work);}catch{send(503,{error:'WEATHER_UNAVAILABLE'});}finally{active--;pending.delete(key);}
  };
}
