import {test,expect} from '@playwright/test';

const style={version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#e8ede8'}}]};
test.beforeEach(async({page})=>{
  await page.route('**/api/assistant/status',route=>route.fulfill({json:{ready:false,authRequired:true}}));
  await page.route('https://tiles.openfreemap.org/styles/**',route=>route.fulfill({json:style}));
  await page.route('https://photon.komoot.io/**',route=>route.fulfill({json:{features:[]}}));
});

test('screen code is requested on demand and navigation still opens each feature',async({page})=>{
  const requested=[];
  page.on('request',request=>requested.push(request.url()));
  await page.goto('/?page=plans');
  await expect(page.getByRole('heading',{name:'Kế hoạch của tôi (0)',exact:true})).toBeVisible();
  const loaded=name=>requested.some(url=>new RegExp(`/assets/${name}-[^/]+\\.js(?:\\?|$)`).test(url));
  for(const name of ['AIAssistant','Journal','Stays'])expect(loaded(name),name).toBe(false);
  await page.locator('.nav nav').getByRole('button',{name:'AI Assistant',exact:true}).click();
  await expect(page.locator('.ai-messages')).toBeVisible();
  expect(loaded('AIAssistant')).toBe(true);expect(loaded('Journal')).toBe(false);expect(loaded('Stays')).toBe(false);
  await page.locator('.nav nav').getByRole('button',{name:'Nhật ký',exact:true}).click();
  await expect(page.locator('.journal-page')).toBeVisible();
  expect(loaded('Journal')).toBe(true);expect(loaded('Stays')).toBe(false);
  await page.locator('.nav nav').getByRole('button',{name:'Công cụ',exact:true}).click();
  await page.getByRole('button',{name:/Chỗ nghỉ/}).click();
  await expect(page.getByRole('heading',{name:'Chỗ nghỉ cho chuyến đi',exact:true})).toBeVisible();
  expect(loaded('Stays')).toBe(true);
  await expect(page.locator('main')).toHaveCount(1);
});

test('the home map defers its library below the viewport and loads when approached',async({page})=>{
  const maps=[];
  page.on('request',request=>{if(/\/assets\/vendor-map-[^/]+\.js/.test(request.url()))maps.push(request.url());});
  await page.goto('/?page=home');
  await expect(page.locator('.hero')).toBeVisible();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const deferred=await page.locator('.deferred-destination-map').evaluate(el=>el.getBoundingClientRect().top>innerHeight+160);
  if(deferred){expect(maps).toHaveLength(0);await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);}
  await page.locator('.deferred-destination-map').scrollIntoViewIfNeeded();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  expect(maps.length).toBeGreaterThan(0);
});

test('map fallback works without IntersectionObserver',async({page})=>{
  await page.addInitScript(()=>{window.IntersectionObserver=undefined;});
  await page.goto('/?page=home');
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
});

test('the map can also be opened explicitly before an intersection notification',async({page})=>{
  await page.addInitScript(()=>{window.IntersectionObserver=class{observe(){}disconnect(){}};});
  await page.goto('/?page=home');
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'Mở bản đồ',exact:true}).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('failed page code leaves navigation available and can recover after reload',async({page})=>{
  let blocked=true;
  await page.route('**/assets/AIAssistant-*.js',route=>blocked?route.abort('failed'):route.continue());
  await page.goto('/?page=plans');
  await page.locator('.nav nav').getByRole('button',{name:'AI Assistant',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Chưa tải được trang',exact:true})).toBeVisible();
  await page.locator('.nav nav').getByRole('button',{name:'Kế hoạch',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kế hoạch của tôi (0)',exact:true})).toBeVisible();
  await page.locator('.nav nav').getByRole('button',{name:'AI Assistant',exact:true}).click();
  await expect(page.getByRole('button',{name:'Tải lại trang',exact:true})).toBeVisible();
  blocked=false;
  await page.getByRole('button',{name:'Tải lại trang',exact:true}).click();
  await expect(page.locator('.ai-messages')).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
});
