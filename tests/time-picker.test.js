import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {clockParts,clockValue,clockLabel} from '../src/time-data.js';
import {basicDraft} from '../src/assistant-draft.js';

test('12-hour clock preserves every minute, especially noon and midnight',()=>{
 for(let hour=0;hour<24;hour++)for(let minute=0;minute<60;minute++){
  const value=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  assert.equal(clockValue(clockParts(value)),value);
 }
 assert.equal(clockLabel('00:00'),'12:00 AM');assert.equal(clockLabel('12:00'),'12:00 PM');assert.equal(clockLabel('23:59'),'11:59 PM');
 assert.equal(clockParts('24:00'),null);assert.equal(clockParts('7:00'),null);assert.equal(clockValue({hour:0,minute:0,period:'AM'}),'');
});

const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import TimePicker from './src/TimePicker.jsx';import DraftIntakeQuestion from './src/DraftIntakeQuestion.jsx';import DraftReply from './src/DraftReply.jsx';
 const root=createRoot(document.getElementById('root'));
 window.mount=(kind,props)=>{root.render(kind==='intake'?<DraftIntakeQuestion {...props}/>:kind==='draft'?<DraftReply {...props}/>:<form onSubmit={event=>{event.preventDefault();window.submitted=Object.fromEntries(new FormData(event.currentTarget));}}><TimePicker {...props}/><button type="submit">Lưu giờ</button></form>);};
 `,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.env':'{}','import.meta.url':'"https://clock.test/assets/app.js"','process.env.NODE_ENV':'"development"'},plugins:[{name:'offline-clock-test',setup(builder){
 builder.onLoad({filter:/[\\/]src[\\/](DraftLocations|TripFeasibility|OriginSelect)\.jsx$/},()=>({contents:'export default function OfflineBoundary(){return null;}',loader:'js'}));
}}]});
const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
async function setup(t){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));vc.on('error',(...args)=>errors.push(args.join(' ')));
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://clock.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 t.after(()=>{assert.deepEqual(errors,[]);dom.window.close();});dom.window.eval(bundle.outputFiles[0].text);
 const {window}=dom,{document}=window;
 const button=text=>{const found=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);assert.ok(found,text);return found;};
 const select=(label,value)=>{const node=[...document.querySelectorAll('.time-picker-controls label')].find(node=>node.textContent.startsWith(label))?.querySelector('select');assert.ok(node,label);node.value=String(value);node.dispatchEvent(new window.Event('change',{bubbles:true}));};
 return {window,document,button,select};
}

test('clock selection, AM/PM, cancel and Escape preserve form time and never submit prematurely',async t=>{
 const {window,document,button,select}=await setup(t);
 window.mount('picker',{name:'departure',required:true});await settle();
 assert.equal(document.querySelector('form').checkValidity(),false);
 document.querySelector('.time-picker-trigger').click();await settle();
 select('Giờ',12);await settle();select('Phút',7);await settle();button('PMTừ 12 giờ trưa').click();await settle();
 assert.equal(window.submitted,undefined);button('Chọn giờ').click();await settle();
 assert.equal(document.querySelector('[name=departure]').value,'12:07');assert.equal(document.querySelector('form').checkValidity(),true);
 button('Lưu giờ').click();await settle();assert.equal(window.submitted.departure,'12:07');
 document.querySelector('.time-picker-trigger').click();await settle();button('AMTrước 12 giờ trưa').click();await settle();button('Chọn giờ').click();await settle();
 assert.equal(document.querySelector('[name=departure]').value,'00:07');
 document.querySelector('.time-picker-trigger').click();await settle();select('Giờ',11);await settle();button('Hủy').click();await settle();
 assert.equal(document.querySelector('[name=departure]').value,'00:07');
 document.querySelector('.time-picker-trigger').click();await settle();document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle();
 assert.equal(document.querySelector('.time-picker-panel'),null);assert.equal(document.activeElement,document.querySelector('.time-picker-trigger'));
 window.mount('picker',{name:'departure',value:'18:45',disabled:true});await settle();
 assert.ok(document.querySelector('.time-picker-trigger').textContent.includes('06:45 PM'));document.querySelector('.time-picker-trigger').click();await settle();assert.equal(document.querySelector('.time-picker-panel'),null);
});

test('AI intake receives 24-hour time with an AM/PM chat label',async t=>{
 const {window,document,button,select}=await setup(t);let answer;
 window.mount('intake',{question:{key:'departure',type:'time',label:'Giờ đi?'},value:{},onAnswer:(...values)=>{answer=values;},onCancel:()=>{}});await settle();
 document.querySelector('.time-picker-trigger').click();await settle();select('Giờ',6);await settle();select('Phút',35);await settle();button('PMTừ 12 giờ trưa').click();await settle();button('Chọn giờ').click();await settle();
 button('Tiếp tục').click();await settle();assert.deepEqual(answer,['18:35','06:35 PM']);
});

test('AI confirmation renders one day prefix and saves the AM/PM selection to the real trip',async t=>{
 const {window,document,button,select}=await setup(t);let saved;
 const draft=basicDraft('3N2Đ HN-CB');draft.days[2].title='Ngày 3: Ngày 3: Cao Bằng → Hà Nội';
 draft.details={date:'2026-10-24',departure:'06:30',people:2,vehicles:1};
 window.mount('draft',{draft,active:true,mode:'Bản nháp',onChange:()=>{},onCreatePlan:plan=>{saved=plan;}});await settle();
 assert.equal(document.querySelectorAll('.draft-day h3')[2].textContent,'Ngày 3: Cao Bằng → Hà Nội');
 button('Dùng lịch trình này').click();await settle();document.querySelector('.time-picker-trigger').click();await settle();select('Giờ',12);await settle();select('Phút',0);await settle();button('PMTừ 12 giờ trưa').click();await settle();button('Chọn giờ').click();await settle();
 document.querySelector('[type=checkbox]').click();button('Xác nhận tạo kế hoạch').click();await settle();
 assert.ok(saved);assert.equal(saved.aiDraft.departure,'12:00');assert.equal(saved.itinerary[0].rideReview.departure,'12:00');assert.equal(saved.itinerary[2].title,'Cao Bằng → Hà Nội');
});
