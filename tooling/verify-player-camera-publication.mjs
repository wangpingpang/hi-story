import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(readFileSync('docs/evidence/player-camera-release-manifest.json','utf8')),site='https://wangpingpang.github.io/hi-story/';
for(const file of manifest.files){const r=await fetch(new URL(file.path,site),{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,file.path);assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),file.sha256,file.path);}
const value=process.env.HTTPS_PROXY||process.env.HTTP_PROXY,u=value?new URL(value):undefined,proxy=u?{server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})}:undefined;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy}:{})}),results=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:375,height:812}]){
  const context=await browser.newContext({viewport,ignoreHTTPSErrors:Boolean(proxy)}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site+'?view=demo&seed=player-camera-public',{waitUntil:'networkidle',timeout:60000});await page.locator('.world-canvas[data-art="ready"]').waitFor();await page.getByRole('button',{name:'关闭浮层',exact:true}).click();
  await page.evaluate(()=>{window.__cameraSamples=[];window.__cameraTimer=setInterval(()=>{const r=document.querySelector('[data-actor="player"] rect');if(!r)return;const p=new DOMPoint(+r.getAttribute('x')+18,+r.getAttribute('y')+34).matrixTransform(r.getScreenCTM());window.__cameraSamples.push({dx:p.x-innerWidth/2,dy:p.y-innerHeight/2});},16);});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:world-v2')).payload);
  const start=await read();await page.locator('#adventure-map').focus();await page.keyboard.down('ArrowDown');await page.waitForTimeout(350);await page.keyboard.up('ArrowDown');await page.waitForTimeout(200);
  const moved=await read();assert.notDeepEqual(moved.runtime.actors[moved.playerActorId].position,start.runtime.actors[start.playerActorId].position);
  await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down();await page.mouse.move(viewport.width/2+60,viewport.height/2+40,{steps:5});await page.mouse.up();await page.waitForTimeout(100);assert.deepEqual((await read()).runtime.actors[moved.playerActorId].position,moved.runtime.actors[moved.playerActorId].position);
  await page.getByRole('button',{name:'放大地图'}).click();await page.waitForTimeout(250);
  const samples=await page.evaluate(()=>{clearInterval(window.__cameraTimer);return window.__cameraSamples;});assert(samples.length>10);const maxError=Math.max(...samples.map(p=>Math.hypot(p.dx,p.dy)));assert(maxError<.1,`camera error ${maxError}`);
  await page.goto(site+'?view=demo',{waitUntil:'networkidle'});await page.locator('.world-canvas[data-art="ready"]').waitFor();assert.deepEqual((await read()).runtime,moved.runtime);assert.deepEqual(errors,[]);
  results.push({viewport,samples:samples.length,maxError,checks:['actual continuous movement','centered through movement and zoom','drag does not detach or move player','refresh preserves runtime'],errors});await context.close();
 }
 writeFileSync('docs/evidence/player-camera-public-validation.json',JSON.stringify({status:'passed',checkedAt:new Date().toISOString(),source:manifest.testedSource,files:manifest.files,browserThroughEnvironmentProxy:Boolean(proxy),browserCertificateValidationSkippedForProxy:Boolean(proxy),nodeResourceCertificateValidation:true,results},null,2)+'\n');console.log('PASS: published bundles and player-centered camera on desktop and 375px.');
}finally{await browser.close();}
