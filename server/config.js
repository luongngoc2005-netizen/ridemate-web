import {createSupabaseGate} from './supabase-gate.js';
import {providerConfigured} from './ai-provider.js';

export function serverConfig(env=process.env,{production=true,fetchImpl}={}){
  const provider=env.AI_PROVIDER?.trim()||'openai';
  if(!['openai','openrouter','vllm'].includes(provider))throw new Error('AI_PROVIDER must be openai, openrouter or vllm.');
  const apiKey=(provider==='vllm'?env.VLLM_API_KEY:provider==='openrouter'?env.OPENROUTER_API_KEY:env.OPENAI_API_KEY)||'';
  const model=provider==='vllm'?(env.VLLM_MODEL||'ridemate-qwen'):provider==='openrouter'?(env.OPENROUTER_MODEL||'openrouter/free'):(env.OPENAI_MODEL||'gpt-4.1-mini');
  let endpoint='';
  if(provider==='vllm'&&env.VLLM_BASE_URL?.trim()){
    const parsed=new URL(env.VLLM_BASE_URL.trim());
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('VLLM_BASE_URL must be an HTTP(S) API base URL.');
    if(parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error('Remote vLLM requires HTTPS.');
    let path=parsed.pathname.replace(/\/+$/,'');
    if(path.endsWith('/chat/completions'))path=path.slice(0,-'/chat/completions'.length);
    parsed.pathname=`${path||'/v1'}/chat/completions`;
    endpoint=parsed.href;
  }
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
  if(production&&providerConfigured({provider,apiKey,model,endpoint})&&(!url||!key||!allowedOrigin))throw new Error('AI requires Supabase URL/publishable key and APP_ORIGIN (or Render hostname).');
  return {provider,apiKey,model,endpoint,allowedOrigin,production,requireAuth:true,fetchImpl,
    authorize:url&&key?createSupabaseGate({url,key,fetchImpl}):null};
}
