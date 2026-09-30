import {createClient} from '@supabase/supabase-js';

export function apiError(status,code){return Object.assign(new Error(code),{status,code});}

// Verify with Supabase Auth, not by merely decoding client-supplied JWT claims.
// Each request has its own client; user sessions cannot bleed between requests.
export function createSupabaseGate({url,key,fetchImpl=fetch}){
  return async (authorization,signal)=>{
    if(typeof authorization!=='string'||!/^Bearer \S{1,8192}$/.test(authorization))throw apiError(401,'AUTH_REQUIRED');
    const token=authorization.slice(7);
    const client=createClient(url,key,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:authorization},fetch:(input,init={})=>fetchImpl(input,{...init,signal:AbortSignal.any([signal||AbortSignal.timeout(8000),AbortSignal.timeout(8000)])})},
    });
    const {data,error}=await client.auth.getUser(token);
    if(error){if(error.status===401||error.status===403||error.status===400)throw apiError(401,'AUTH_REQUIRED');throw apiError(503,'AUTH_UNAVAILABLE');}
    if(!data.user?.id||data.user.is_anonymous)throw apiError(401,'AUTH_REQUIRED');
    return async ()=>{
      const {data:allowed,error:quotaError}=await client.rpc('consume_ai_quota');
      if(quotaError||typeof allowed!=='boolean')throw apiError(503,'QUOTA_UNAVAILABLE');
      if(!allowed)throw apiError(429,'QUOTA_EXCEEDED');
    };
  };
}
