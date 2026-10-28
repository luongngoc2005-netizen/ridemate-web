import {test,expect} from '@playwright/test';
import {createTrip} from '../../src/trip-data.js';
import {mkdir} from 'node:fs/promises';

// Isolated guest storage: never sign in, touch a real plan, request GPS or call a model.
const plan=createTrip({origin:'Hà Nội',destination:'Lạng Sơn',date:'2026-11-07',days:3,notes:'Chuyến kiểm thử giao diện điện thoại',interests:[]});
test.beforeEach(async({page})=>{
 await page.addInitScript(plan=>localStorage.setItem('ridemate.plans.v1',JSON.stringify([plan])),plan);
 await page.route('**/api/assistant/status',route=>route.fulfill({json:{ready:false,authRequired:true}}));
});
async function capture(page,name,testInfo){
 await mkdir('output/mobile/screenshots',{recursive:true});
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:`output/mobile/screenshots/${testInfo.project.name}-${name}.png`,fullPage:true});
}
async function noOverflow(page){
 const result=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
  offenders:[...document.querySelectorAll('main *,footer,.nav,.companion-panel')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&s.position!=='fixed'&&s.visibility!=='hidden'&&r.right>innerWidth+2;}).slice(0,8).map(el=>el.className||el.tagName)}));
 expect(result.width,JSON.stringify(result)).toBeLessThanOrEqual(result.viewport+1);
}
for(const view of ['home','plans','create','checklist','ai','journal','tools','stays','account','trip']){
 test(`${view} fits the screen`,async({page},testInfo)=>{
  await page.goto(`/?page=${view}&trip=${plan.id}`);
  await expect(page.locator('main')).toBeVisible();
  if(view==='ai')await expect(page.locator('.ai-messages')).toBeVisible();
  if(view==='journal')await expect(page.locator('.journal-page')).toBeVisible();
  if(view==='stays')await expect(page.getByRole('heading',{name:'Chỗ nghỉ cho chuyến đi',exact:true})).toBeVisible();
  await capture(page,view,testInfo);
  await noOverflow(page);
  const nav=page.locator('.nav nav button');await expect(nav).toHaveCount(5);
  if(testInfo.project.name!=='desktop'){
   const first=await nav.first().boundingBox(),last=await nav.last().boundingBox();
   expect(Math.abs(first.width-last.width)).toBeLessThan(2);
   expect(last.x+last.width).toBeGreaterThan(page.viewportSize().width-16);
  }
 });
}
test('companion remains above navigation and can scroll to the last action',async({page},testInfo)=>{
 await page.goto(`/?page=trip&trip=${plan.id}`);await page.locator('.companion-launcher').click();
 await expect(page.locator('.companion-panel')).toBeVisible();
 await capture(page,'companion',testInfo);await noOverflow(page);
  const panel=await page.locator('.companion-panel').boundingBox(),header=await page.locator('.nav').boundingBox();
  expect(panel.y).toBeGreaterThanOrEqual(header.y+header.height);
  if(testInfo.project.name!=='desktop'){
   const nav=await page.locator('.nav nav').boundingBox();expect(panel.y+panel.height).toBeLessThanOrEqual(nav.y);
  }
  const lastAction=page.locator('.companion-results .companion-place-actions button').last();
  await lastAction.scrollIntoViewIfNeeded();await expect(lastAction).toBeInViewport();
  const close=page.locator('.companion-header button');await expect(close).toBeVisible();await close.click();await expect(page.locator('.companion-panel')).toHaveCount(0);
  await expect(page.locator('.companion-launcher')).toBeFocused();
});
test('AI clock and origin dialog stay usable on a narrow screen',async({page},testInfo)=>{
 await page.goto(`/?page=ai&trip=${plan.id}`);
 await page.locator('#assistant-message').focus();
 if(testInfo.project.name!=='desktop')await expect(page.locator('.companion-launcher')).toBeHidden();
 await page.locator('#assistant-message').fill('Tạo chuyến đi 3 ngày 2 đêm từ Hà Nội đến Lạng Sơn');
 await page.getByRole('button',{name:'Gửi',exact:true}).click();
 const author=await page.locator('.ai-message.user .ai-author').first().boundingBox();expect(author.height).toBeLessThan(30);
 await page.locator('.trip-intake-form input[type=date]').fill('2026-11-07');
 await page.locator('.time-picker-trigger').click();await expect(page.locator('.time-picker-panel')).toBeVisible();
 await capture(page,'clock',testInfo);await noOverflow(page);
 await page.getByRole('button',{name:'Chọn giờ',exact:true}).click();
 await expect(page.getByRole('button',{name:'Tạo lịch trình',exact:true})).toBeEnabled();
 if(testInfo.project.name!=='desktop'){
  await page.setViewportSize({width:page.viewportSize().width,height:500});
  await page.locator('#assistant-message').fill('Tôi muốn xuất phát buổi sáng');
  await page.locator('#assistant-message').scrollIntoViewIfNeeded();
  await expect(page.locator('.companion-launcher')).toBeHidden();await noOverflow(page);
 }
 await page.goto('/?page=home');await page.locator('.origin-adjust').first().click();
 await expect(page.locator('.origin-dialog')).toBeVisible();await capture(page,'origin',testInfo);await noOverflow(page);
});
