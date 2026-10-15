import {test,expect,type Page} from '@playwright/test';
import {createServer} from 'vite';
import type {AdventureSnapshot} from '../../src/application';
import {state,open,walk,go,near} from './world-navigation';
// Full gameplay regression also covers reduced-motion accessibility. HD-2D specs retain animations.
test.use({reducedMotion:'reduce'});
test.setTimeout(240000);
test.beforeEach(async({page})=>{await page.clock.install();await page.clock.pauseAt(new Date());});
let server:Awaited<ReturnType<typeof createServer>>;
let factory:typeof import('../../src/application');
test.beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true},appType:'custom'});factory=await server.ssrLoadModule('/src/application/index.ts') as typeof import('../../src/application');});
test.afterAll(async()=>{await server.close();});
const errors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const found:string[]=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));page.on('console',e=>{if(e.type()==='error')found.push(e.text());});page.on('requestfailed',r=>found.push(r.url()));});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function panel(page:Page,id:string){await page.locator(`[data-panel="${id}"]`).click();}
async function choose(page:Page,template:string,choice:string,npcId?:string){await panel(page,'interaction');if(npcId)await page.locator(`[data-npc="${npcId}"]`).click();const s=await state(page),e=s.things.events.find(e=>e.templateId===template&&e.npcId===npcId&&e.status!=='settled')!;await page.locator(`[data-event="${e.id}"][data-choice="${choice}"]`).click();}
async function plotSeed(id:string){for(let i=0;i<30;i++){const app=factory.createAdventureApplication();await app.initialize({seed:`browser-world-v2-${i}`});const s=app.query().snapshot!;app.dispose();if(s.story.plotId===id)return s.seed;}throw Error('Plot seed missing');}
test('地图占据画面、像素人物落位、浮层和缩放无溢出',async({page},info)=>{
 await open(page,'scene-v010');const map=await page.locator('#adventure-map').boundingBox();expect(map!.width).toBe(info.project.use.viewport!.width);expect(map!.height).toBe(info.project.use.viewport!.height);await expect(page.locator('.world-canvas')).toBeVisible();await expect(page.locator('[role=dialog]')).toBeVisible();
 await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await walk(page,{x:6,y:9});await expect(page.locator('.position-label')).toContainText('坐标 6.00, 9.00');await near(page,'npc-0');await page.locator('[data-actor="npc-0"]').click();await expect(page.locator('.npc-dialogue')).toBeVisible();await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await page.getByRole('button',{name:'放大地图'}).click();await page.getByRole('button',{name:'回到人物'}).click();await panel(page,'inventory');await expect(page.getByRole('heading',{name:'行囊与交易'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`docs/evidence/${info.project.name}-world-v2-scene.png`});
});
test('社交检定、消耗草药与态度后果显示在同一场景',async({page},info)=>{
 const s=await open(page,'npc-v010');await near(page,'npc-0');await choose(page,'social-medicine','medicine','npc-0');const after=await state(page);expect(after.runtime.checks).toHaveLength(1);expect(after.things.inventory.herb).toBe(s.things.inventory.herb-1);await expect(page.locator('.dice-result')).toContainText('DC');await expect(page.locator('.world-canvas')).toBeVisible();await page.screenshot({path:`docs/evidence/${info.project.name}-world-v2-social.png`});
});
for(const plot of ['letter','seal','relic'])test(`实际探索完成 ${plot} 主线`,async({page},info)=>{
 await open(page,await plotSeed(plot));await choose(page,'notes','read');if(plot==='letter'){await go(page,'supply');await choose(page,'supply','gather');}if(plot==='seal'){await go(page,'shrine');await choose(page,'shrine','pray');}if(plot==='relic'){await go(page,'cache');await choose(page,'cache','patient');}await go(page,'watch');await choose(page,'watch','record');await go(page,'goal');await choose(page,'tower-door','complete');await expect(page.getByRole('status')).toContainText('你完成了目标');expect((await state(page)).status).toBe('ended');await page.screenshot({path:`docs/evidence/${info.project.name}-world-v2-${plot}-complete.png`});
});
test('连续事件追加NPC、任务，背包与通路状态可恢复',async({page})=>{
 await open(page,'echo-browser');await go(page,'gate');await choose(page,'gate','rope');expect((await state(page)).runtime.doors.shortcut.open).toBe(true);await go(page,'cache');await choose(page,'cache','patient');expect((await state(page)).story.npcs.some(n=>n.id==='echo')).toBe(true);await go(page,'shrine');await choose(page,'echo-riddle','gift');await go(page,'watch');await choose(page,'echo-warning','trust');const before=await state(page);await page.reload();await expect(page.locator('.adventure-shell')).toBeVisible();const after=await state(page);expect(after.adventureId).toBe(before.adventureId);expect(after.runId).not.toBe(before.runId);expect(after.things).toEqual(before.things);await panel(page,'quests');await expect(page.locator('.adventure-tasks')).toContainText('追寻遗迹回声');
});
test('战斗在地图场景中、行动资源与刷新恢复真实运行',async({page},info)=>{
 let seed='';for(let i=0;i<20;i++){const app=factory.createAdventureApplication();await app.initialize({seed:`multi-battle-${i}`});const s=app.query().snapshot!;app.dispose();if(Object.values(s.runtime.actors).find(a=>a.storyNpcId==='npc-2')?.archetype==='scholar'){seed=s.seed;break;}}await open(page,seed);await near(page,'npc-2');await panel(page,'interaction');await page.locator('[data-npc="npc-2"]').click();await page.locator('[data-fight="npc-2"]').click();await expect(page.getByRole('heading',{name:'战斗 · 第1回合'})).toBeVisible();await expect(page.locator('[data-battle-point]')).toHaveCount(63);const before=await state(page);await page.reload();await expect(page.getByRole('heading',{name:'战斗 · 第1回合'})).toBeVisible();expect((await state(page)).runtime.encounter).toEqual(before.runtime.encounter);expect(before.runtime.encounter!.participants).toHaveLength(3);await panel(page,'settings');await expect(page.getByRole('button',{name:'导出存档 JSON'})).toBeVisible();await panel(page,'interaction');await page.getByRole('button',{name:'结束回合',exact:true}).click();await expect(page.getByRole('heading',{name:'战斗 · 第2回合'})).toBeVisible();await page.screenshot({path:`docs/evidence/${info.project.name}-world-v2-battle.png`});
});
test('键盘和输入隔离，损坏存档导入保留有效状态',async({page})=>{
 await open(page,'keyboard-v010');await page.locator('#adventure-map').focus();await page.keyboard.down('ArrowDown');await page.clock.runFor(100);await page.keyboard.up('ArrowDown');await expect(page.locator('.position-label')).toContainText('坐标 6.00, 8.32');await panel(page,'settings');await page.getByLabel('旅程种子').focus();await page.keyboard.press('ArrowDown');await expect(page.locator('.position-label')).toContainText('坐标 6.00, 8.32');const before=await state(page);await page.locator('#adventure-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await expect(page.getByRole('status')).not.toHaveText('存档已导入。');expect((await state(page)).adventureId).toBe(before.adventureId);await page.getByLabel('旅程种子').fill('new-v010');await page.getByRole('button',{name:'生成新旅程',exact:true}).click();await expect(page.getByRole('status')).toHaveText('新旅程已生成。');
});
async function checkSeed(skill:string,dc:number,want:boolean,mode='normal'){
 const rules=await server.ssrLoadModule('/src/modules/runtime/index.ts') as typeof import('../../src/modules/runtime');
 for(let i=0;i<100;i++){const app=factory.createAdventureApplication();await app.initialize({seed:`check-browser-${i}`});const s=structuredClone(app.query().snapshot!) as AdventureSnapshot;app.dispose();if(rules.rollSkill(s.runtime,s.playerActorId,skill as any,dc,'probe',mode as any).result.success===want)return s.seed;}throw Error('Check seed not found');
}
test('承诺连续链与六类支线真实推进，交易和一次奖励',async({page})=>{
 test.setTimeout(600000);
 await open(page,await checkSeed('persuasion',12,true));await near(page,'npc-0');await choose(page,'social-persuade','persuade','npc-0');await go(page,'supply');await choose(page,'supply','gather');await go(page,'market');await panel(page,'quests');for(const id of ['explorer','supplies','herbalist','shortcut'])if(await page.locator(`[data-quest="${id}"]`).count())await page.locator(`[data-quest="${id}"]`).click();await choose(page,'camp-pact','honor');await choose(page,'herbalist','return');await panel(page,'inventory');await page.locator('[data-buy="potion"]').click();await page.locator('[data-sell="herb"]').click();await go(page,'gate');await choose(page,'gate','rope');await go(page,'shrine');await choose(page,'pact-reward','share');await go(page,'cache');await choose(page,'cache','patient');await go(page,'shrine');await choose(page,'echo-riddle','gift');await go(page,'watch');await choose(page,'echo-warning','trust');const s=await state(page);expect(s.things.tasks.filter(t=>t.status==='success')).toHaveLength(6);
});
test('检定失败开启补救事件，保持主线可行',async({page})=>{
 await open(page,await checkSeed('sleight',13,false));await go(page,'cache');await choose(page,'cache','unlock');await expect(page.locator('.dice-result')).toContainText('失败');await choose(page,'cache-recover','recover');expect((await state(page)).things.inventory.relic).toBe(1);
 await open(page,await checkSeed('arcana',12,false,'advantage'));await go(page,'shrine');await choose(page,'shrine','study');await choose(page,'shrine-recover','recover');expect((await state(page)).things.inventory.seal).toBe(1);
});
test('战斗胜利、战败与逃离都回传人物和目标',async({page})=>{
 for(const outcome of ['victory','defeat','fled']){
  await open(page,`battle-outcome-${outcome}`);await near(page,'npc-0');await panel(page,'interaction');await page.locator('[data-npc="npc-0"]').click();await page.locator('[data-fight="npc-0"]').click();
  for(let i=0;i<40&&(await state(page)).runtime.encounter?.status==='active';i++){
   if(outcome==='victory'){
    const attack=page.locator('[data-attack]').first();if(await attack.isEnabled())await attack.click();else if((await state(page)).runtime.encounter!.action){const live=await state(page),battle=live.runtime.encounter!,from=battle.participants[0].position,target=battle.participants[1].position;const dx=Math.sign(target.x-from.x),dy=Math.sign(target.y-from.y);await page.locator(`[data-battle-point="${from.x+dx},${from.y+(dx?0:dy)}"]`).click();if(await attack.isEnabled())await attack.click();}
   }else if(outcome==='fled'&&await page.locator('[data-combat="flee"]').isEnabled())await page.locator('[data-combat="flee"]').click();
   if((await state(page)).runtime.encounter?.status==='active')await page.locator('[data-combat="end"]').click();
  }
  const s=await state(page);expect(s.runtime.encounter?.status).toBe(outcome);if(outcome==='defeat')expect(s.status).toBe('ended');if(outcome==='victory')expect(s.story.npcs.find(n=>n.id==='npc-0')?.alive).toBe(false);
 }
});
