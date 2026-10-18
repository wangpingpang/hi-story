import {test,expect,type Page} from '@playwright/test';
import {createServer} from 'vite';
import {open,state,near} from './world-navigation';
import type {AdventureSnapshot} from '../../src/application';

let server:Awaited<ReturnType<typeof createServer>>,factory:typeof import('../../src/application'),contracts:typeof import('../../src/contracts/demo');
const pageErrors=new WeakMap<Page,string[]>();
test.use({reducedMotion:'reduce'});
test.setTimeout(180000);
test.beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});factory=await server.ssrLoadModule('/src/application/index.ts') as typeof factory;contracts=await server.ssrLoadModule('/src/contracts/demo.ts') as typeof contracts;});
test.afterAll(async()=>{await server.close();});
test.beforeEach(async({page})=>{const errors:string[]=[];pageErrors.set(page,errors);page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.clock.install();await page.clock.pauseAt(new Date());});
test.afterEach(({page})=>expect(pageErrors.get(page)).toEqual([]));
async function ready(page:Page){
 await expect.poll(async()=>{const next=page.getByRole('button',{name:'继续冒险',exact:true});if(await next.isVisible())await next.click();await page.clock.runFor(25);return page.locator('.adventure-shell').getAttribute('aria-busy');},{timeout:15000}).toBe('false');
}
async function painted(page:Page){await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('.world-canvas').getAttribute('data-art');}).toBe('ready');await expect.poll(async()=>{await page.clock.runFor(100);return page.locator('[data-battle-actor] [data-character]').first().getAttribute('data-character-status');}).toBe('ready');}
async function importBattle(page:Page,classId:string,change?:(s:AdventureSnapshot)=>void){
 const app=factory.createAdventureApplication();await app.initialize({seed:'battle-picker-fixture',professions:app.professionSetup(classId)});
 const payload=JSON.parse(app.exportSave()).payload as AdventureSnapshot,id=payload.playerActorId,enemy=Object.values(payload.runtime.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;
 payload.status='waiting-result';payload.runtime.encounter={id:'picker-ui-battle',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:3,y:3},initiative:1}],rng:123,action:true,movement:4,guard:false,rewarded:false,log:[],obstacles:[]};change?.(payload);
 const data=JSON.stringify({format:'hi-story-save/1',payload,checksum:contracts.seedHash(contracts.canonical(payload)).toString(16)});
 await open(page,'battle-picker-fixture');await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-import').setInputFiles({name:'battle.json',mimeType:'application/json',buffer:Buffer.from(data)});
 await expect.poll(async()=>(await state(page)).runtime.encounter?.id).toBe('picker-ui-battle');await page.locator('[data-panel="interaction"]').click();await page.locator('#combat-skills-toggle').click();app.dispose();return {id,enemy};
}

test('选择元素法术与目标、确认施放、刷新恢复同一行动和资源',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const {id,enemy}=await importBattle(page,'wizard'),before=await state(page);
 for(const element of ['fire','frost','lightning','wind'])await expect(page.locator(`[data-select-profession-skill="wizard-${element}"]`)).toBeVisible();
 await page.locator('[data-select-profession-skill="wizard-fire"]').click();await expect(page.locator('#profession-target')).toHaveValue('');await expect(page.locator('[data-profession-skill="wizard-fire"]')).toBeDisabled();
 await expect(page.locator('#profession-target option').filter({hasText:before.runtime.actors[id].profile.name})).toBeDisabled();
 expect(await state(page)).toEqual(before);await painted(page);await page.locator(`[data-battle-actor="${enemy}"]`).click();await expect(page.locator('#profession-target')).toHaveValue(enemy);expect(await state(page)).toEqual(before);
 await page.locator(`[data-battle-actor="${enemy}"]`).focus();await page.keyboard.press('Enter');expect(await state(page)).toEqual(before);await expect(page.locator('[data-profession-skill="wizard-fire"]')).toBeEnabled();
 await page.locator('[data-profession-skill="wizard-fire"]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('elemental-skill-selection.png'),fullPage:true});
 await page.locator('[data-profession-skill="wizard-fire"]').click();await ready(page);
 const after=await state(page);expect(after.runtime.actors[id].profession!.resources.wizard).toBe(3);expect(after.runtime.encounter!.action).toBe(false);expect(after.revision).toBe(before.revision+1);
 await expect(page.locator('[data-profession-skill="wizard-fire"]')).toBeDisabled();await expect(page.locator('.skill-selection-status')).toContainText('主行动');
 await page.reload();await page.locator('#combat-skills-toggle').click();expect((await state(page)).runtime).toEqual(after.runtime);await expect(page.locator('[data-profession-skill]')).toBeDisabled();expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('治疗目标排除敌人，资源不足和障碍原因可见，选择不结算',async({page})=>{
 const {id,enemy}=await importBattle(page,'cleric',s=>{s.runtime.actors[s.playerActorId].hp-=3;});
 await page.locator('[data-select-profession-skill="cleric-mend"]').click();await expect(page.locator('#profession-target')).toHaveValue('');await page.locator('#profession-target').selectOption(id);
 await expect(page.locator(`#profession-target option[value="${enemy}"]`)).toBeDisabled();await page.locator('[data-profession-skill="cleric-mend"]').click();await ready(page);
 const healed=await state(page);expect(healed.runtime.actors[id].hp).toBeGreaterThan(healed.runtime.actors[id].maxHp-3);expect(healed.runtime.actors[id].profession!.resources.cleric).toBe(3);
 await importBattle(page,'wizard',s=>{s.runtime.actors[s.playerActorId].profession!.resources.wizard=0;s.runtime.encounter!.obstacles=[{x:2,y:3}];});
 const before=await state(page);await page.locator('[data-select-profession-skill="wizard-fire"]').click();await expect(page.locator('.skill-selection-status')).toContainText('资源不足');await expect(page.locator('[data-profession-skill]')).toBeDisabled();
 await page.locator('[data-select-profession-skill="wizard-3"]').click();await expect(page.locator('#profession-target')).toHaveValue('');await expect(page.locator('#profession-target')).toContainText('视线被障碍阻挡');await expect(page.locator('[data-profession-skill]')).toBeDisabled();expect(await state(page)).toEqual(before);
});

test('从职业选择经真实行走发起战斗，技能入口在收起和关闭面板后可用',async({page},info)=>{
 await open(page,'combat-picker-live');await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-profession').selectOption('wizard');await page.getByRole('button',{name:'生成新旅程',exact:true}).click();await ready(page);
 await near(page,'npc-0');await page.locator('[data-panel="interaction"]').click();await page.locator('button[data-npc="npc-0"]').click();await page.locator('[data-fight="npc-0"]').click();await ready(page);
 expect((await state(page)).runtime.encounter!.status).toBe('active');await page.locator('#combat-skills-toggle').click();await expect(page.locator('[data-select-profession-skill="wizard-fire"]')).toBeVisible();
 await page.locator('#battle-panel-toggle').click();await expect(page.locator('.adventure-panel .panel-body')).toBeHidden();await page.locator('#battle-panel-toggle').click();await expect(page.locator('[data-select-profession-skill="wizard-fire"]')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('[data-select-profession-skill="wizard-fire"]')).toBeVisible();await painted(page);await page.screenshot({path:info.outputPath('live-battle-skills.png'),fullPage:true});
});

test('旧四模板提供明确职业入口，打开选择不会改造当前存档',async({page})=>{
 await open(page,'combat-picker-legacy');await near(page,'npc-0');await page.locator('[data-panel="interaction"]').click();await page.locator('button[data-npc="npc-0"]').click();await page.locator('[data-fight="npc-0"]').click();await ready(page);
 const before=await state(page);await page.locator('#combat-skills-toggle').click();await expect(page.locator('#combat-skill-slot')).toContainText('四模板兼容模式');await page.locator('#skill-profession-settings').click();await expect(page.locator('#adventure-profession')).toBeVisible();expect(await state(page)).toEqual(before);
});
