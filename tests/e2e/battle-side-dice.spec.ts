import {test,expect,type Page} from '@playwright/test';
import {createServer} from 'vite';
import {open,state} from './world-navigation';
import type {AdventureSnapshot} from '../../src/application';
let server:Awaited<ReturnType<typeof createServer>>,factory:typeof import('../../src/application'),contracts:typeof import('../../src/contracts/demo'),runtime:typeof import('../../src/modules/runtime');
const errors=new WeakMap<Page,string[]>();
test.beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});factory=await server.ssrLoadModule('/src/application/index.ts') as typeof factory;contracts=await server.ssrLoadModule('/src/contracts/demo.ts') as typeof contracts;runtime=await server.ssrLoadModule('/src/modules/runtime/index.ts') as typeof runtime;});
test.afterAll(async()=>{await server.close();});
test.beforeEach(async({page})=>{const found:string[]=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));page.setDefaultTimeout(15000);await page.clock.install();await page.clock.pauseAt(new Date());});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function painted(page:Page){await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('[data-battle-actor] image').evaluateAll(els=>els.every(e=>e.getAttribute('data-character-status')==='ready'));}).toBe(true);}
async function dice(page:Page){await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('.dice-actor-panel').count();}).toBeGreaterThan(0);}
async function summary(page:Page){await dice(page);const skip=page.getByRole('button',{name:'跳过动画',exact:true});if(await skip.isVisible())await skip.click();await expect(page.getByRole('button',{name:'继续冒险',exact:true})).toBeVisible();}
async function close(page:Page){await page.getByRole('button',{name:'继续冒险',exact:true}).click();await expect(page.locator('.dice-feedback-host')).toHaveCount(0);await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');}
async function fixture(page:Page,options:{classId?:string;normal?:boolean;hp?:number;natural?:number}={}){
 const app=factory.createAdventureApplication(),player=app.professionSetup(options.classId??'fighter').player;if(!options.classId)player.build.classes[0]={classId:'fighter',level:5,specializationId:'guardian'};
 const fighter={build:{version:'class-framework/1' as const,classes:[{classId:'fighter',level:5,specializationId:'guardian'}]}};
 await app.initialize({seed:'side-dice-ui',...(!options.normal?{professions:{player,actors:{'npc-0':fighter,'npc-1':fighter}}}:{})});
 const s=JSON.parse(app.exportSave()).payload as AdventureSnapshot,id=s.playerActorId,enemies=['npc-0','npc-1'].map(n=>Object.values(s.runtime.actors).find(a=>a.storyNpcId===n)!.actorId);
 let rng=123;if(options.natural)for(let i=0;i<200000;i++)if(runtime.nextDie(i,20).value===options.natural){rng=i;break;}
 if(options.hp)s.runtime.actors[enemies[0]].hp=options.hp;
 s.runtime.encounter={id:'side-dice-battle',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemies[0],position:{x:2,y:3},initiative:2},{actorId:enemies[1],position:{x:1,y:2},initiative:1}],rng,movement:4,action:true,guard:false,log:['战斗开始。'],rewarded:false,obstacles:[]};s.status='waiting-result';
 // A single target permits a real finishing blow, without adding a third faction.
 if(options.hp)s.runtime.encounter.participants.pop();
 const data=JSON.stringify({format:'hi-story-save/1',payload:s,checksum:contracts.seedHash(contracts.canonical(s)).toString(16)});
 await open(page,s.seed);await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-import').setInputFiles({name:'side-dice.json',mimeType:'application/json',buffer:Buffer.from(data)});await expect.poll(async()=>(await state(page)).runtime.encounter?.id).toBe(s.runtime.encounter.id);await page.locator('[data-panel="interaction"]').click();await painted(page);app.dispose();return {id,enemies};
}
async function anchored(page:Page,actorId:string,side:'ally'|'enemy'){
 const pane=page.locator(`[data-dice-actor="${actorId}"]`),panel=(await pane.boundingBox())!,roster=(await page.locator(`[data-roster-side="${side}"]`).boundingBox())!,viewport=page.viewportSize()!;
 await expect(pane).toHaveAttribute('data-side',side);expect(panel.width).toBeLessThan(viewport.width*.65);expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(viewport.width);expect(panel.y+panel.height).toBeLessThanOrEqual(viewport.height);
 if(side==='ally')expect(panel.x).toBeGreaterThanOrEqual(roster.x+roster.width);else expect(panel.x+panel.width).toBeLessThanOrEqual(roster.x);
}
test('队友在左敌人在右，敌方头像状态与战场名字明确标红',async({page},info)=>{
 const {id,enemies}=await fixture(page),before=await state(page),viewport=page.viewportSize()!,left=(await page.locator('.battle-roster-ally').boundingBox())!,right=(await page.locator('.battle-roster-enemy').boundingBox())!;
 expect(left.x+left.width).toBeLessThan(viewport.width/2);expect(right.x).toBeGreaterThan(viewport.width/2);await expect(page.locator('.battle-roster-ally [data-roster-actor]')).toHaveCount(1);await expect(page.locator('.battle-roster-enemy [data-roster-actor]')).toHaveCount(2);await expect(page.locator('.battle-roster-ally')).toContainText(before.runtime.actors[id].profile.name);
 for(const enemy of enemies){await expect(page.locator(`.battle-roster-enemy [data-roster-actor="${enemy}"]`)).toHaveAttribute('data-combat-side','enemy');expect(await page.locator(`[data-battle-actor="${enemy}"] .iso-name`).evaluate(e=>getComputedStyle(e).fill)).toBe('rgb(255, 155, 164)');expect(await page.locator(`[data-roster-actor="${enemy}"] .hp-bar i`).evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(240, 107, 117)');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await state(page)).toEqual(before);await painted(page);await page.screenshot({path:info.outputPath('side-rosters.png'),fullPage:true});
});
test('队友骰子紧邻队友栏右侧，场景没有遮罩，结果一直保留至手动关闭',async({page},info)=>{
 const {id,enemies}=await fixture(page);await page.locator(`[data-attack="${enemies[0]}"]`).click();await dice(page);await anchored(page,id,'ally');await expect(page.locator('.adventure-shell')).not.toHaveAttribute('inert','');await expect(page.locator('.dice-feedback-host')).not.toHaveAttribute('aria-modal','true');expect(await page.locator('.dice-feedback-host').evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');
 const committed=await state(page);await page.locator('#battle-log-toggle').click();await expect(page.locator('.battle-log-scroll')).toBeHidden();await page.locator('#battle-log-toggle').click();await page.clock.runFor(20000);await expect(page.getByRole('button',{name:'继续冒险',exact:true})).toBeVisible();await anchored(page,id,'ally');expect(await state(page)).toEqual(committed);await painted(page);await page.screenshot({path:info.outputPath('ally-dice.png'),fullPage:true});
 await page.locator('[data-dice-action="close"]').first().click();await expect(page.locator('.dice-feedback-host')).toHaveCount(0);await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');expect(await state(page)).toEqual(committed);
});
test('敌方攻击骰子位于敌人栏左侧，手动关闭不会再次结算',async({page},info)=>{
 const {enemies}=await fixture(page);await page.locator('[data-combat="end"]').click();await dice(page);const actor=await page.locator('.dice-actor-panel').first().getAttribute('data-dice-actor');expect(enemies).toContain(actor);await anchored(page,actor!,'enemy');await summary(page);const committed=await state(page);await page.clock.runFor(30000);for(const enemy of enemies)await anchored(page,enemy,'enemy');await painted(page);await page.screenshot({path:info.outputPath('enemy-dice.png'),fullPage:true});await close(page);expect(await state(page)).toEqual(committed);
});
test('玩家雷法的豁免由敌人掷骰，位置按实际掷骰者而非施法者',async({page})=>{
 const {enemies}=await fixture(page,{classId:'wizard',natural:20});await page.locator('#combat-skills-toggle').click();await page.locator('[data-select-profession-skill="wizard-lightning"]').click();await page.locator('#profession-target').selectOption(enemies[0]);await page.locator('[data-profession-skill="wizard-lightning"]').click();await dice(page);await anchored(page,enemies[0],'enemy');await expect(page.locator('.dice-card')).toHaveAttribute('data-kind','save');await summary(page);await expect(page.locator('.dice-outcome')).toContainText('检定成功');await close(page);
});
test('双方三名掷骰者的总览各自归栏，窄屏不重叠也不超出屏幕',async({page},info)=>{
 const {id,enemies}=await fixture(page,{normal:true});await page.locator('[data-combat="end"]').click();await summary(page);await expect(page.locator('.dice-actor-panel')).toHaveCount(3);await anchored(page,id,'ally');for(const enemy of enemies)await anchored(page,enemy,'enemy');
 const boxes=await page.locator('.dice-actor-panel').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y).toBe(true);}const committed=await state(page);await painted(page);await page.screenshot({path:info.outputPath('both-sides-summary.png'),fullPage:true});await close(page);expect(await state(page)).toEqual(committed);await page.getByRole('button',{name:'回看最近骰子结果',exact:true}).click();await expect(page.locator('.dice-actor-panel')).toHaveCount(3);await page.clock.runFor(30000);await expect(page.locator('.dice-actor-panel')).toHaveCount(3);await close(page);expect(await state(page)).toEqual(committed);
});
test('骰子动画中刷新恢复同一状态，不重播、不多扣行动或资源',async({page})=>{
 const {enemies}=await fixture(page);await page.locator(`[data-attack="${enemies[0]}"]`).click();await dice(page);const committed=await state(page);await page.reload();await painted(page);expect((await state(page)).runtime).toEqual(committed.runtime);await expect(page.locator('.dice-feedback-host')).toHaveCount(0);await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');
});
test('战斗结束仍保留双方状态供看骰子，手动关闭后离开战斗界面',async({page})=>{
 const {id,enemies}=await fixture(page,{classId:'wizard',natural:20,hp:1});await page.locator('#combat-skills-toggle').click();await page.locator('[data-select-profession-skill="wizard-fire"]').click();await page.locator('#profession-target').selectOption(enemies[0]);await page.locator('[data-profession-skill="wizard-fire"]').click();await summary(page);expect((await state(page)).runtime.encounter!.status).toBe('victory');await expect(page.locator('.battle-roster-enemy')).toContainText('倒下');await anchored(page,id,'ally');await page.clock.runFor(15000);await expect(page.locator('.battle-roster-enemy')).toBeVisible();await close(page);await expect(page.locator('.battle-roster')).toHaveCount(0);const committed=await state(page);await page.getByRole('button',{name:'回看最近骰子结果',exact:true}).click();await expect(page.locator('.battle-roster-enemy')).toBeVisible();await anchored(page,id,'ally');await close(page);expect(await state(page)).toEqual(committed);await expect(page.locator('.battle-roster')).toHaveCount(0);
});
