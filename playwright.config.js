import {defineConfig} from '@playwright/test';

const production = process.env.RIDEMATE_TEST_PRODUCTION === '1';
const port = production ? 5182 : 5180;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir:'./tests/mobile',outputDir:'output/mobile/test-results',timeout:45000,
  workers:1,reporter:'list',
  use:{baseURL,headless:true,locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh',channel:process.platform==='win32'?'msedge':undefined,screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[
    ...[320,360,390,430].map(width=>({name:`phone-${width}`,use:{viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}})),
    {name:'phone-landscape',use:{viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1}},
    {name:'desktop',use:{viewport:{width:1440,height:1000}}},
  ],
  webServer:{command:`node node_modules/vite/bin/vite.js ${production?'preview ':''}--host 127.0.0.1 --port ${port} --strictPort`,url:baseURL,reuseExistingServer:!production&&!process.env.CI},
});
