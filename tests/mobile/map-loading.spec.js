import {test, expect} from '@playwright/test';

// Exercise bundled workers without depending on tile servers, live auth or GPS.
// GeoJSON forces the MapLibre worker to execute, not merely create a canvas.
const mapStyle = {
  version:8,
  sources:{fixture:{type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[106.2,16.2]}}]}}},
  layers:[{id:'background',type:'background',paint:{'background-color':'#e8ede8'}},{id:'fixture-point',type:'circle',source:'fixture',paint:{'circle-radius':9,'circle-color':'#0f6745'}}],
};

test.beforeEach(async({page})=>{
  await page.route('**/api/assistant/status',route=>route.fulfill({json:{ready:false,authRequired:true}}));
  await page.route('https://tiles.openfreemap.org/styles/**',route=>route.fulfill({json:mapStyle}));
  await page.route('https://photon.komoot.io/**',route=>route.fulfill({json:{features:[]}}));
});

test('production pages render and map worker loads from the same app',async({page})=>{
  const errors=[], workers=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('worker',worker=>workers.push(worker.url()));
  const response=await page.goto('/?page=plans');
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole('heading',{name:'Kế hoạch của tôi (0)',exact:true})).toBeVisible();
  expect(workers).toHaveLength(0);
  await page.locator('.nav nav').getByRole('button',{name:'AI Assistant',exact:true}).click();
  await expect(page.locator('.ai-messages')).toBeVisible();
  expect(workers).toHaveLength(0);
  // Observe worker requests and completion through browser diagnostics.
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    window.__mapWorkers=[];window.__mapWorkerReplies=0;
    window.Worker=class extends NativeWorker{
      constructor(url,options){
        super(url,options);window.__mapWorkers.push(String(url));
        this.addEventListener('message',()=>window.__mapWorkerReplies++);
      }
    };
  });
  await page.goto('/?page=home');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__mapWorkerReplies)).toBeGreaterThan(0);
  const urls=await page.evaluate(()=>window.__mapWorkers);
  expect(urls.length).toBeGreaterThan(0);
  for(const url of urls){expect(new URL(url, page.url()).origin).toBe(new URL(page.url()).origin);expect(url).toContain('maplibre-gl-worker');}
  const hero=await page.request.get('/hero-original.jpg');
  expect(hero.ok()).toBeTruthy();expect(hero.headers()['content-type']).toContain('image/jpeg');
  expect(await page.locator('.hero').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('/hero-original.jpg');
  await expect(page.locator('main')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('failed map stylesheet load shows one retry and navigation stays usable',async({page})=>{
  let blocked=true;
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(blocked && /\.css(?:\?|$)/.test(url) && /maplibre|vendor-map/.test(url))return route.abort('failed');
    return route.fallback();
  });
  await page.goto('/?page=home');
  const retry=page.getByRole('button',{name:'Thử lại bản đồ',exact:true});
  await expect(retry).toBeVisible();
  await expect(page.locator('.hero')).toBeVisible();
  blocked=false;
  await retry.click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(retry).toHaveCount(0);
  await page.locator('.nav nav').getByRole('button',{name:'Kế hoạch',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kế hoạch của tôi (0)',exact:true})).toBeVisible();
});
