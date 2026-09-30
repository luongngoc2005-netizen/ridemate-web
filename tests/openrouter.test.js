import test from 'node:test';
import assert from 'node:assert/strict';
import {serverConfig} from '../server/config.js';
import {interpretMessage,assistantMiddleware} from '../server/assistant-api.js';
import {generateDraft} from '../server/draft-api.js';
import {basicDraft} from '../src/assistant-draft.js';
import {Readable} from 'node:stream';

const payload={message:'review',context:{days:[{title:'Day 1'}]}};
const answer={intent:'review',dayNumber:1,answer:null};
const completion=(value,finish_reason='stop')=>new Response(JSON.stringify({choices:[{finish_reason,message:{content:JSON.stringify(value)}}]}));
const config={provider:'openrouter',apiKey:'test-router-key',model:'openrouter/free'};

test('provider timeout returns a stable error instead of DOMException code 23',async()=>{
  for(const url of ['/api/assistant','/api/assistant/draft']){
    const middleware=assistantMiddleware({...config,authorize:async()=>async()=>{},fetchImpl:async()=>{throw new DOMException('Timed out','TimeoutError');}});
    const req=Readable.from([JSON.stringify(url.endsWith('/draft')?{message:'Plan a trip'}:payload)]);
    Object.assign(req,{url,method:'POST',headers:{'content-type':'application/json','x-ridemate-assistant':'1'}});
    let status,body;
    await middleware(req,{writeHead:n=>{status=n;},end:s=>{body=JSON.parse(s);}},()=>{});
    assert.equal(status,504);assert.deepEqual(body,{error:'AI_TIMEOUT'});
  }
});

test('provider selection never borrows the other provider key and rejects typos',()=>{
  const c=serverConfig({AI_PROVIDER:'openrouter',OPENAI_API_KEY:'other'},{production:false});
  assert.equal(c.apiKey,'');assert.equal(c.model,'openrouter/free');
  assert.equal(serverConfig({OPENROUTER_API_KEY:'other'},{production:false}).apiKey,'');
  assert.throws(()=>serverConfig({AI_PROVIDER:'typo'},{production:false}));
});
test('OpenRouter interpretation uses schema, selected model and no paid fallback',async()=>{
  const result=await interpretMessage(payload,{...config,fetchImpl:async(url,init)=>{
    assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(init.headers.Authorization,'Bearer test-router-key');
    const body=JSON.parse(init.body);
    assert.equal(body.model,'openrouter/free');assert.equal(body.models,undefined);
    assert.equal(body.response_format.json_schema.strict,true);
    assert.equal(body.provider.require_parameters,true);
    assert.equal(JSON.parse(body.messages[1].content).message,'review');
    assert.ok(init.signal);return completion(answer);
  }});
  assert.deepEqual(result,answer);
});
test('OpenRouter draft preserves previous draft and validates returned content',async()=>{
  const draft=basicDraft('3N2Đ HN - CB');
  const result=await generateDraft({message:'edit',previous:draft},{...config,fetchImpl:async(_,init)=>{
    const body=JSON.parse(init.body);
    assert.deepEqual(JSON.parse(body.messages[1].content).previous,draft);
    assert.equal(body.response_format.json_schema.name,'ride_draft');return completion(draft);
  }});
  assert.deepEqual(result.draft,draft);
  await assert.rejects(generateDraft({message:'edit'},{...config,fetchImpl:async()=>completion({})}));
});
test('OpenRouter errors are sanitized and partial or invalid outputs are rejected',async()=>{
  for(const [status,code] of [[402,'AI_PROVIDER_QUOTA'],[429,'AI_PROVIDER_LIMIT'],[401,'AI_CREDENTIALS_INVALID'],[404,'AI_MODEL_UNAVAILABLE'],[503,'AI_PROVIDER_UNAVAILABLE']]){
    await assert.rejects(interpretMessage(payload,{...config,fetchImpl:async()=>new Response(JSON.stringify({error:{message:'private detail'}}),{status})}),e=>e.code===code&&!e.message.includes('private'));
  }
  for(const response of [()=>completion(answer,'length'),()=>completion({...answer,dayNumber:99}),()=>new Response(JSON.stringify({error:{message:'private'}}))]){
    await assert.rejects(interpretMessage(payload,{...config,fetchImpl:async()=>response()}));
  }
});
test('middleware forwards provider after authentication and quota reservation',async()=>{
  let reserved=false,called=false,status;
  const middleware=assistantMiddleware({...config,authorize:async()=>async()=>{reserved=true;},fetchImpl:async url=>{
    assert.ok(reserved);assert.match(url,/openrouter.ai/);called=true;return completion(answer);
  }});
  const req=Readable.from([JSON.stringify(payload)]);
  Object.assign(req,{url:'/api/assistant',method:'POST',headers:{'content-type':'application/json','x-ridemate-assistant':'1'}});
  await middleware(req,{writeHead:n=>{status=n;},end:body=>assert.deepEqual(JSON.parse(body),answer)},()=>{});
  assert.equal(status,200);assert.ok(called);
});
