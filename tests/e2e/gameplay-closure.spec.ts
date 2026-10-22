import {test,expect,type Page} from './fixtures';
import {createServer} from 'vite';
import type {AdventureApplication} from '../../src/application';
import {open,state,go} from './world-navigation';

let server:Awaited<ReturnType<typeof createServer>>,factory:typeof import('../../src/application'),rules:typeof import('../../src/modules/runtime'),contracts:typeof import('../../src/contracts/demo');
let sequence=0;
const pageErrors=new WeakMap<Page,string[]>();
test.use({reducedMotion:'reduce'});
test.setTimeout(180000);
test.beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});factory=await server.ssrLoadModule('/src/application/index.ts') as typeof factory;rules=await server.ssrLoadModule('/src/modules/runtime/index.ts') as typeof rules;contracts=await server.ssrLoadModule('/src/contracts/demo.ts') as typeof contracts;});
test.afterAll(async()=>{await server.close();});
test.beforeEach(async({page})=>{const errors:string[]=[];pageErrors.set(page,errors);page.on('pageerror',error=>errors.push(error.message));await page.clock.install();await page.clock.pauseAt(new Date());});
test.afterEach(({page})=>expect(pageErrors.get(page)).toEqual([]));
async function act(app:AdventureApplication,type:string,payload:Record<string,unknown>){const s=app.query().snapshot!;expect(await app.dispatch({commandId:`closure-browser-${++sequence}`,runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type,payload})).toMatchObject({ok:true});}
async function prepareAt(app:AdventureApplication,id:string){const target=app.query().snapshot!.runtime.map.anchors.find(a=>a.id===id)!.position;for(const step of app.planRoute(target))await act(app,'world.move',{...step});}
async function prepareChoice(app:AdventureApplication,template:string,choiceId:string){const event=app.query().snapshot!.things.events.find(e=>e.templateId===template)!;await act(app,'event.choose',{eventId:event.id,choiceId});}
async function importPrepared(page:Page,app:AdventureApplication){await open(page,app.query().snapshot!.seed);await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-import').setInputFiles({name:'prepared.json',mimeType:'application/json',buffer:Buffer.from(app.exportSave())});await expect(page.locator('.adventure-status')).toHaveText('存档已导入。');await page.locator('[data-panel="interaction"]').click();}
async function capture(page:Page,path:string){await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('.world-canvas').getAttribute('data-art');}).toBe('ready');await page.clock.runFor(200);await page.screenshot({path});}
async function choose(page:Page,template:string,choice:string){await page.locator('[data-panel="interaction"]').click();const s=await state(page),event=s.things.events.find(e=>e.templateId===template)!;await page.locator(`[data-event="${event.id}"][data-choice="${choice}"]`).click();}

test('人物列表可自动靠近交谈，点击不会停留在不可用对话',async({page},info)=>{
 await open(page,'closure-nearby');const before=await state(page),npc=Object.values(before.runtime.actors).find(a=>a.storyNpcId==='npc-0')!;
 expect(Math.hypot(npc.position.x-before.runtime.actors[before.playerActorId].position.x,npc.position.y-before.runtime.actors[before.playerActorId].position.y)).toBeGreaterThan(1.12);
 await page.locator('[data-npc="npc-0"]').click();
 await expect.poll(async()=>{await page.clock.runFor(1000);const s=await state(page),p=s.runtime.actors[s.playerActorId].position;return Math.hypot(npc.position.x-p.x,npc.position.y-p.y);}).toBeLessThanOrEqual(1.12);
 await expect(page.locator('.npc-dialogue')).toBeVisible();await expect(page.locator('[data-choice="persuade"]')).toBeEnabled();await expect(page.locator('.adventure-status')).toContainText('身边');
 await capture(page,info.outputPath('nearby-conversation.png'));
});

test('缺材料行动显示原因，真实补货后可回到地点完成',async({page},info)=>{
 const app=factory.createAdventureApplication();await app.initialize({seed:'closure-materials'});await prepareAt(app,'market');await act(app,'inventory.sell',{itemId:'rope'});await prepareAt(app,'gate');
 await importPrepared(page,app);app.dispose();const before=await state(page),rope=page.locator('[data-choice="rope"]');
 await expect(rope).toBeVisible();await expect(rope).toBeDisabled();await expect(rope).toContainText('缺少攀登绳');expect((await state(page)).revision).toBe(before.revision);
 await capture(page,info.outputPath('missing-material-reason.png'));
 await go(page,'market');await page.locator('[data-panel="inventory"]').click();await page.locator('[data-buy="rope"]').click();expect((await state(page)).things.inventory.rope).toBe(1);
 await go(page,'gate');await expect(page.locator('[data-choice="rope"]')).toBeEnabled();await choose(page,'gate','rope');
 const after=await state(page);expect(after.things.inventory.rope).toBe(0);expect(after.runtime.doors.shortcut.open).toBe(true);
 await page.reload();expect((await state(page)).things).toEqual(after.things);expect((await state(page)).runtime.doors.shortcut.open).toBe(true);
});

test('任务不可逆分叉显示终态，错序接取保留原因，刷新不重领奖',async({page},info)=>{
 let app:AdventureApplication|undefined;
 for(let i=0;i<12;i++){const candidate=factory.createAdventureApplication();await candidate.initialize({seed:`closure-ui-quests-${i}`});if(!candidate.query().snapshot!.things.tasks.some(t=>t.blueprint.id==='herbalist')){app=candidate;break;}candidate.dispose();}
 expect(app).toBeDefined();await prepareAt(app!,'market');await importPrepared(page,app!);app!.dispose();
 await choose(page,'herbalist','keep');await page.locator('[data-panel="quests"]').click();await expect(page.locator('[data-quest="herbalist"]')).toBeDisabled();await expect(page.locator('.quest-offer').filter({has:page.locator('[data-quest="herbalist"]')})).toContainText('保留草药');
 const accepted=(await state(page)).things.tasks.some(t=>t.blueprint.id==='shortcut');if(!accepted)await page.locator('[data-quest="shortcut"]').click();
 await go(page,'gate');await choose(page,'gate','detour');await page.locator('[data-panel="quests"]').click();await expect(page.locator('[data-task="shortcut"]')).toContainText('失败');await expect(page.locator('[data-task="shortcut"]')).toContainText('绕行');
 const after=await state(page);await page.reload();await page.locator('[data-panel="quests"]').click();await expect(page.locator('[data-task="shortcut"]')).toContainText('绕行');expect((await state(page)).things).toEqual(after.things);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,info.outputPath('closed-quest-and-unavailable-offer.png'));
});

test('施法职业背包显示实际普通攻击，法术伤害无虚构属性加值',async({page},info)=>{
 await open(page,'closure-basic-spells');
 for(const classId of ['wizard','cleric']){
  await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-profession').selectOption(classId);await page.getByRole('button',{name:'生成新旅程',exact:true}).click();await expect(page.locator('.adventure-status')).toHaveText('新旅程已生成。');
  await page.locator('[data-panel="inventory"]').click();await expect(page.locator('[data-basic-attack]')).toContainText(classId==='wizard'?'奥术飞矢':'圣焰');await expect(page.locator('[data-equipment-damage]')).toHaveText('d8');
  await expect(page.locator('[data-equipment-attack]')).toHaveText(classId==='wizard'?'+5':'敏捷 DC 13');
  const before=await state(page);await page.reload();await page.locator('[data-panel="inventory"]').click();await expect(page.locator('[data-equipment-damage]')).toHaveText('d8');expect((await state(page)).runtime).toEqual(before.runtime);
 }
 await capture(page,info.outputPath('cleric-real-basic-attack.png'));
});

test('失败后的补救入口可执行，消耗和奖励刷新后只保留一次',async({page},info)=>{
 let app:AdventureApplication|undefined;
 for(let i=0;i<30;i++){const a=factory.createAdventureApplication();await a.initialize({seed:`closure-recover-ui-${i}`});const s=a.query().snapshot!,probe=rules.rollSkill(structuredClone(s.runtime) as Parameters<typeof rules.rollSkill>[0],s.playerActorId,'medicine',11,'probe-ui');if(!probe.result.success){app=a;break;}a.dispose();}
 expect(app).toBeDefined();await prepareAt(app!,'market');if(!app!.query().snapshot!.things.tasks.some(t=>t.blueprint.id==='herbalist'))await act(app!,'quest.accept',{questId:'herbalist'});await prepareChoice(app!,'herbalist','treat');await importPrepared(page,app!);app!.dispose();
 const before=await state(page);await expect(page.locator('[data-choice="recover"]')).toBeVisible();await choose(page,'herbalist-recover','recover');
 const after=await state(page);expect(after.things.inventory.herb).toBe(before.things.inventory.herb-1);expect(after.things.gold).toBe(before.things.gold+4);
 await page.locator('[data-panel="quests"]').click();await expect(page.locator('[data-task="herbalist"]')).toContainText('已完成');await page.reload();expect((await state(page)).things).toEqual(after.things);await expect(page.locator('[data-choice="recover"]')).toHaveCount(0);
 await page.locator('[data-panel="quests"]').click();await capture(page,info.outputPath('recovered-quest.png'));
});

test('临近截止时间的交付显示完整耗时限制，拒绝后不丢物品',async({page},info)=>{
 const app=factory.createAdventureApplication();await app.initialize({seed:'closure-deadline-ui'});await prepareChoice(app,'notes','read');const plot=app.query().snapshot!.story.plotId;
 const source=plot==='letter'?'supply':plot==='seal'?'shrine':'cache';await prepareAt(app,source);await prepareChoice(app,source,plot==='letter'?'gather':plot==='seal'?'pray':'patient');await prepareAt(app,'watch');await prepareChoice(app,'watch','record');await prepareAt(app,'goal');
 // Valid boundary fixture from a completed route; only elapsed time is set near the deadline.
 const envelope=JSON.parse(app.exportSave());envelope.payload.story.time=39.9;envelope.checksum=contracts.seedHash(contracts.canonical(envelope.payload)).toString(16);expect(await app.restore(JSON.stringify(envelope))).toMatchObject({ok:true});await importPrepared(page,app);app.dispose();
 const before=await state(page);await expect(page.locator('[data-choice="complete"]')).toBeVisible();await expect(page.locator('[data-choice="complete"]')).toBeDisabled();await expect(page.locator('[data-choice="complete"]')).toContainText('时间不足');
 await page.reload();expect((await state(page)).things).toEqual(before.things);expect((await state(page)).story.time).toBe(39.9);await capture(page,info.outputPath('deadline-reason.png'));
});
