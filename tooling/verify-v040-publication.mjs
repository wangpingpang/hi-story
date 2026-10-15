import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('docs/evidence/v040-release-manifest.json','utf8'));
const site='https://wangpingpang.github.io/hi-story/',files=[],errors=[];
for(let offset=0;offset<manifest.files.length;offset+=6){
 await Promise.all(manifest.files.slice(offset,offset+6).map(async file=>{
  const response=await fetch(new URL(file.path,site),{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,file.path);
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,file.sha256,file.path);files.push({path:file.path,status:response.status,sha256,size:bytes.length});
 }));
}
const proxyValue=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
const proxyUrl=proxyValue?new URL(proxyValue):undefined;
const proxy=proxyUrl?{server:proxyUrl.origin,...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}:undefined;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage'],...(proxy?{proxy}:{})});
try{
 // The provisioned proxy CA is trusted by Node but absent from this Chromium image.
 // Node above verifies HTTPS resource bytes normally; the browser checks game interaction.
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',ignoreHTTPSErrors:Boolean(proxy)});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));
 const response=await page.goto(site+'?view=demo&seed=v040-visual',{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);
 await page.locator('.adventure-shell[data-version="0.4.0"]').waitFor();assert.equal(await page.title(),'暮光山谷 · hi-story v0.4.0');
 await page.waitForFunction(()=>document.querySelector('.world-canvas')?.getAttribute('data-motion')==='stand');
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:world-v2')).payload);
 const initial=await read();assert.deepEqual(initial.runtime.map.bounds,{width:64,height:50});
 await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await page.screenshot({path:'docs/evidence/v040-public-desktop.png'});
 await page.locator('[data-actor="npc-0"] rect').click();await page.locator('[data-choice="persuade"]:enabled').waitFor();
 const near=await read(),player=near.runtime.actors[near.playerActorId],npc=Object.values(near.runtime.actors).find(a=>a.storyNpcId==='npc-0');
 assert(Math.hypot(player.position.x-npc.position.x,player.position.y-npc.position.y)<=1.12);assert.notDeepEqual(player.position,initial.runtime.actors[initial.playerActorId].position);
 await page.locator('[data-choice="persuade"]').click();await page.getByRole('button',{name:'继续冒险',exact:true}).waitFor();const rolled=await read();assert.equal(rolled.runtime.checks.length,near.runtime.checks.length+1);
 await page.getByRole('button',{name:'继续冒险',exact:true}).click();await page.locator('#dice-review').click();await page.getByRole('button',{name:'继续冒险',exact:true}).click();assert.deepEqual((await read()).runtime.checks,rolled.runtime.checks);
 await page.goto(site+'?view=demo',{waitUntil:'networkidle'});await page.locator('.adventure-shell').waitFor();assert.deepEqual((await read()).runtime,rolled.runtime);
 await page.locator('[data-panel="settings"]').click();await page.getByRole('link',{name:'职业衣橱',exact:true}).click();await page.locator('[data-fitting] canvas').waitFor();assert.equal(await page.locator('#wardrobe-class option').count(),12);
 await page.locator('#wardrobe-class').selectOption('wizard');await page.locator('#wardrobe-gender').selectOption('male');await page.getByRole('link',{name:'返回山谷'}).click();await page.locator('.adventure-shell').waitFor();assert.deepEqual((await read()).runtime,rolled.runtime);
 await page.getByRole('button',{name:'向下',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForFunction(before=>{const s=JSON.parse(localStorage.getItem('hi-story:adventure:world-v2')).payload;return s.runtime.actors[s.playerActorId].position.y>before;},player.position.y);
 const walked=await read();assert(Math.abs(walked.runtime.actors[walked.playerActorId].position.y-player.position.y-.32)<1e-7);
 await page.reload({waitUntil:'networkidle'});await page.locator('.adventure-shell').waitFor();assert.deepEqual((await read()).runtime,walked.runtime);
 await page.setViewportSize({width:375,height:812});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await page.screenshot({path:'docs/evidence/v040-public-narrow.png'});
 assert.deepEqual(errors,[]);
 writeFileSync('docs/evidence/v040-public-validation.json',JSON.stringify({status:'passed',testedSource:manifest.testedSource,checkedAt:new Date().toISOString(),url:site,browserThroughEnvironmentProxy:Boolean(proxy),browserCertificateValidationSkippedForProxy:Boolean(proxy),nodeResourceCertificateValidation:true,files:files.sort((a,b)=>a.path.localeCompare(b.path)),checks:['all release bytes HTTP200 and SHA256','version and title 0.4.0','64x50 world and live character art','actual click and walking to NPC','social check commits once','dice review does not reroll','refresh restores runtime','wardrobe return preserves runtime','continuous .32 movement','375px scene without overflow'],errors},null,2)+'\n');
 console.log(`PASS: v0.4.0 public verification, ${files.length} release files and 10 interaction checks.`);
}finally{await browser.close();}
