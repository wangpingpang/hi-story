import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('docs/evidence/v020-release-manifest.json','utf8'));
const site='https://wangpingpang.github.io/hi-story/';
const results=[];
for(const file of manifest.files){
 const response=await fetch(new URL(file.path,site));assert.equal(response.status,200,file.path);const body=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(body).digest('hex'),file.sha256,file.path+' differs from tested build');results.push({path:file.path,status:response.status,sha256:file.sha256,size:body.length});
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));
 const response=await page.goto(site+'?view=demo&seed=public-v020',{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);await page.locator('.adventure-shell[data-version="0.2.0"]').waitFor();assert.equal(await page.title(),'暮光山谷 · hi-story v0.2.0');assert(await page.locator('.iso-player image').getAttribute('href'));
 await page.getByRole('button',{name:'向下',exact:true}).click();await page.locator('.position-label').filter({hasText:'坐标 3, 4'}).waitFor();await page.reload({waitUntil:'networkidle'});await page.locator('.position-label').filter({hasText:'坐标 3, 4'}).waitFor();
 await page.getByRole('button',{name:'背包',exact:true}).click();await page.getByRole('heading',{name:'行囊与交易'}).waitFor();await page.screenshot({path:'docs/evidence/v020-public-desktop.png'});
 await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'互动',exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'docs/evidence/v020-public-narrow.png'});assert.deepEqual(errors,[]);
 writeFileSync('docs/evidence/v020-public-validation.json',JSON.stringify({status:'passed',testedSource:manifest.testedSource,url:page.url(),checkedAt:new Date().toISOString(),files:results,desktop:'1440x1000',narrow:'375x812',checks:['exact published assets','2.5D sprite scene','real movement','refresh restore','scene inventory','narrow overflow'],errors},null,2));console.log('PASS: published build bytes, desktop/narrow scene, movement and save recovery.');
}finally{await browser.close();}
