import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAssistant} from '../src/assistant-client.js';

const client={auth:{getSession:async()=>({data:{session:{access_token:'test-token',user:{id:'alice'}}}})}};
test('non-JSON gateway failures retain HTTP diagnosis without exposing response bodies',async()=>{
  for(const status of [502,503,504,200,404]){
    await assert.rejects(requestAssistant({message:'test'},{client,expectedUserId:'alice',
      fetchImpl:async()=>new Response('<html>private proxy details</html>',{status,headers:{'Content-Type':'text/html'}}),
    }),error=>error.message.includes(`HTTP ${status}`)&&!error.message.includes('private proxy'));
  }
});
test('JSON API timeout keeps its specific application message',async()=>{
  await assert.rejects(requestAssistant({message:'test'},{client,expectedUserId:'alice',
    fetchImpl:async()=>new Response(JSON.stringify({error:'AI_TIMEOUT'}),{status:504}),
  }),/AI phản hồi quá chậm/);
});
