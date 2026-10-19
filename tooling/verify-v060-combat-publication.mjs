import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';

const site=process.env.HI_STORY_SITE||'https://wangpingpang.github.io/hi-story/';
const evidence=process.env.HI_STORY_EVIDENCE_DIR||'docs/evidence/v060-combat-public';
mkdirSync(evidence,{recursive:true});
const server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {createAdventureApplication}=await server.ssrLoadModule('/src/application/index.ts');
const {canonical,seedHash}=await server.ssrLoadModule('/src/contracts/demo.ts');
const runtime=await server.ssrLoadModule('/src/modules/runtime/index.ts');
const envelope=payload=>JSON.stringify({format:'hi-story-save/1',payload,checksum:seedHash(canonical(payload)).toString(16)});
const same=(actual,expected,label)=>assert(canonical(actual)===canonical(expected),label);
// A validated fixture enters through the same import UI as a user save. It is
// separate from the checks that exercise real exploration and legacy recovery.
const app=createAdventureApplication();
await app.initialize({seed:'monster-effects-ui',professions:app.professionSetup('wizard')});
let s=JSON.parse(app.exportSave()).payload;
s.runtime.actors[s.playerActorId].position={...s.runtime.map.anchors.find(a=>a.id==='watch').position};
runtime.revealRuntime(s.runtime);
assert((await app.restore(envelope(s))).ok);
s=structuredClone(app.query().snapshot);
assert((await app.dispatch({commandId:crypto.randomUUID(),runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type:'monster.reveal',payload:{monsterId:'lizard'}})).ok);
s=structuredClone(app.query().snapshot);
const enemy=s.story.npcs.find(n=>n.monsterId==='lizard').profile.actorId,id=s.playerActorId;
for(let i=0;i<4;i++)s.runtime=runtime.advanceAdventureProfession(s.runtime,enemy,'wizard',i===1?'evoker':undefined,i===2?{con:2}:undefined);
s.runtime.encounter={id:'public-v060-battle',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:4,y:3},initiative:1}],rng:123,movement:4,action:true,guard:false,log:['魔物现身，等待你的行动。'],rewarded:false,obstacles:[]};
s.status='waiting-result';assert((await app.restore(envelope(s))).ok);
const battle=Buffer.from(app.exportSave());app.dispose();await server.close();
const legacyBytes=gunzipSync(readFileSync('tests/fixtures/v050-save.json.gz')),legacy=JSON.parse(legacyBytes).payload;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
const results=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:375,height:812}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],httpFailures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)httpFailures.push(`${r.status()} ${r.url()}`);});
  await page.clock.install();await page.clock.pauseAt(new Date());
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:world-v2')).payload);
  const painted=()=>expect.poll(async()=>{await page.clock.runFor(100);return page.locator('.world-canvas').getAttribute('data-character-status');}).toBe('ready');
  const zoom=expected=>expect.poll(async()=>{await page.clock.runFor(100);return page.locator('#adventure-map').evaluate(svg=>innerWidth/svg.viewBox.baseVal.width);}).toBeCloseTo(expected,3);
  const ready=()=>expect.poll(async()=>{await page.clock.runFor(100);return page.locator('.adventure-shell').getAttribute('aria-busy');}).toBe('false');
  const importSave=async(name,bytes)=>{await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-import').setInputFiles({name,mimeType:'application/json',buffer:bytes});};
  const dice=async()=>{await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('.dice-actor-panel').count();}).toBeGreaterThan(0);const skip=page.getByRole('button',{name:'跳过动画',exact:true});if(await skip.isVisible())await skip.click();await expect(page.getByRole('button',{name:'继续冒险',exact:true})).toBeVisible();};
  try{
   assert((await page.goto(site+'?view=demo',{waitUntil:'networkidle',timeout:60000})).ok());
   await expect(page.locator('.adventure-shell')).toHaveAttribute('data-version','0.6.0');await painted();await zoom(1.5);
   await page.getByRole('button',{name:'关闭浮层',exact:true}).click();
   await page.screenshot({path:`${evidence}/world-${viewport.width}.png`});
   await importSave('v050.json',legacyBytes);await expect.poll(async()=>(await read()).seed).toBe(legacy.seed);
   const migrated=await read();assert.equal(migrated.schemaVersion,5);same(migrated.runtime,legacy.runtime,'Legacy runtime changed during migration');same(migrated.story,legacy.story,'Legacy story changed during migration');assert.equal(migrated.things.equipment.owned.length,0);
   // Close the settings panel before using its button to reopen it for import.
   await page.locator('[data-panel="interaction"]').click();await importSave('battle.json',battle);
   await expect.poll(async()=>(await read()).runtime.encounter?.id).toBe('public-v060-battle');await page.locator('[data-panel="interaction"]').click();
   await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('[data-battle-actor] image').evaluateAll(els=>els.length===2&&els.every(e=>e.getAttribute('data-character-status')==='ready'));}).toBe(true);
   await zoom(1.5);await expect(page.locator(`[data-battle-actor="${enemy}"] image`)).toHaveAttribute('data-character-model','monster-2942');
   assert.deepEqual(await page.locator('[data-battle-actor] image').evaluateAll(els=>els.map(e=>getComputedStyle(e).filter)),['none','none']);
   const left=await page.locator('.battle-roster-ally').boundingBox(),right=await page.locator('.battle-roster-enemy').boundingBox();assert(left.x+left.width<viewport.width/2&&right.x>viewport.width/2);
   assert.equal(await page.locator(`[data-battle-actor="${enemy}"] .iso-name`).evaluate(e=>getComputedStyle(e).fill),'rgb(255, 155, 164)');
   await page.getByRole('button',{name:'放大地图',exact:true}).click();await zoom(1.7);await page.getByRole('button',{name:'缩小地图',exact:true}).click();await zoom(1.5);
   await page.locator('[data-battle-point="1,2"]').click();await expect.poll(async()=>(await read()).runtime.encounter.movement).toBe(3);await page.clock.runFor(75);
   await expect(page.locator(`[data-battle-actor="${id}"]`)).toHaveAttribute('data-running','true');await ready();
   await page.locator('#combat-skills-toggle').click();await page.locator('[data-select-profession-skill="wizard-fire"]').click();await page.locator('#profession-target').selectOption(enemy);await page.locator('[data-profession-skill="wizard-fire"]').click();
   await expect.poll(async()=>{await page.clock.runFor(30);return page.locator('[data-combat-effect="fire"]').count();}).toBe(1);await page.clock.runFor(300);
   await page.screenshot({path:`${evidence}/fire-${viewport.width}.png`});await dice();
   const committed=await read();assert.equal(committed.runtime.actors[id].profession.resources.wizard,3);await page.clock.runFor(20000);
   await expect(page.getByRole('button',{name:'继续冒险',exact:true})).toBeVisible();same(await read(),committed,'Dice presentation changed committed save');
   const pane=await page.locator(`[data-dice-actor="${id}"]`).boundingBox();assert(pane.x>=left.x+left.width&&pane.x+pane.width<=viewport.width);
   await page.screenshot({path:`${evidence}/dice-${viewport.width}.png`});await page.getByRole('button',{name:'继续冒险',exact:true}).click();await ready();
   await page.reload({waitUntil:'networkidle'});
   await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('[data-battle-actor] image').evaluateAll(els=>els.length===2&&els.every(e=>e.getAttribute('data-character-status')==='ready'));}).toBe(true);
   same((await read()).runtime,committed.runtime,'Refresh changed committed runtime');await expect(page.locator('.dice-feedback-host')).toHaveCount(0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(httpFailures,[]);
   results.push({viewport,checks:['v0.6.0 and default 1.5x','real v0.5.0 save recovery','validated monster fixture through import UI','left ally and red enemy','original sprite shadow only','manual zoom','running movement','fire spell and resource once','small ally dice held 20s until manual close','refresh does not replay or spend twice'],errors,httpFailures});
  }catch(error){await page.screenshot({path:`${evidence}/failure-${viewport.width}.png`,fullPage:true}).catch(()=>{});writeFileSync(`${evidence}/failure-${viewport.width}.json`,JSON.stringify({site,error:String(error),errors,httpFailures},null,2));throw error;}
  finally{await context.close();}
 }
 writeFileSync(`${evidence}/combat-public-validation.json`,JSON.stringify({status:'passed',checkedAt:new Date().toISOString(),site,results},null,2)+'\n');
 console.log('PASS: desktop/narrow public v0.6.0, old save, monster battle, zoom, running, fire, manual dice and refresh.');
}finally{await browser.close();}
