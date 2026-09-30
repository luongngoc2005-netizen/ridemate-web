import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server/app.js';
import {serverConfig} from '../server/config.js';
import {createSupabaseGate,apiError} from '../server/supabase-gate.js';
import {normalizePayload} from '../server/assistant-api.js';
import {requestAssistant} from '../src/assistant-client.js';
import {basicDraft} from '../src/assistant-draft.js';

const payload={message:'Ngày mai tôi nên đi thế nào?',question:null,context:{days:[{title:'Ngày 1',places:[]}],profile:{bike:'scooter'}}};
const output={intent:'tomorrow',dayNumber:null,answer:null};
const provider=()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}),{headers:{'content-type':'application/json'}});

async function fixture(options,run){
  const directory=await mkdtemp(join(tmpdir(),'ridemate-server-'));
  let server;
  try{
    await writeFile(join(directory,'index.html'),'<html>RideMate test build</html>');await mkdir(join(directory,'assets'));await writeFile(join(directory,'assets','test.js'),'window.testBuild=true');await writeFile(join(directory,'.env'),'PRIVATE_TEST_DATA');
    server=await createApp({distDirectory:directory,...options});server.listen(0,'127.0.0.1');await once(server,'listening');
    await run(`http://127.0.0.1:${server.address().port}`);
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(directory,{recursive:true,force:true});}
}
const post=(url,body=payload,headers={})=>fetch(`${url}/api/assistant`,{method:'POST',headers:{'content-type':'application/json','x-ridemate-assistant':'1',...headers},body:JSON.stringify(body)});
test('draft endpoint without a plan still requires authenticated quota and validates context',async()=>{
 let calls=0,reserved=0;
 const draft=basicDraft('3N2Đ HN - CB');
 await fixture({apiKey:'test',model:'test',authorize:async token=>{if(token!=='Bearer valid')throw apiError(401,'AUTH_REQUIRED');return async()=>{reserved++;};},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]}));}},async url=>{
  const send=(body,token='valid')=>fetch(`${url}/api/assistant/draft`,{method:'POST',headers:{'content-type':'application/json','x-ridemate-assistant':'1',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  assert.equal((await send({message:'3N2Đ HN - CB'},'bad')).status,401);
  assert.equal((await send({message:'sửa',previous:{}})).status,400);
  const response=await send({message:'3N2Đ HN - CB'});assert.equal(response.status,200);assert.deepEqual((await response.json()).draft,draft);
  assert.equal(calls,1);assert.equal(reserved,1);
 });
});

test('production server serves build, health and SPA routes without exposing secrets or source',async()=>{
  await fixture({},async url=>{
    assert.match(await (await fetch(url)).text(),/RideMate test build/);
    assert.deepEqual(await (await fetch(`${url}/healthz`)).json(),{status:'ok'});
    const status=await fetch(`${url}/api/assistant/status`);assert.deepEqual(await status.json(),{ready:false,authRequired:true});assert.equal(status.headers.get('cache-control'),'no-store');
    assert.match(await (await fetch(`${url}/plans`,{headers:{accept:'text/html'}})).text(),/RideMate/);
    const asset=await fetch(`${url}/assets/test.js`);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);assert.match(asset.headers.get('cache-control'),/immutable/);
    for(const path of ['/.env','/server/index.js','/assets/missing.js','/api/unknown','/%2e%2e%2fpackage.json','/assets%5ctest.js'])assert.equal((await fetch(url+path)).status,404,path);
    assert.equal((await fetch(url,{method:'HEAD'})).status,200);
    assert.equal((await fetch(url,{method:'POST'})).status,405);
    assert.equal((await post(url)).status,503);
  });
});

test('HTTP AI endpoint enforces auth, schema, quota and origin before calling provider',async()=>{
  let calls=0,reservations=0,quotaFailure=false;
  const authorize=async token=>{
    if(token!=='Bearer valid')throw apiError(401,'AUTH_REQUIRED');
    return async()=>{reservations++;if(quotaFailure)throw apiError(429,'QUOTA_EXCEEDED');};
  };
  await fixture({apiKey:'server-test-secret',model:'test-model',production:true,allowedOrigin:'https://ride.example',authorize,fetchImpl:async()=>{calls++;return provider();}},async url=>{
    assert.equal((await post(url)).status,401);assert.equal(calls,0);
    assert.equal((await post(url,payload,{authorization:'Bearer invalid'})).status,401);
    assert.equal((await post(url,payload,{authorization:'Bearer valid',origin:'https://evil.example'})).status,403);
    assert.equal((await post(url,{...payload,context:null},{authorization:'Bearer valid'})).status,400);
    assert.equal((await post(url,{...payload,message:'x'.repeat(40000)},{authorization:'Bearer valid'})).status,413);
    assert.equal((await post(url,payload,{'content-type':'text/plain',authorization:'Bearer valid'})).status,415);
    assert.equal(reservations,0);assert.equal(calls,0);
    const good=await post(url,payload,{authorization:'Bearer valid',origin:'https://ride.example'});assert.equal(good.status,200);assert.deepEqual(await good.json(),output);assert.equal(calls,1);
    quotaFailure=true;const limited=await post(url,payload,{authorization:'Bearer valid'});assert.equal(limited.status,429);assert.equal((await limited.json()).error,'QUOTA_EXCEEDED');assert.equal(calls,1);
  });
});

test('production configuration requires Auth and origin, uses Render PORT-independent hostname and defaults model',()=>{
  assert.throws(()=>serverConfig({OPENAI_API_KEY:'test'}),/AI requires/);
  assert.throws(()=>serverConfig({APP_ORIGIN:'https://example.com/path'}),/APP_ORIGIN/);
  const config=serverConfig({OPENAI_API_KEY:'test',VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-key',RENDER_EXTERNAL_HOSTNAME:'ridemate.onrender.com'});
  assert.equal(config.allowedOrigin,'https://ridemate.onrender.com');assert.equal(config.model,'gpt-4.1-mini');assert.equal(config.requireAuth,true);assert.equal(typeof config.authorize,'function');
});

test('only bounded travel context is forwarded; token/GPS/extra fields are stripped',()=>{
  const clean=normalizePayload({...payload,secret:'do-not-forward',context:{...payload.context,coordinates:[1,2],token:'secret'}});
  assert.equal(clean.secret,undefined);assert.equal(clean.context.coordinates,undefined);assert.equal(clean.context.token,undefined);
  assert.throws(()=>normalizePayload({...payload,context:{days:[{title:'x',places:['x'.repeat(201)]}]}}),/INVALID_REQUEST/);
});

test('Supabase gate verifies token remotely, rejects anonymous, and reserves persistent quota',async()=>{
  const seen=[];let anonymous=false,allowed=true,missing=false;
  const gate=createSupabaseGate({url:'https://test.supabase.co',key:'publishable-test',fetchImpl:async(input,init)=>{
    const url=String(input);seen.push({url,authorization:new Headers(init.headers).get('authorization')});
    if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',is_anonymous:anonymous}),{headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify(missing?{message:'function unavailable'}:allowed),{status:missing?404:200,headers:{'content-type':'application/json'}});
  }});
  await assert.rejects(gate(''),/AUTH_REQUIRED/);
  const reserve=await gate('Bearer token-test');assert.equal(seen.length,1);await reserve();
  assert.equal(seen.length,2);assert.match(seen[1].url,/\/rpc\/consume_ai_quota/);assert.ok(seen.every(item=>item.authorization==='Bearer token-test'));
  allowed=false;await assert.rejects(reserve(),/QUOTA_EXCEEDED/);
  missing=true;await assert.rejects(reserve(),/QUOTA_UNAVAILABLE/);
  anonymous=true;await assert.rejects(gate('Bearer token-test'),/AUTH_REQUIRED/);
});

test('frontend attaches current token and rejects results after account switch',async()=>{
  let user='alice',sent;
  const client={auth:{getSession:async()=>({data:{session:{access_token:'token-test',user:{id:user}}}})}};
  const fetchImpl=async(_,init)=>{sent=init.headers.Authorization;return new Response(JSON.stringify(output));};
  assert.deepEqual(await requestAssistant(payload,{client,fetchImpl,expectedUserId:'alice'}),output);assert.equal(sent,'Bearer token-test');
  await assert.rejects(requestAssistant(payload,{client,expectedUserId:'bob',fetchImpl}),/đăng nhập/);
  await assert.rejects(requestAssistant(payload,{client,expectedUserId:'alice',fetchImpl:async()=>{user='bob';return new Response(JSON.stringify(output));}}),/Tài khoản đã thay đổi/);
});

test('provider errors never expose raw responses or server secrets',async()=>{
  await fixture({apiKey:'never-expose-this-key',model:'test',authorize:async()=>async()=>{},fetchImpl:async()=>new Response('private provider content',{status:401})},async url=>{
    const response=await post(url,payload,{authorization:'Bearer token'});const text=await response.text();assert.equal(response.status,502);assert.equal(text,'{"error":"AI_CREDENTIALS_INVALID"}');
  });
});
