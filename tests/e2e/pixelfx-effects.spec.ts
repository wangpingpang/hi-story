import {test,expect,type Page,type Route,type Locator} from '@playwright/test';
import {createServer} from 'vite';
import {open,state} from './world-navigation';
import type {AdventureSnapshot} from '../../src/application';

let server:Awaited<ReturnType<typeof createServer>>;
let factory:typeof import('../../src/application');
let contracts:typeof import('../../src/contracts/demo');
let runtime:typeof import('../../src/modules/runtime');
const errors=new WeakMap<Page,string[]>();

test.beforeAll(async()=>{
 server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
 factory=await server.ssrLoadModule('/src/application/index.ts') as typeof factory;
 contracts=await server.ssrLoadModule('/src/contracts/demo.ts') as typeof contracts;
 runtime=await server.ssrLoadModule('/src/modules/runtime/index.ts') as typeof runtime;
});
test.afterAll(async()=>{await server.close();});
test.beforeEach(async({page})=>{
 const found:string[]=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));
 await page.clock.install();await page.clock.pauseAt(new Date());
});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));

// Use the public application/save importer to set up a valid battle. Actions under
// test are chosen and confirmed through the production UI, never a test dispatch hook.
async function fixture(page:Page,options:{classId?:string;roll?:number;wounded?:boolean}={}){
 const classId=options.classId??'wizard',app=factory.createAdventureApplication();
 await app.initialize({seed:'pixelfx-effects-ui',professions:{player:app.professionSetup(classId).player,actors:{'npc-0':{build:{version:'class-framework/1',classes:[{classId:'fighter',level:5,specializationId:'guardian'}]}}}}});
 const s=JSON.parse(app.exportSave()).payload as AdventureSnapshot,id=s.playerActorId;
 const enemy=Object.values(s.runtime.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;
 if(options.wounded)s.runtime.actors[id].hp-=3;
 let rng=0;while(runtime.nextDie(rng,20).value!==(options.roll??15))rng++;
 s.runtime.encounter={id:'pixelfx-effects-battle',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:3,y:3},initiative:1}],rng,movement:4,action:true,guard:false,log:[],rewarded:false,obstacles:[]};
 s.status='waiting-result';
 const payload=JSON.parse(JSON.stringify(s));
 const restored=await app.restore(JSON.stringify({format:'hi-story-save/1',payload,checksum:contracts.seedHash(contracts.canonical(payload)).toString(16)}));
 expect(restored.ok).toBe(true);
 await open(page,s.seed);await page.locator('[data-panel="settings"]').click();
 await page.locator('#adventure-import').setInputFiles({name:'pixelfx-battle.json',mimeType:'application/json',buffer:Buffer.from(app.exportSave())});
 await expect.poll(async()=>(await state(page)).runtime.encounter?.id).toBe('pixelfx-effects-battle');
 await page.locator('[data-panel="interaction"]').click();
 await expect.poll(async()=>{await page.clock.runFor(100);return page.locator(`[data-character="${id}"]`).getAttribute('data-character-status');}).toBe('ready');
 app.dispose();return {id,enemy};
}

async function selectSkill(page:Page,skill:string,target:string){
 await page.locator('#combat-skills-toggle').click();
 await page.locator(`[data-select-profession-skill="${skill}"]`).click();
 await page.locator('#profession-target').selectOption(target);
}
async function cast(page:Page,skill:string,target:string){
 await selectSkill(page,skill,target);
 await page.locator(`[data-profession-skill="${skill}"]`).click();
}
async function effectVisible(page:Page,kind:string){
 const effect=page.locator(`[data-combat-effect="${kind}"]`);
 await expect.poll(async()=>{await page.clock.runFor(20);return effect.count();}).toBe(1);
 await expect(effect).toHaveAttribute('data-effect-source','pixelfx');
 await expect(effect.locator('image')).toHaveAttribute('href',new RegExp(`/assets/effects/pixelfx/${kind}\\.webp$`));
 return effect;
}
// Startup now warms the effect cache. Reload through the real preparation screen
// with the fault already installed, then explicitly choose degraded entry.
async function coldFaultEntry(page:Page,requested:()=>number){
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-asset-loading]')).toBeVisible();
 await expect.poll(requested).toBeGreaterThan(0);
 await page.locator('#asset-load-continue').click();
 await expect(page.locator('.adventure-shell')).toBeVisible();
}
async function ready(page:Page){
 await expect.poll(async()=>{
  await page.clock.runFor(100);
  const close=page.getByRole('button',{name:'关闭本次骰子结果',exact:true}).first();
  if(await close.isVisible())await close.click();
  return page.locator('.adventure-shell').getAttribute('aria-busy');
 },{timeout:10000}).toBe('false');
 await expect(page.locator('[data-combat-effect]')).toHaveCount(0);
}
async function unchangedAfterRestore(page:Page,committed:AdventureSnapshot,degraded=false){
 await ready(page);expect(await state(page)).toEqual(committed);
 await page.reload({waitUntil:'domcontentloaded'});
 if(degraded)await page.locator('#asset-load-continue').click();
 await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');
 expect(restorableFacts(await state(page))).toEqual(restorableFacts(committed));
 await expect(page.locator('[data-combat-effect]')).toHaveCount(0);
 await expect(page.locator('.dice-feedback-host')).toHaveCount(0);
}
function restorableFacts(snapshot:AdventureSnapshot){
 // A restore starts a new command session and intentionally clears dedupe receipts.
 const {runId,receipts,...facts}=snapshot;return facts;
}
async function checkOneCast(page:Page,before:AdventureSnapshot,id:string,resource='wizard',cost=1){
 const after=await state(page);
 expect(after.revision).toBe(before.revision+1);
 expect(after.runtime.encounter!.action).toBe(false);
 expect(after.runtime.encounter!.rng).not.toBe(before.runtime.encounter!.rng);
 expect(after.runtime.actors[id].profession!.resources[resource]).toBe(before.runtime.actors[id].profession!.resources[resource]-cost);
 return after;
}
async function visibleFrame(effect:Locator){
 return effect.locator('image').evaluate(async node=>{
  const image=new Image();image.src=node.getAttribute('href')!;await image.decode();
  const rect=node.parentElement!.getAttribute('viewBox')!.split(' ').map(Number);
  const canvas=document.createElement('canvas');canvas.width=rect[2];canvas.height=rect[3];
  const context=canvas.getContext('2d')!;context.drawImage(image,rect[0],rect[1],rect[2],rect[3],0,0,rect[2],rect[3]);
  const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
  return {width:image.naturalWidth,height:image.naturalHeight,visible:rgba.some((v,i)=>i%4===3&&v>0)};
 });
}

test('玩家奥术使用可解码的 PixelFX 帧，选取不结算，播放与恢复只保留一次结果',async({page},info)=>{
 const {id,enemy}=await fixture(page),before=await state(page);
 await selectSkill(page,'wizard-3',enemy);
 expect(await state(page)).toEqual(before);await expect(page.locator('[data-combat-effect]')).toHaveCount(0);
 await page.locator('[data-profession-skill="wizard-3"]').click();
 const effect=await effectVisible(page,'arcane'),committed=await checkOneCast(page,before,id,'wizard',0);
 expect(committed.runtime.actors[enemy].hp).toBeLessThan(before.runtime.actors[enemy].hp);
 await expect(page.locator('[data-profession-skill="wizard-3"]')).toBeDisabled();
 await page.clock.runFor(200);
 const painted=await visibleFrame(effect);
 expect(painted.width).toBeGreaterThan(0);expect(painted.height).toBeGreaterThan(0);expect(painted.visible).toBe(true);
 await page.screenshot({path:info.outputPath('pixelfx-arcane.png'),fullPage:true});
 await unchangedAfterRestore(page,committed);
});

for(const [skill,kind,roll,outcome] of [['wizard-fire','fire',1,'miss'],['wizard-lightning','lightning',20,'saved']] as const){
 test(`PixelFX ${outcome}与权威结果一致，动画结束不追加伤害`,async({page},info)=>{
  const {id,enemy}=await fixture(page,{roll}),before=await state(page);
  await cast(page,skill,enemy);const effect=await effectVisible(page,kind),committed=await checkOneCast(page,before,id);
  await expect(effect).toHaveAttribute('data-effect-outcome',outcome);
  if(outcome==='miss'){
   expect(committed.runtime.actors[enemy].hp).toBe(before.runtime.actors[enemy].hp);
   const targetX=await page.locator(`[data-battle-actor="${enemy}"]`).evaluate(node=>(node as SVGGraphicsElement).getScreenCTM()!.e);
   const bounds=await effect.locator('svg').boundingBox();expect(bounds).not.toBeNull();
   expect(bounds!.x>targetX+20||bounds!.x+bounds!.width<targetX-20).toBe(true);
  }else{
   expect(committed.runtime.encounter!.rolls?.some(r=>r.kind==='save'&&r.actorId===enemy&&r.success)).toBe(true);
   expect(Number(await effect.locator('g').first().getAttribute('opacity'))).toBeLessThan(1);
  }
  await expect(effect.locator('ellipse')).toHaveAttribute('stroke-dasharray',/\S/);
  await page.clock.runFor(200);await page.screenshot({path:info.outputPath(`pixelfx-${outcome}.png`),fullPage:true});
  await unchangedAfterRestore(page,committed);
 });
}

test('减少动态的治疗使用非空预览帧且保持静止，中途刷新不重复治疗',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const {id}=await fixture(page,{classId:'cleric',wounded:true}),before=await state(page);
 const response=await page.request.get(new URL('./assets/effects/pixelfx/manifest.json',page.url()).href);
 expect(response.ok()).toBe(true);const manifest=await response.json();
 await cast(page,'cleric-mend',id);const effect=await effectVisible(page,'healing');
 await expect(effect).toHaveAttribute('data-effect-frame',String(manifest.effects.healing.previewFrame));
 const frame=await effect.getAttribute('data-effect-frame');
 // Allow the casting character atlas to decode in real time without exhausting
 // the 220 ms static-effect window; otherwise the evidence captures its placeholder.
 await expect.poll(async()=>{
  await page.clock.runFor(5);
  return page.locator(`[data-character="${id}"]`).getAttribute('data-character-status');
 },{intervals:[50,100,150],timeout:8000}).toBe('ready');
 await expect(effect).toHaveAttribute('data-effect-frame',frame!);
 expect((await visibleFrame(effect)).visible).toBe(true);
 const committed=await checkOneCast(page,before,id,'cleric');
 expect(committed.runtime.actors[id].hp).toBeGreaterThan(before.runtime.actors[id].hp);
 await page.screenshot({path:info.outputPath('pixelfx-healing-reduced.png'),fullPage:true});
 await page.reload();expect(restorableFacts(await state(page))).toEqual(restorableFacts(committed));
 await expect(page.locator('[data-combat-effect]')).toHaveCount(0);
 await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');
});

for(const fault of ['invalid-manifest','invalid-image','image-timeout'] as const){
 test(`PixelFX ${fault}不会阻塞骰子及后续操作，已提交状态可恢复`,async({page})=>{
  const {id,enemy}=await fixture(page);
  let requests=0,release:()=>void=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;});
  if(fault==='invalid-manifest')await page.route('**/assets/effects/pixelfx/manifest.json',route=>{requests++;return route.fulfill({contentType:'application/json',body:JSON.stringify({version:'broken',effects:{}})});});
  else await page.route('**/assets/effects/pixelfx/fire.webp',async route=>{
   requests++;if(fault==='image-timeout'){await held;await route.abort().catch(()=>{});}
   else await route.fulfill({contentType:'image/webp',body:'invalid image bytes'});
  });
  try{
   await coldFaultEntry(page,()=>requests);const before=await state(page),preloadRequests=requests;
   await cast(page,'wizard-fire',enemy);
   await expect.poll(async()=>(await state(page)).revision).toBe(before.revision+1);
   await expect.poll(()=>requests).toBeGreaterThan(preloadRequests);
   const committed=await checkOneCast(page,before,id);
   if(fault==='image-timeout')await page.clock.runFor(2600);
   await expect.poll(async()=>{await page.clock.runFor(100);return page.getByRole('button',{name:'关闭本次骰子结果',exact:true}).count();},{timeout:7000}).toBeGreaterThan(0);
   await expect(page.locator('[data-combat-effect]')).toHaveCount(0);
   await unchangedAfterRestore(page,committed,true);
  }finally{release();}
 });
}

for(const phase of ['loading','playing'] as const){
 test(`PixelFX ${phase}的隐藏事件取消路径可结束，迟到资源不重播`,async({page})=>{
  const {id,enemy}=await fixture(page);
  let heldRoute:Route|undefined,requests=0,release:()=>void=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;});
  if(phase==='loading')await page.route('**/assets/effects/pixelfx/fire.webp',async route=>{requests++;heldRoute=route;await held;await route.continue().catch(()=>{});});
  try{
   if(phase==='loading')await coldFaultEntry(page,()=>requests);
   const before=await state(page),preloadRequests=requests;
   await cast(page,'wizard-fire',enemy);
   if(phase==='loading'){await expect.poll(()=>requests).toBeGreaterThan(preloadRequests);expect(heldRoute).toBeDefined();}else await effectVisible(page,'fire');
   const committed=await checkOneCast(page,before,id);
   // Explicit event-path simulation, not evidence of a real OS background transition.
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
   await expect(page.locator('[data-combat-effect]')).toHaveCount(0);
   await page.evaluate(()=>{Reflect.deleteProperty(document,'hidden');document.dispatchEvent(new Event('visibilitychange'));});
   // Still held here: cancel must release the command before image IO completes.
   await ready(page);expect(await state(page)).toEqual(committed);
   release();await page.unrouteAll({behavior:'wait'});await page.clock.runFor(200);
   await unchangedAfterRestore(page,committed);
  }finally{release();}
 });
}
