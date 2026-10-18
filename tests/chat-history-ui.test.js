import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {basicDraft} from '../src/assistant-draft.js';
import {generateDraft} from '../server/draft-api.js';

const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import AIAssistant from './src/AIAssistant.jsx';
 const root=createRoot(document.getElementById('root'));window.created=[];
 window.mount=(userId,version=0)=>{window.testUser=userId;root.render(<AIAssistant key={userId+version} userId={userId} setPage={()=>{}} onCreatePlan={plan=>window.created.push(plan)} onOpenPlan={()=>{}}/>);};
 `,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.env':'{}','import.meta.url':'"https://chat.test/app.js"','process.env.NODE_ENV':'"development"'},plugins:[{name:'offline-chat-ui',setup(b){
 b.onLoad({filter:/[\\/]src[\\/]supabase\.js$/},()=>({contents:`export const supabase={auth:{getUser:async()=>({data:{user:{id:window.testUser}}}),getSession:async()=>({data:{session:{user:{id:window.testUser},access_token:'mock'}}})},from:()=>({select:()=>({eq:()=>({order:()=>({limit:async()=>({error:{code:'42P01'}})})})})})};`,loader:'js'}));
 b.onLoad({filter:/[\\/]src[\\/]Location\.jsx$/},()=>({contents:'export const useLocation=()=>({position:null});',loader:'js'}));
 b.onLoad({filter:/[\\/]src[\\/]TripRouteContext\.jsx$/},()=>({contents:'export const useTripRoute=()=>({places:[],route:null});',loader:'js'}));
 b.onLoad({filter:/[\\/]src[\\/](DraftLocations|TripFeasibility|OriginSelect)\.jsx$/},()=>({contents:'export default function Boundary(){return null;}',loader:'js'}));
}}]});
const pause=()=>new Promise(r=>setTimeout(r,30));
test('one trip form creates a draft once; in-flight AI survives first history save and saved plans never duplicate on reopen',async t=>{
 const errors=[],vc=new VirtualConsole();vc.on('error',(...args)=>errors.push(args.join(' ')));vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://chat.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});t.after(()=>dom.window.close());
 const {window}=dom,{document}=window;window.TextEncoder=TextEncoder;window.HTMLElement.prototype.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};window.confirm=()=>true;
 let requestCount=0,respond,payload;
 window.fetch=async(url,init)=>url.includes('status')?{ok:true,json:async()=>({ready:true,authRequired:true})}:new Promise(resolve=>{
  requestCount++;payload=JSON.parse(init.body);respond=async draft=>{
   const result=await generateDraft(payload,{apiKey:'mock',model:'mock',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]}))});
   resolve({ok:true,json:async()=>result});
  };
 });
 window.eval(bundle.outputFiles[0].text);window.mount('alice');await pause();
 const until=async(fn)=>{for(let i=0;i<100&&!fn();i++)await pause();assert.ok(fn());};
 const input=(node,value)=>{const prototype=node.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));};
 const button=label=>{const node=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===label);assert.ok(node,label);return node;};
 await until(()=>document.querySelector('#assistant-message'));
 input(document.querySelector('#assistant-message'),'Tạo cho tôi chuyến đi 3 ngày 2 đêm Hà Nội Thanh Hóa, với 2 người đi 1 xe, ngày 07/11/2026 lúc 06:30, thích thiên nhiên');await pause();button('Gửi').click();await pause();
 assert.equal(document.querySelectorAll('.trip-intake-form').length,1);assert.equal(document.querySelector('.trip-intake-form input[type=date]').value,'2026-11-07');
 document.querySelector('.trip-intake-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>requestCount===1);
 assert.equal(payload.context.origin,'Hà Nội');assert.equal(payload.context.destination,'Thanh Hóa');
 assert.equal(payload.context.people,2);assert.equal(payload.context.vehicles,1);assert.equal(payload.context.departure,'06:30');assert.equal(payload.context.bike,undefined);
 assert.equal(document.querySelector('.chat-history-heading button').disabled,true);
 respond(basicDraft('3N2Đ HN-CB'));await until(()=>document.querySelector('.draft-result'));
 assert.match(document.querySelector('.draft-result').textContent,/Lịch trình từ địa danh đã đối chiếu/);assert.match(document.querySelector('.draft-result').textContent,/Thành nhà Hồ/);assert.ok(!document.querySelector('.draft-result').textContent.includes('Bản Giốc'));
 assert.equal(document.querySelectorAll('.trip-intake-form').length,0);assert.equal(requestCount,1);await pause();assert.equal(document.querySelectorAll('.chat-history-open').length,1,document.body.textContent.slice(0,2200));
 window.mount('alice',1);await pause();await until(()=>document.querySelector('.draft-result'));button('Dùng lịch trình này').click();await until(()=>document.querySelector('.draft-ack input'));
 const ack=document.querySelector('.draft-ack input');ack.click();button('Xác nhận tạo kế hoạch').click();await until(()=>window.created.length===1);
 window.mount('bob',2);await pause();await until(()=>!document.querySelector('.draft-result'));assert.equal(document.querySelectorAll('.chat-history-open').length,0);
 window.mount('alice',3);await pause();await until(()=>document.querySelector('.draft-result'));assert.equal(document.querySelectorAll('.draft-confirm').length,0);assert.equal(window.created.length,1);
 assert.ok([...document.querySelectorAll('button')].some(n=>n.textContent==='Mở kế hoạch'));assert.equal(requestCount,1);assert.deepEqual(errors,[]);
});
