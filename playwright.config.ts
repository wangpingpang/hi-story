import {existsSync} from 'node:fs';
import {defineConfig} from '@playwright/test';

// Windows/macOS and Linux without a system browser use Playwright's installation.
const systemChromium=process.platform==='linux'
 ? ['/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>existsSync(path))
 : undefined;
const executablePath=process.env.CHROMIUM_PATH||systemChromium;
// Explicit remote runs use the deployed project path and do not start a local server.
const externalBaseURL=process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({testDir:'tests/e2e',fullyParallel:false,retries:0,workers:1,timeout:90000,expect:{timeout:10000},reporter:[['list'],['json',{outputFile:process.env.PLAYWRIGHT_REPORT_PATH||'docs/evidence/browser-results.json'}]],use:{baseURL:externalBaseURL||'http://127.0.0.1:4173',launchOptions:{...(executablePath?{executablePath}:{}),args:[...(process.platform==='linux'?['--no-sandbox']:[]),...(process.env.CHROMIUM_SINGLE_PROCESS==='1'?['--single-process','--no-zygote','--disable-dev-shm-usage']:[])]},trace:'retain-on-failure'},projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'narrow',use:{viewport:{width:375,height:812},isMobile:true,hasTouch:true}}],webServer:externalBaseURL?undefined:{command:'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false}});
