import {test,expect,type Page} from '@playwright/test';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {SAVE_KEY,state} from './world-navigation';
import type {AdventureSnapshot} from '../../src/application';

const WORLD='**/assets/world/nature-v1.webp';
const gate=(page:Page)=>page.locator('[data-asset-loading]');
const failures=new WeakMap<Page,string[]>();
let server:Awaited<ReturnType<typeof createServer>>;
let factory:typeof import('../../src/application');
let contracts:typeof import('../../src/contracts/demo');
let runtime:typeof import('../../src/modules/runtime');

test.beforeAll(async()=>{
 server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
 factory=await server.ssrLoadModule('/src/application/index.ts') as typeof factory;
 contracts=await server.ssrLoadModule('/src/contracts/demo.ts') as typeof contracts;
 runtime=await server.ssrLoadModule('/src/modules/runtime/index.ts') as typeof runtime;
});
test.afterAll(async()=>{await server.close();});
test.beforeEach(({page})=>{const errors:string[]=[];failures.set(page,errors);page.on('pageerror',error=>errors.push(error.message));});
test.afterEach(({page})=>expect(failures.get(page)).toEqual([]));

async function enter(page:Page){
 await expect(page.locator('.adventure-shell')).toBeVisible({timeout:25000});
 await expect(gate(page)).toHaveCount(0);
 await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');
}
async function painted(page:Page){
 await expect(page.locator('.world-canvas')).toHaveAttribute('data-art','ready');
 await expect(page.locator('[data-actor-portrait]').first()).toHaveAttribute('data-character-status','ready');
}
function facts(snapshot:AdventureSnapshot){const {runId,receipts,...saved}=snapshot;return saved;}
async function progress(page:Page){return page.locator('#asset-load-progress').evaluate(node=>({value:(node as HTMLProgressElement).value,max:(node as HTMLProgressElement).max,determinate:node.hasAttribute('value')}));}

test('冷启动等待真实素材，进度未完成不能行动，释放后首屏和行走无需再下载玩家动作',async({page},info)=>{
 let requested=false,release=()=>{};
 const held=new Promise<void>(resolve=>{release=resolve;});
 const atlasRequests:string[]=[];page.on('request',request=>{if(/\/role-1024\/.*\.webp$/.test(new URL(request.url()).pathname))atlasRequests.push(request.url());});
 await page.route(WORLD,async route=>{requested=true;await held;await route.continue().catch(()=>{});});
 try{
  await page.goto('./?view=demo&seed=preload-cold',{waitUntil:'domcontentloaded'});
  await expect(gate(page)).toHaveAttribute('data-load-state','loading');
  await expect.poll(()=>requested).toBe(true);
  await expect.poll(async()=>(await progress(page)).determinate).toBe(true);
  const before=await state(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.adventure-shell')).toHaveCount(0);
  expect(await state(page)).toEqual(before);
  const p=await progress(page);expect(p.value).toBeLessThan(p.max);
  await expect(page.locator('[data-loading-count]')).toBeVisible();
  await page.screenshot({path:info.outputPath('preload-progress.png'),fullPage:true});
  release();await enter(page);await painted(page);
  expect(await state(page)).toEqual(before);
  const initial=[...atlasRequests];
  const model=JSON.parse(readFileSync('public/assets/characters/molibaike/role-1024/manifest.json','utf8'));
  for(const action of [0,1,3,5,6,8,9,10,16])expect(initial.some(url=>url.endsWith(model.clips[`${action}:5`].atlasUrl))).toBe(true);
  await page.locator('#adventure-map').focus();await page.keyboard.down('d');
  await expect.poll(async()=>(await state(page)).revision).toBeGreaterThan(before.revision);
  await page.keyboard.up('d');
  expect(atlasRequests).toEqual(initial);
  await page.screenshot({path:info.outputPath('preload-ready.png'),fullPage:true});
 }finally{release();await page.keyboard.up('d');}
});

test('下载失败可重试，进度不会虚报完成，重试沿用原存档而不重新生成',async({page})=>{
 let attempts=0,fail=true;
 await page.route(WORLD,route=>{attempts++;return fail?route.abort():route.continue();});
 await page.goto('./?view=demo&seed=preload-retry',{waitUntil:'domcontentloaded'});
 await expect(gate(page)).toHaveAttribute('data-load-state','failed',{timeout:25000});
 const before=await state(page),p=await progress(page);expect(p.value).toBeLessThan(p.max);
 await expect(page.locator('.adventure-shell')).toHaveCount(0);
 fail=false;await page.locator('#asset-load-retry').click();await enter(page);await painted(page);
 expect(attempts).toBeGreaterThanOrEqual(2);expect(await state(page)).toEqual(before);
});

test('素材缺失时明确选择先进入游戏，仍能操作保存和恢复同一进度',async({page})=>{
 await page.route('**/assets/characters/molibaike/role-1024/manifest.json',route=>route.abort());
 await page.goto('./?view=demo&seed=preload-continue',{waitUntil:'domcontentloaded'});
 await expect(gate(page)).toHaveAttribute('data-load-state','failed',{timeout:25000});
 const before=await state(page);
 await page.locator('#asset-load-continue').click();await enter(page);
 await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-save').click();
 expect(await state(page)).toEqual(before);
 await page.unrouteAll();await page.reload({waitUntil:'domcontentloaded'});await enter(page);await painted(page);
 expect(facts(await state(page))).toEqual(facts(before));
});

test('停滞资源会超时，重试不依赖迟到请求，旧请求不能覆盖新加载结果',async({page})=>{
 await page.clock.install();await page.clock.pauseAt(new Date());
 let requests=0,release=()=>{};
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route(WORLD,async route=>{requests++;if(requests===1)await held;await route.continue().catch(()=>{});});
 try{
  await page.goto('./?view=demo&seed=preload-timeout',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>requests).toBe(1);
  const before=await state(page);
  await page.clock.runFor(31000);
  await expect(gate(page)).toHaveAttribute('data-load-state','failed');
  await page.locator('#asset-load-retry').click();await enter(page);await painted(page);
  expect(requests).toBeGreaterThanOrEqual(2);expect(await state(page)).toEqual(before);
  release();await page.unrouteAll({behavior:'wait'});await page.clock.runFor(100);
  await expect(gate(page)).toHaveCount(0);expect(await state(page)).toEqual(before);
 }finally{release();}
});

test('同种子重开复用本页已准备素材，世界图集不重复下载且首屏仍完整',async({page})=>{
 const worlds:string[]=[];page.on('request',request=>{if(/\/assets\/world\/.*\.webp$/.test(new URL(request.url()).pathname))worlds.push(request.url());});
 await page.goto('./?view=demo&seed=preload-restart',{waitUntil:'domcontentloaded'});await enter(page);await painted(page);
 const before=await state(page),initial=[...worlds];expect(initial.length).toBeGreaterThan(0);expect(new Set(initial).size).toBe(initial.length);
 await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-restart').click();
 await expect.poll(async()=>(await state(page)).runId).not.toBe(before.runId);
 await enter(page);await painted(page);
 expect(worlds).toEqual(initial);expect((await state(page)).seed).toBe(before.seed);
});

test('恢复战斗先准备人物和特效，实际施法无需再请求火图集且只结算一次',async({page},info)=>{
 const app=factory.createAdventureApplication();
 await app.initialize({seed:'preload-battle',professions:{player:app.professionSetup('wizard').player,actors:{'npc-0':{build:{version:'class-framework/1',classes:[{classId:'fighter',level:5,specializationId:'guardian'}]}}}}});
 const s=JSON.parse(app.exportSave()).payload as AdventureSnapshot,id=s.playerActorId,enemy=Object.values(s.runtime.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;
 let rng=0;while(runtime.nextDie(rng,20).value!==15)rng++;
 s.runtime.encounter={id:'preload-battle',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:3,y:3},initiative:1}],rng,movement:4,action:true,guard:false,log:[],rewarded:false,obstacles:[]};s.status='waiting-result';
 expect((await app.restore(JSON.stringify({format:'hi-story-save/1',payload:s,checksum:contracts.seedHash(contracts.canonical(s)).toString(16)}))).ok).toBe(true);
 const save=app.exportSave();app.dispose();
 await page.addInitScript(({key,save})=>{if(!sessionStorage.getItem('preload-fixture-set')){localStorage.setItem(key,save);sessionStorage.setItem('preload-fixture-set','yes');}},{key:SAVE_KEY,save});
 const effects:string[]=[];page.on('request',request=>{if(/\/effects\/pixelfx\/.*\.webp$/.test(new URL(request.url()).pathname))effects.push(request.url());});
 await page.clock.install();await page.clock.pauseAt(new Date());
 await page.goto('./?view=demo',{waitUntil:'domcontentloaded'});await enter(page);await painted(page);
 await expect(page.locator(`[data-character="${id}"]`)).toHaveAttribute('data-character-status','ready');
 await expect(page.locator(`[data-character="${enemy}"]`)).toHaveAttribute('data-character-status','ready');
 expect(new Set(effects).size).toBe(6);const warm=[...effects],before=await state(page);
 expect(facts(before)).toEqual(facts(s));
 await page.locator('#combat-skills-toggle').click();await page.locator('[data-select-profession-skill="wizard-fire"]').click();await page.locator('#profession-target').selectOption(enemy);await page.locator('[data-profession-skill="wizard-fire"]').click();
 await expect.poll(async()=>{await page.clock.runFor(20);return page.locator('[data-combat-effect="fire"]').count();}).toBe(1);
 const committed=await state(page);expect(committed.revision).toBe(before.revision+1);expect(committed.runtime.actors[id].profession!.resources.wizard).toBe(before.runtime.actors[id].profession!.resources.wizard-1);expect(committed.runtime.actors[enemy].hp).toBeLessThan(before.runtime.actors[enemy].hp);expect(effects).toEqual(warm);
 await page.clock.runFor(200);await page.screenshot({path:info.outputPath('preload-battle.png'),fullPage:true});
 await page.reload({waitUntil:'domcontentloaded'});await enter(page);await painted(page);
 expect(facts(await state(page))).toEqual(facts(committed));await expect(page.locator('[data-combat-effect]')).toHaveCount(0);await expect(page.locator('.dice-feedback-host')).toHaveCount(0);
});
