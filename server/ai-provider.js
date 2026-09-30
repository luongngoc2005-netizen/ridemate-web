import {apiError} from './supabase-gate.js';

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
      return response;
    }
    const body=await response.json();
    if(body.error)throw apiError(502,'ASSISTANT_UNAVAILABLE');
    const choice=body.choices?.[0];
    const complete=choice?.finish_reason==='stop'&&typeof choice.message?.content==='string'&&!choice.message.refusal;
    return {ok:true,json:async()=>({status:complete?'completed':'incomplete',output:complete?
      [{type:'message',content:[{type:'output_text',text:choice.message.content}]}]:[]})};
  };
}
