import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/mobile',outputDir:'output/mobile/test-results',timeout:45000,
  workers:1,reporter:'list',
  use:{baseURL:'http://127.0.0.1:5180',headless:true,locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh',channel:process.platform==='win32'?'msedge':undefined,screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[
    ...[320,360,390,430].map(width=>({name:`phone-${width}`,use:{viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}})),
    {name:'phone-landscape',use:{viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1}},
    {name:'desktop',use:{viewport:{width:1440,height:1000}}},
  ],
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180 --strictPort',url:'http://127.0.0.1:5180',reuseExistingServer:!process.env.CI},
});
