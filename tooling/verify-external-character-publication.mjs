import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const manifest=JSON.parse(readFileSync('docs/evidence/external-character-release-manifest.json','utf8'));
const site=process.env.HI_STORY_SITE||'https://wangpingpang.github.io/hi-story/';
const evidence=process.env.HI_STORY_EVIDENCE_DIR||'docs/evidence';mkdirSync(evidence,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[];let cursor=0;
// Compare the exact tested build, including all local character atlases.
await Promise.all(Array.from({length:4},async()=>{while(cursor<manifest.files.length){
 const file=manifest.files[cursor++],response=await fetch(new URL(file.path,site),{signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200,file.path);const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(sha(bytes),file.sha256,file.path);files.push({path:file.path,bytes:bytes.length});
}}));
// Playwright proxies loopback explicitly when a proxy is configured. A local
// preview must stay direct; the remote publication still uses the host proxy.
const hostname=new URL(site).hostname,loopback=hostname==='localhost'||hostname==='[::1]'||/^127(?:\.\d{1,3}){3}$/.test(hostname);
const value=loopback?undefined:process.env.HTTPS_PROXY||process.env.HTTP_PROXY,u=value?new URL(value):undefined;
const proxy=u?{server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})}:undefined;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy}:{})});
const results=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:375,height:812}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],failed=[],consoleMessages=[],requestFailures=[];let phase='initial navigation';
  page.on('console',m=>consoleMessages.push({type:m.type(),text:m.text()}));page.on('requestfailed',r=>requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
  try{
  const navigation=await page.goto(site+'?view=character-library',{waitUntil:'networkidle',timeout:60000});assert(navigation?.ok(),`Navigation failed: HTTP ${navigation?.status()} ${page.url()}`);
  phase='catalog initialization';
  await page.waitForFunction(()=>document.querySelector('[data-cl-canvas]')?.getAttribute('data-ready')==='ready');
  assert.equal(await page.locator('[data-cl-model]').count(),28);assert.equal(await page.locator('[data-cl-action]').count(),19);assert.equal(await page.locator('button[data-cl-direction]').count(),8);
  phase='northern attack preview';await page.getByRole('button',{name:'预览贝堤特',exact:true}).click();
  await page.getByRole('button',{name:'攻击',exact:true}).click();await page.locator('button[data-cl-direction="1"]').click();
  await page.waitForFunction(()=>{const c=document.querySelector('[data-cl-canvas]');return c?.getAttribute('data-ready')==='ready'&&c.getAttribute('data-model')==='role-1432'&&c.getAttribute('data-action')==='5'&&c.getAttribute('data-direction')==='1';});
  await page.screenshot({path:`${evidence}/external-public-library-${viewport.width}.png`,fullPage:true});
  phase='return to adventure';await page.getByRole('button',{name:'作为旅人，返回旅程',exact:false}).click();
  await page.locator('.world-canvas[data-character-status="ready"]').waitFor();
  assert.equal(await page.locator('.world-canvas').getAttribute('data-character-model'),'role-1432');
  await page.getByRole('button',{name:'关闭浮层',exact:true}).click();
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:world-v2')).payload);
  phase='continuous movement';const before=await read();await page.locator('#adventure-map').focus();await page.keyboard.down('d');await page.waitForTimeout(350);await page.keyboard.up('d');await page.waitForTimeout(300);
  const after=await read();assert.notDeepEqual(after.runtime.actors[after.playerActorId].position,before.runtime.actors[before.playerActorId].position);
  const point=await page.locator('[data-actor="player"] rect').evaluate(el=>{const p=new DOMPoint(+el.getAttribute('x')+18,+el.getAttribute('y')+34).matrixTransform(el.getScreenCTM());return {dx:p.x-innerWidth/2,dy:p.y-innerHeight/2};});
  assert(Math.hypot(point.dx,point.dy)<.1);phase='refresh recovery';await page.reload({waitUntil:'networkidle'});await page.locator('.world-canvas[data-character-status="ready"]').waitFor();assert.deepEqual((await read()).runtime,after.runtime);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(requestFailures,[]);
  await page.screenshot({path:`${evidence}/external-public-game-${viewport.width}.png`});
  results.push({viewport,model:'role-1432',checks:['28 characters / 19 actions / 8 directions','northern attack preview','visual preference selection','actual continuous movement','centered camera','refresh preserves runtime','no overflow or page errors'],centerError:Math.hypot(point.dx,point.dy),errors,failed,consoleMessages,requestFailures});
  }catch(error){
   const diagnostic={viewport,phase,url:page.url(),error:String(error),errors,failed,consoleMessages,requestFailures};
   try{diagnostic.page=await page.evaluate(()=>({title:document.title,readyState:document.readyState,body:document.body?.innerText?.slice(0,6000),canvas:document.querySelector('[data-cl-canvas]')?.outerHTML,world:document.querySelector('.world-canvas')?.outerHTML}));}catch{}
   writeFileSync(`${evidence}/external-public-failure-${viewport.width}.json`,JSON.stringify(diagnostic,null,2)+'\n');
   await page.screenshot({path:`${evidence}/external-public-failure-${viewport.width}.png`,fullPage:true}).catch(()=>{});
   console.error(`FAIL ${viewport.width}px during ${phase}: ${String(error)}; diagnostics: ${evidence}/external-public-failure-${viewport.width}.json`);
   throw error;
  }finally{await context.close();}
 }
 writeFileSync(`${evidence}/external-character-public-validation.json`,JSON.stringify({status:'passed',checkedAt:new Date().toISOString(),site,buildId:manifest.buildId,verifiedFiles:files.length,results},null,2)+'\n');
 console.log(`PASS: ${files.length} published files match the tested build; desktop and narrow live interactions pass.`);
}finally{await browser.close();}
