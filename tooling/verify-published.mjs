import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const url=process.env.SITE_URL || 'https://wangpingpang.github.io/hi-story/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[],responses=[];const page=await browser.newPage({viewport:{width:375,height:812}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));page.on('response',r=>{responses.push({url:r.url(),status:r.status()});if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
try {
 const response=await page.goto(url,{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);
 assert.equal(await page.title(),'雾桥递信 · hi-story');
 for(const choice of ['D','solo','anonymous']){await page.locator(`[data-choice="${choice}"]`).click();await page.locator(`[data-choice="${choice}"]`).waitFor({state:'detached'});}
 await page.getByRole('heading',{name:'信已送达，明早处理'}).waitFor();assert.equal(await page.getByTestId('time').textContent(),'4');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.locator('[data-choice]').count(),0);
 const assets=responses.filter(r=>/\.(js|css)(?:\?|$)/.test(r.url));assert.equal(assets.length,2);assert(assets.every(r=>new URL(r.url).pathname.startsWith('/hi-story/assets/')&&r.status===200));assert.deepEqual(errors,[]);
 await page.screenshot({path:'docs/evidence/pages-public-morning.png',fullPage:true});
 writeFileSync('docs/evidence/pages-smoke.json',JSON.stringify({url:page.url(),checkedAt:new Date().toISOString(),route:'D/solo/anonymous',elapsed:4,ending:'morning',viewport:'375x812',resources:responses,errors,status:'passed'},null,2));console.log('PASS',page.url(),JSON.stringify(responses));
}finally {await browser.close();}
