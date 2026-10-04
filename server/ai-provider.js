import {apiError} from './supabase-gate.js';

export const providerTimeout=provider=>['openrouter','vllm'].includes(provider)?90000:30000;
export const providerConfigured=({provider='openai',apiKey,model,endpoint})=>!!(model&&(provider==='vllm'?endpoint:apiKey));

// Keep the existing Responses contract while adapting Chat Completions providers.
export function providerFetch(provider='openai',fetchImpl=fetch,{endpoint,apiKey}={}){
  if(!['openai','openrouter','vllm'].includes(provider))throw new Error('Unsupported AI_PROVIDER');
  if(provider==='openai')return fetchImpl;
  return async (_url,init)=>{
    const request=JSON.parse(init.body),format=request.text.format;
    const local=provider==='vllm';
    if(local&&!endpoint)throw apiError(503,'NOT_CONFIGURED');
    const headers=new Headers(init.headers);
    if(local){if(apiKey)headers.set('Authorization',`Bearer ${apiKey}`);else headers.delete('Authorization');}
    let response;
    try{response=await fetchImpl(local?endpoint:'https://openrouter.ai/api/v1/chat/completions',{
      ...init,
      headers:local?headers:init.headers,
      body:JSON.stringify({model:request.model,max_tokens:request.max_output_tokens,
        messages:[{role:'system',content:request.instructions},{role:'user',content:request.input}],
        response_format:{type:'json_schema',json_schema:{name:format.name,strict:format.strict,schema:format.schema}},
        ...(local?{temperature:0.3,stream:false}:{provider:{require_parameters:true}}),
      }),
    });}catch(error){
      if(!local||init.signal?.aborted||error.name==='TimeoutError'||error.name==='AbortError')throw error;
      throw apiError(503,'AI_MODEL_OFFLINE');
    }
    if(!response.ok){
      if(response.status===402)throw apiError(503,'AI_PROVIDER_QUOTA');
      if([400,404,422].includes(response.status))throw apiError(502,'AI_MODEL_UNAVAILABLE');
      if(response.status>=500)throw apiError(local?503:502,local?'AI_MODEL_OFFLINE':'AI_PROVIDER_UNAVAILABLE');
      return response;
    }
    let body;try{body=await response.json();}catch{throw apiError(502,'AI_INVALID_OUTPUT');}
    if(body?.error)throw apiError(502,'AI_PROVIDER_UNAVAILABLE');
    const choice=body?.choices?.[0];
    if(choice?.finish_reason==='length')throw apiError(502,'AI_OUTPUT_TRUNCATED');
    if(choice?.message?.refusal||choice?.finish_reason==='content_filter')throw apiError(502,'AI_RESPONSE_REFUSED');
    if(!choice||typeof choice.message?.content!=='string')throw apiError(502,'AI_INVALID_OUTPUT');
    const complete=choice?.finish_reason==='stop'&&typeof choice.message?.content==='string'&&!choice.message.refusal;
    return {ok:true,json:async()=>({status:complete?'completed':'incomplete',output:complete?
      [{type:'message',content:[{type:'output_text',text:choice.message.content}]}]:[]})};
  };
}
