import {apiError} from './supabase-gate.js';

export const providerTimeout=provider=>provider==='openrouter'?90000:30000;

// Keep the existing Responses contract while adapting OpenRouter Chat Completions.
export function providerFetch(provider='openai',fetchImpl=fetch){
  if(!['openai','openrouter'].includes(provider))throw new Error('Unsupported AI_PROVIDER');
  if(provider==='openai')return fetchImpl;
  return async (_url,init)=>{
    const request=JSON.parse(init.body),format=request.text.format;
    const response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{
      ...init,
      body:JSON.stringify({model:request.model,max_tokens:request.max_output_tokens,
        messages:[{role:'system',content:request.instructions},{role:'user',content:request.input}],
        response_format:{type:'json_schema',json_schema:{name:format.name,strict:format.strict,schema:format.schema}},
        provider:{require_parameters:true},
      }),
    });
    if(!response.ok){
      if(response.status===402)throw apiError(503,'AI_PROVIDER_QUOTA');
      if([400,404,422].includes(response.status))throw apiError(502,'AI_MODEL_UNAVAILABLE');
      if(response.status>=500)throw apiError(502,'AI_PROVIDER_UNAVAILABLE');
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
