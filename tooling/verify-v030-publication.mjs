import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('docs/evidence/v030-release-manifest.json','utf8'));
const site='https://wangpingpang.github.io/hi-story/',files=[],errors=[];
for(const file of manifest.files){const response=await fetch(new URL(file.path,site));assert.equal(response.status,200,file.path);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);files.push({path:file.path,status:response.status,sha256:file.sha256,size:bytes.length});}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));
 const response=await page.goto(site+'?view=demo&seed=public-v030',{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);await page.locator('.adventure-shell[data-version="0.3.0"]').waitFor();assert.equal(await page.title(),'暮光山谷 · hi-story v0.3.0');
 await page.waitForFunction(()=>document.querySelector('.world-canvas')?.getAttribute('data-motion')==='stand');await page.getByRole('button',{name:'向下',exact:true}).focus();await page.keyboard.press('Enter');await page.locator('.position-label').filter({hasText:'坐标 6.00, 8.32'}).waitFor();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:world-v2')).payload),saved=await read();assert.deepEqual(saved.runtime.map.bounds,{width:64,height:50});
 await page.reload({waitUntil:'networkidle'});await page.locator('.position-label').filter({hasText:'坐标 6.00, 8.32'}).waitFor();assert.deepEqual((await read()).runtime,saved.runtime);
 await page.getByRole('button',{name:'旅程',exact:true}).click();await page.getByRole('link',{name:'职业衣橱',exact:true}).click();await page.locator('[data-fitting] canvas').waitFor();assert.equal(await page.locator('#wardrobe-class option').count(),12);await page.locator('#wardrobe-class').selectOption('wizard');await page.locator('#wardrobe-gender').selectOption('male');await page.getByRole('link',{name:'返回山谷'}).click();await page.locator('.adventure-shell').waitFor();assert.deepEqual((await read()).runtime,saved.runtime);
 await page.getByRole('button',{name:'背包',exact:true}).click();await page.getByRole('heading',{name:'行囊与交易'}).waitFor();await page.screenshot({path:'docs/evidence/v030-public-desktop.png'});
 await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'互动',exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'docs/evidence/v030-public-narrow.png'});assert.deepEqual(errors,[]);
 writeFileSync('docs/evidence/v030-public-validation.json',JSON.stringify({status:'passed',testedSource:manifest.testedSource,checkedAt:new Date().toISOString(),url:site,files,checks:['all release file hashes','64x50 world','live character motion art','continuous position','refresh restore','wardrobe and return without changing adventure','scene inventory','375px overflow'],errors},null,2));console.log('PASS: v0.3.0 published bytes, movement, save, wardrobe and narrow scene.');
}finally{await browser.close();}
