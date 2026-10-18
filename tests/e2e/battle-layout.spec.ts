import {test,expect,type Page} from '@playwright/test';
import {createServer} from 'vite';
import {open,state} from './world-navigation';
import type {AdventureSnapshot} from '../../src/application';

let server:Awaited<ReturnType<typeof createServer>>,factory:typeof import('../../src/application'),contracts:typeof import('../../src/contracts/demo');
const errors=new WeakMap<Page,string[]>();
test.beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});factory=await server.ssrLoadModule('/src/application/index.ts') as typeof factory;contracts=await server.ssrLoadModule('/src/contracts/demo.ts') as typeof contracts;});
test.afterAll(async()=>{await server.close();});
test.beforeEach(async({page})=>{const found:string[]=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));page.setDefaultTimeout(15000);await page.clock.install();await page.clock.pauseAt(new Date());});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function ready(page:Page){await expect.poll(async()=>{await page.clock.runFor(100);const skip=page.getByRole('button',{name:'跳过动画',exact:true});if(await skip.isVisible())await skip.click();const next=page.getByRole('button',{name:'继续冒险',exact:true});if(await next.isVisible())await next.click();return page.locator('.adventure-shell').getAttribute('aria-busy');},{timeout:15000}).toBe('false');}
async function painted(page:Page){await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('[data-battle-actor] [data-character]').first().getAttribute('data-character-status');}).toBe('ready');}
async function fixture(page:Page,classId='fighter',obstacle=true){
 const app=factory.createAdventureApplication(),player=app.professionSetup(classId).player;
 if(classId==='fighter')player.build.classes[0]={classId:'fighter',level:5,specializationId:'guardian'};
 await app.initialize({seed:'battle-layout-ui',professions:{player,actors:{'npc-0':app.professionSetup('fighter').player}}});
 const s=JSON.parse(app.exportSave()).payload as AdventureSnapshot,id=s.playerActorId,enemy=Object.values(s.runtime.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;
 s.status='waiting-result';s.runtime.encounter={id:'running-ui-battle',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:6,y:3},initiative:1}],rng:123,movement:4,action:true,guard:false,log:['战斗开始，等待你的行动。'],rewarded:false,obstacles:obstacle?[{x:2,y:3}]:[]};
 const data=JSON.stringify({format:'hi-story-save/1',payload:s,checksum:contracts.seedHash(contracts.canonical(s)).toString(16)});
 await open(page,s.seed);await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-import').setInputFiles({name:'battle-layout.json',mimeType:'application/json',buffer:Buffer.from(data)});await expect.poll(async()=>(await state(page)).runtime.encounter?.id).toBe(s.runtime.encounter.id);await page.locator('[data-panel="interaction"]').click();await painted(page);app.dispose();return {id,enemy};
}
async function displayed(page:Page,id:string){return page.locator(`[data-battle-actor="${id}"]`).evaluate(el=>({x:Number((el as SVGElement).dataset.displayX),y:Number((el as SVGElement).dataset.displayY),running:(el as SVGElement).dataset.running}));}
async function centered(page:Page,id:string){const p=await page.locator(`[data-battle-actor="${id}"] ellipse`).evaluate(el=>{const p=new DOMPoint(0,-38).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y,cx:innerWidth/2,cy:innerHeight/2};});expect(Math.abs(p.x-p.cx)).toBeLessThan(.2);expect(Math.abs(p.y-p.cy)).toBeLessThan(.2);}

test('成员头像在左、行动在下、日志在左下，操作和日志可独立收起',async({page},info)=>{
 await fixture(page);const roster=(await page.locator('.battle-roster-ally').boundingBox())!,actions=(await page.locator('.battle-action-panel').boundingBox())!,logs=(await page.locator('.battle-journal').boundingBox())!,viewport=page.viewportSize()!;
 expect(roster.x).toBeLessThan(30);expect(roster.x+roster.width).toBeLessThan(viewport.width/2);expect(actions.y).toBeGreaterThan(viewport.height/2);expect(logs.x).toBeLessThan(30);expect(logs.y).toBeGreaterThan(roster.y+roster.height);await expect(page.locator('[data-roster-actor]')).toHaveCount(2);
 const before=await state(page);await page.locator('#battle-log-toggle').click();await expect(page.locator('.battle-log-scroll')).toBeHidden();await page.locator('#battle-log-toggle').click();await expect(page.locator('.battle-log-scroll')).toBeVisible();await page.locator('#battle-panel-toggle').click();await expect(page.locator('.battle-action-panel .panel-body')).toBeHidden();await page.locator('#battle-panel-toggle').click();expect(await state(page)).toEqual(before);
 for(const member of await page.locator('[data-roster-actor]').all())expect((await member.boundingBox())!.width).toBeGreaterThan(roster.width*.65);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await painted(page);await page.screenshot({path:info.outputPath('battle-layout.png'),fullPage:true});
});
test('玩家沿实际绕障路线跑步，镜头和脚下标记同步，移动只提交一次',async({page},info)=>{
 const {id}=await fixture(page),before=await state(page);await page.locator('[data-battle-point="3,3"]').click();await expect.poll(async()=>(await state(page)).runtime.encounter!.movement).toBe(0);
 const committed=await state(page);expect(committed.revision).toBe(before.revision+1);expect(committed.runtime.encounter!.participants[0].position).toEqual({x:3,y:3});expect(committed.runtime.encounter!.rng).toBe(before.runtime.encounter!.rng);expect(committed.runtime.actors[id].position).toEqual(before.runtime.actors[id].position);
 await page.clock.runFor(75);const mid=await displayed(page,id);expect(mid.running).toBe('true');expect(mid.x).toBe(1);expect(mid.y).toBeGreaterThan(2);expect(mid.y).toBeLessThan(3);await expect(page.locator(`[data-battle-actor="${id}"] image`)).toHaveAttribute('data-source-action','3');await expect(page.locator('[data-combat="end"]')).toBeDisabled();await centered(page,id);
 await page.screenshot({path:info.outputPath('battle-running.png'),fullPage:true});await page.locator('#adventure-map').focus();await page.keyboard.press('Enter');expect((await state(page)).revision).toBe(committed.revision);
 await page.clock.runFor(1100);await ready(page);expect(await displayed(page,id)).toMatchObject({x:3,y:3,running:'false'});await centered(page,id);await expect(page.locator('.battle-journal')).toContainText('移动4格');
 await page.reload();await painted(page);expect((await state(page)).runtime).toEqual(committed.runtime);expect(await displayed(page,id)).toMatchObject({x:3,y:3,running:'false'});await centered(page,id);
});
test('敌方结束回合时跑步接近，日志更新后仍可使用战技',async({page})=>{
 const {id,enemy}=await fixture(page,'fighter',false),before=await state(page);await page.locator('[data-combat="end"]').click();await expect.poll(async()=>(await state(page)).revision).toBe(before.revision+1);const committed=await state(page),end=committed.runtime.encounter!.participants.find(p=>p.actorId===enemy)!.position;
 await page.clock.runFor(75);const mid=await displayed(page,enemy);expect(mid.running).toBe('true');expect(mid.x).toBeGreaterThan(end.x);expect(mid.x).toBeLessThan(6);await expect(page.locator(`[data-battle-actor="${enemy}"] image`)).toHaveAttribute('data-motion','run');
 await page.clock.runFor(2000);await ready(page);await expect(page.locator('.battle-journal')).toContainText('移动4格');await page.locator('#combat-skills-toggle').click();await page.locator('[data-select-profession-skill="fighter-weapon-strike"]').click();await page.locator('#profession-target').selectOption(enemy);await expect(page.locator('[data-profession-skill="fighter-weapon-strike"]')).toBeEnabled();expect((await state(page)).runtime.actors[id].hp).toBeGreaterThan(0);
});
test('下方元素法术施放同步左侧资源和日志，刷新不再次扣除',async({page},info)=>{
 const {id,enemy}=await fixture(page,'wizard',false),before=await state(page);await page.locator('#combat-skills-toggle').click();await page.locator('[data-select-profession-skill="wizard-fire"]').click();await expect(page.locator('[data-profession-skill="wizard-fire"]')).toBeDisabled();await page.locator('#profession-target').selectOption(enemy);await page.locator('[data-profession-skill="wizard-fire"]').click();await ready(page);
 const after=await state(page);expect(after.runtime.actors[id].profession!.resources.wizard).toBe(3);expect(after.revision).toBe(before.revision+1);await expect(page.locator(`[data-roster-actor="${id}"]`)).toContainText('奥能 3');await expect(page.locator('.battle-journal')).toContainText('火焰弹');await page.screenshot({path:info.outputPath('battle-skill-log.png'),fullPage:true});
 await page.reload();await painted(page);expect((await state(page)).runtime).toEqual(after.runtime);await expect(page.locator(`[data-roster-actor="${id}"]`)).toContainText('奥能 3');
});
test('跑步中刷新直接恢复已提交终点，不重播或额外消耗',async({page})=>{
 const {id}=await fixture(page);await page.locator('[data-battle-point="3,3"]').click();await expect.poll(async()=>(await state(page)).runtime.encounter!.movement).toBe(0);const committed=await state(page);await page.clock.runFor(75);expect((await displayed(page,id)).running).toBe('true');await page.reload();await painted(page);await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');expect((await state(page)).runtime).toEqual(committed.runtime);expect(await displayed(page,id)).toMatchObject({x:3,y:3,running:'false'});
});
