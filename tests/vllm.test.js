import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {serverConfig} from '../server/config.js';
import {assistantMiddleware,interpretMessage} from '../server/assistant-api.js';
import {generateDraft} from '../server/draft-api.js';
import {basicDraft} from '../src/assistant-draft.js';
import {requestAssistant} from '../src/assistant-client.js';

const env={AI_PROVIDER:'vllm',VLLM_BASE_URL:'https://model.example/v1'};
const config=serverConfig(env,{production:false});
const payload={message:'Đánh giá ngày 1',context:{days:[{title:'Ngày 1'}]}};
const answer={intent:'review',dayNumber:1,answer:null};
const completion=(value,reason='stop')=>new Response(JSON.stringify({choices:[{finish_reason:reason,message:{content:JSON.stringify(value)}}]}));

test('vLLM configuration accepts an optional own key and requires production auth',()=>{
  assert.equal(config.apiKey,'');assert.equal(config.model,'ridemate-qwen');
  assert.equal(config.endpoint,'https://model.example/v1/chat/completions');
  for(const base of ['https://model.example','https://model.example/','https://model.example/v1/','https://model.example/v1/chat/completions']){
    assert.equal(serverConfig({...env,VLLM_BASE_URL:base},{production:false}).endpoint,config.endpoint);
  }
  assert.equal(serverConfig({...env,OPENAI_API_KEY:'other',OPENROUTER_API_KEY:'other'},{production:false}).apiKey,'');
  assert.throws(()=>serverConfig(env),/AI requires/);
  for(const base of ['ftp://model.example','http://remote.example:8036/v1','https://user:pass@model.example','https://model.example?key=test']){
    assert.throws(()=>serverConfig({...env,VLLM_BASE_URL:base},{production:false}));
  }
  assert.equal(serverConfig({...env,VLLM_BASE_URL:'http://localhost:8036/v1'},{production:false}).endpoint,'http://localhost:8036/v1/chat/completions');
});

test('vLLM sends schemas to the selected endpoint without a borrowed authorization key',async()=>{
  for(const apiKey of ['', 'own-test-key']){
    const result=await interpretMessage(payload,{...config,apiKey,fetchImpl:async(url,init)=>{
      assert.equal(url,config.endpoint);
      assert.equal(new Headers(init.headers).get('authorization'),apiKey?'Bearer own-test-key':null);
      const body=JSON.parse(init.body);
      assert.equal(body.model,'ridemate-qwen');assert.equal(body.stream,false);
      assert.equal(body.temperature,0.3);assert.equal(body.provider,undefined);
      assert.equal(body.response_format.json_schema.name,'ridemate_intent');
      assert.equal(body.response_format.json_schema.strict,true);
      assert.deepEqual(JSON.parse(body.messages[1].content).message,payload.message);
      return completion(answer);
    }});
    assert.deepEqual(result,answer);
  }
});

test('vLLM draft supports edits and rejects invalid and truncated content',async()=>{
  const draft=basicDraft('3N2Đ HN - CB');
  const result=await generateDraft({message:'Sửa lịch trình',previous:draft},{...config,fetchImpl:async(url,init)=>{
    assert.equal(url,config.endpoint);
    const body=JSON.parse(init.body);
    assert.equal(body.response_format.json_schema.name,'ride_draft');
    assert.deepEqual(JSON.parse(body.messages[1].content).previous,draft);
    return completion(draft);
  }});
  assert.deepEqual(result.draft,draft);
  await assert.rejects(generateDraft({message:'Tạo lịch trình'},{...config,fetchImpl:async()=>completion({})}),e=>e.code==='AI_INVALID_DRAFT');
  await assert.rejects(generateDraft({message:'Tạo lịch trình'},{...config,fetchImpl:async()=>completion(draft,'length')}),e=>e.code==='AI_OUTPUT_TRUNCATED');
});

test('vLLM distinguishes offline, timeout, unsupported schema and invalid JSON',async()=>{
  for(const [fetchImpl,code] of [
    [async()=>{throw new TypeError('private connection details');},'AI_MODEL_OFFLINE'],
    [async()=>new Response('private gateway details',{status:502}),'AI_MODEL_OFFLINE'],
    [async()=>new Response('private schema details',{status:400}),'AI_MODEL_UNAVAILABLE'],
    [async()=>new Response('not json'),'AI_INVALID_OUTPUT'],
  ])await assert.rejects(interpretMessage(payload,{...config,fetchImpl}),e=>e.code===code&&!e.message.includes('private'));
  await assert.rejects(interpretMessage(payload,{...config,fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');}}),e=>e.name==='TimeoutError');
});

test('vLLM middleware allows no provider key but still authenticates and reserves quota',async()=>{
  let reserved=0,calls=0;
  const middleware=assistantMiddleware({...config,authorize:async token=>{
    if(token!=='Bearer valid'){const error=new Error('AUTH_REQUIRED');error.status=401;error.code='AUTH_REQUIRED';throw error;}
    return async()=>{reserved++;};
  },fetchImpl:async()=>{assert.ok(reserved);calls++;return completion(answer);}});
  async function send(url,method='POST',token=''){
    const req=Readable.from(method==='POST'?[JSON.stringify(payload)]:[]);
    Object.assign(req,{url,method,headers:{'content-type':'application/json','x-ridemate-assistant':'1',authorization:token}});
    let status,body;
    await middleware(req,{writeHead:n=>{status=n;},end:s=>{body=JSON.parse(s);}},()=>{});
    return {status,body};
  }
  assert.deepEqual((await send('/api/assistant/status','GET')).body,{ready:true,authRequired:true});
  assert.equal((await send('/api/assistant')).status,401);assert.equal(calls,0);
  const response=await send('/api/assistant','POST','Bearer valid');
  assert.equal(response.status,200);assert.deepEqual(response.body,answer);assert.equal(calls,1);
  assert.equal(reserved,1);
  const missing=assistantMiddleware({...config,endpoint:''});
  let body;
  await missing({url:'/api/assistant/status',method:'GET'},{writeHead:()=>{},end:s=>{body=JSON.parse(s);}},()=>{});
  assert.equal(body.ready,false);
});

test('frontend gives an actionable offline message',async()=>{
  const client={auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'user'}}}})}};
  await assert.rejects(requestAssistant(payload,{client,expectedUserId:'user',fetchImpl:async()=>new Response(JSON.stringify({error:'AI_MODEL_OFFLINE'}),{status:503})}),/Model AI hiện chưa hoạt động/);
});
