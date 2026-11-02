import {test,expect} from '@playwright/test';
import {createTrip} from '../../src/trip-data.js';
import {mkdir} from 'node:fs/promises';

const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
const plan=createTrip({origin:'Hà Nội',destination:'Thái Nguyên',date,days:2,notes:'Weather test',interests:[]});
plan.returnToOrigin=true;
plan.itinerary=plan.itinerary.map((day,i)=>({...day,places:[{id:`weather-stop-${i}`,name:`Điểm dừng ${i+1}`,coordinates:[105.88+i*.02,21.08+i*.01]}],planning:{departure:'07:00',visitMinutes:30,mealMinutes:30,...(i===0?{lodgingPoint:{label:'Nơi nghỉ đã chọn',coordinates:[105.91,21.13]}}:{})}}));
const style={version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#e8ede8'}}]};

async function setup(page,{partial=false,delay=false,missing=false,future=false,offline=false}={}) {
  const requests={weather:[],routes:[],release:null};
  const stored=structuredClone(plan);
  if(missing)delete stored.itinerary[0].places[0].coordinates;
  if(future)stored.date=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
  await page.addInitScript(plan=>localStorage.setItem('ridemate.plans.v1',JSON.stringify([plan])),stored);
  await page.route('**/api/assistant/status',route=>route.fulfill({json:{ready:false,authRequired:true}}));
  await page.route('https://tiles.openfreemap.org/styles/**',route=>route.fulfill({json:style}));
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({json:{daily:{time:[date],weather_code:[0],temperature_2m_min:[20],temperature_2m_max:[30],precipitation_probability_max:[0],wind_speed_10m_max:[10]}}}));
  await page.route('https://valhalla1.openstreetmap.de/**',async route=>{
    const locations=JSON.parse(new URL(route.request().url()).searchParams.get('json')).locations;
    const points=locations.map(p=>[p.lon,p.lat]);requests.routes.push(points);
    const legs=points.slice(1).map((point,i)=>({distance:100000,duration:5400,steps:[{distance:100000,duration:5400,name:'Quốc lộ',geometry:{coordinates:[points[i],point]}}]}));
    await route.fulfill({json:{code:'Ok',routes:[{distance:legs.length*100000,duration:legs.length*5400,geometry:{coordinates:points},legs}]}});
  });
  await page.route('**/api/route-weather?**',async route=>{
    const p=new URL(route.request().url()).searchParams;requests.weather.push(p);
    if(offline)return route.fulfill({status:503,json:{error:'WEATHER_UNAVAILABLE'}});
    if(delay)await new Promise(resolve=>{requests.release=resolve;});
    const time=[];for(let t=+p.get('start');t<=+p.get('end');t+=3600)time.push(t);
    const forecasts=p.get('latitudes').split(',').map((_,i)=>partial&&i===1?null:{hourly:{time,precipitation:time.map(()=>i%3===0?6:0),precipitation_probability:time.map(()=>i%3===0?80:10),weather_code:time.map(()=>i%3===0?95:0),temperature_2m:time.map(()=>25),cloud_cover:time.map(()=>40),wind_gusts_10m:time.map(()=>20),visibility:time.map(()=>10000)}});
    await route.fulfill({json:{forecasts,fetchedAt:Date.now()}}).catch(()=>{});
  });
  await page.goto(`/?page=trip&trip=${plan.id}`);
  await page.getByText('Bản đồ, thời tiết và thông tin tuyến',{exact:true}).click();
  const panel=page.getByRole('region',{name:'Thời tiết dọc đường',exact:true});
  await expect(panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true})).toBeVisible();
  expect(requests.weather).toHaveLength(0);
  return {panel,requests};
}

test('weather follows each day, colors the full route, keeps missing points gray and reuses route for a new departure',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const {panel,requests}=await setup(page,{partial:true});
  await panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true}).click();
  await expect(panel.locator('.weather-summary')).toContainText('thiếu dữ liệu');
  await expect(panel.locator('.route-weather-points li.weather-none')).toHaveCount(1);
  await expect(panel.locator('.weather-map-pin').first()).toBeVisible();
  expect(requests.weather).toHaveLength(1);
  await panel.locator('.route-weather-points button').first().click();
  await expect(panel.locator('.route-weather-points button').first()).toHaveAttribute('aria-pressed','true');
  await panel.getByRole('button',{name:'Màu ngày đi',exact:true}).click();
  await expect(panel.locator('.weather-map-pin')).toHaveCount(0);
  await panel.getByRole('button',{name:'Màu thời tiết',exact:true}).click();
  await expect(panel.locator('.weather-map-pin').first()).toBeVisible();
  const routeCount=requests.routes.length;
  await panel.getByLabel('Giờ xuất phát',{exact:true}).fill('08:00');
  await expect(panel.locator('.weather-summary')).toHaveCount(0);
  await panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true}).click();
  await expect(panel.locator('.weather-summary')).toBeVisible();
  expect(requests.routes.length).toBe(routeCount);
  await panel.getByRole('combobox',{name:'Ngày phân tích',exact:true}).selectOption('1');
  await panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true}).click();
  await expect(panel.locator('.weather-summary')).toBeVisible();
  expect(requests.routes.some(points=>Math.abs(points[0][0]-105.91)<.0001&&Math.abs(points.at(-1)[0]-105.854041)<.001)).toBe(true);
  const size=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(size.width).toBeLessThanOrEqual(size.viewport+1);
  await mkdir('output/mobile/screenshots',{recursive:true});
  await panel.locator('.weather-map-pin').first().click({trial:true});
  await panel.screenshot({path:`output/mobile/screenshots/${testInfo.project.name}-route-weather.png`,style:'.nav{visibility:hidden}'});
  expect(errors).toEqual([]);
});

test('changing input cancels an older forecast and never displays its stale result',async({page})=>{
  const {panel,requests}=await setup(page,{delay:true});
  await panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true}).click();
  await expect.poll(()=>requests.weather.length).toBe(1);
  await panel.getByLabel('Giờ xuất phát',{exact:true}).fill('09:00');
  requests.release();
  await expect(panel.locator('.weather-summary')).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true})).toBeEnabled();
});

test('missing stop coordinates are explained without weather requests',async({page})=>{
  const {panel,requests}=await setup(page,{missing:true});
  await panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('Bổ sung vị trí');
  expect(requests.weather).toHaveLength(0);
});

test('dates beyond the forecast horizon never call the weather provider',async({page})=>{
  const {panel,requests}=await setup(page,{future:true});
  await panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('7 ngày');
  expect(requests.weather).toHaveLength(0);
});

test('provider failure keeps the trip usable and marks every forecast point as unknown',async({page})=>{
  const {panel}=await setup(page,{offline:true});
  await panel.getByRole('button',{name:'Phân tích thời tiết dọc đường',exact:true}).click();
  await expect(panel.locator('.weather-summary')).toContainText('chưa đầy đủ');
  await expect(panel.locator('.route-weather-points li').first()).toContainText('Không có dữ liệu');
  await expect(panel.locator('.route-weather-points li.weather-ok')).toHaveCount(0);
  await page.getByRole('button',{name:'3. Nhật ký',exact:true}).click();
  await expect(page.locator('.journey-page .journal-page')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.preparation-card')).toBeVisible();
});
