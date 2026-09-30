import {createSupabaseGate} from './supabase-gate.js';

export function serverConfig(env=process.env,{production=true,fetchImpl}={}){
  const apiKey=env.OPENAI_API_KEY||'';
  const model=env.OPENAI_MODEL||'gpt-4.1-mini';
  const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL||'';
  const key=env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY||'';
  const originValue=env.APP_ORIGIN||(env.RENDER_EXTERNAL_HOSTNAME?`https://${env.RENDER_EXTERNAL_HOSTNAME}`:'');
  let allowedOrigin='';
  if(originValue){
    const parsed=new URL(originValue);
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('APP_ORIGIN must be a web origin without a path.');
    allowedOrigin=parsed.origin;
  }
  if(url){const parsed=new URL(url);if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Supabase requires HTTPS.');}
  if(production&&apiKey&&(!url||!key||!allowedOrigin))throw new Error('AI requires Supabase URL/publishable key and APP_ORIGIN (or Render hostname).');
  return {apiKey,model,allowedOrigin,production,requireAuth:true,fetchImpl,
    authorize:url&&key?createSupabaseGate({url,key,fetchImpl}):null};
}
