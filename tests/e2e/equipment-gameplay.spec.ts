import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {open,state,go,near} from './world-navigation';

test.use({reducedMotion:'reduce'});
test.setTimeout(180000);
test.beforeEach(async({page})=>{await page.clock.install();await page.clock.pauseAt(new Date());});
async function ready(page:Page){
 await expect.poll(async()=>{
  const next=page.getByRole('button',{name:'继续冒险',exact:true});if(await next.isVisible())await next.click();
  await page.clock.runFor(25);return page.locator('.adventure-shell').getAttribute('aria-busy');
 },{timeout:15000}).toBe('false');
}
async function inventory(page:Page){await page.locator('[data-panel="inventory"]').click();await expect(page.getByRole('heading',{name:'当前装备',exact:true})).toBeVisible();}
async function painted(page:Page){await expect.poll(async()=>{await page.clock.runFor(50);return page.locator('.world-canvas').getAttribute('data-character-status');}).toBe('ready');}
async function buy(page:Page,id:string){await page.locator(`[data-equipment-buy="${id}"]`).click();await ready(page);}
async function equip(page:Page,id:string){await page.locator(`[data-equipment-equip="${id}"]`).click();await ready(page);}
async function unequip(page:Page,slot:string){await page.locator(`[data-equipment-unequip="${slot}"]`).click();await ready(page);}
async function fightToEnd(page:Page){
 for(let step=0;step<40;step++){
  const s=await state(page),b=s.runtime.encounter!;if(b.status!=='active')return;
  const toggle=page.locator('#battle-panel-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  const actor=s.runtime.actors[s.playerActorId];expect(actor.hp).toBeGreaterThan(0);
  if(b.action&&actor.hp<=9&&s.things.inventory.potion>0){await page.locator('[data-use="potion"]').click();await ready(page);continue;}
  const attack=page.locator('[data-attack]:enabled').first();if(b.action&&await attack.count()){await attack.click();await ready(page);continue;}
  if(b.action&&b.movement>0){
   const enemies=b.participants.slice(1).filter(p=>s.runtime.actors[p.actorId].hp>0),current=b.participants[0].position;
   const distance=(p:{x:number;y:number})=>Math.min(...enemies.map(e=>Math.abs(e.position.x-p.x)+Math.abs(e.position.y-p.y)));
   const moves=await page.locator('[data-battle-point]').evaluateAll(elements=>elements.filter(e=>e.getAttribute('aria-label')?.includes('移动消耗')).map(e=>{const [x,y]=e.getAttribute('data-battle-point')!.split(',').map(Number);return {x,y};}));
   const closest=moves.sort((a,b)=>distance(a)-distance(b))[0];
   if(closest&&distance(closest)<distance(current)){await toggle.click();await expect(page.locator('.adventure-panel .panel-body')).toBeHidden();await page.locator(`[data-battle-point="${closest.x},${closest.y}"]`).click();await ready(page);continue;}
  }
  await page.locator('[data-combat="end"]').click();await ready(page);
 }
 throw Error('Actual battle did not finish within 40 player operations');
}

test('购买、配装、真实战斗、导出导入、刷新和卸下形成完整流程',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,'equipment-gameplay');
 await inventory(page);await expect(page.locator('[data-equipment-buy]:enabled')).toHaveCount(0);
 await go(page,'market');await inventory(page);
 for(const id of ['fighter-guardian-weapon','ranger-hunter-body','round-shield'])await buy(page,id);
 for(const id of ['gear:1','gear:2','gear:3'])await equip(page,id);
 await expect(page.locator('[data-equipment-instance="gear:1"]')).toContainText('所需熟练：剑类武器熟练');
 await expect(page.locator('[data-equipment-defense]')).toHaveText('17');await expect(page.locator('[data-equipment-damage]')).toHaveText('d8+1');
 expect((await state(page)).things.gold).toBe(2);expect((await state(page)).things.equipment.owned).toHaveLength(3);
 await page.screenshot({path:info.outputPath('equipment-equipped.png'),fullPage:true});
 await near(page,'npc-0');await page.locator('[data-panel="interaction"]').click();await page.locator('button[data-npc="npc-0"]').click();await page.locator('[data-fight="npc-0"]').click();await ready(page);
 await inventory(page);await expect(page.locator('[data-equipment-unequip]:enabled')).toHaveCount(0);await expect(page.locator('[data-equipment-buy]:enabled')).toHaveCount(0);
 await page.locator('[data-panel="interaction"]').click();await fightToEnd(page);
 const fought=await state(page);expect(fought.runtime.encounter!.status).toBe('victory');
 const damage=fought.runtime.encounter!.rolls!.find(r=>r.actorId===fought.playerActorId&&r.kind==='damage')!;expect(damage).toMatchObject({sides:8,bonus:1});
 await page.locator('[data-panel="settings"]').click();const downloading=page.waitForEvent('download');await page.locator('#adventure-export').click();const downloaded=await downloading;
 const data=readFileSync((await downloaded.path())!);const exported=JSON.parse(data.toString()).payload;
 await page.locator('#adventure-import').setInputFiles({name:'equipped-adventure.json',mimeType:'application/json',buffer:data});
 await expect.poll(async()=>(await state(page)).runId).not.toBe(exported.runId);
 expect((await state(page)).runtime).toEqual(exported.runtime);expect((await state(page)).things).toEqual(exported.things);
 await page.reload();await painted(page);await inventory(page);
 await expect(page.locator('[data-equipment-defense]')).toHaveText('17');expect((await state(page)).things.equipment.owned).toHaveLength(3);
 for(const slot of ['mainHand','body','offHand'])await unequip(page,slot);
 await expect(page.locator('[data-equipment-defense]')).toHaveText('15');await expect(page.locator('[data-equipment-damage]')).toHaveText('d6+3');
 expect((await state(page)).things.equipment.owned).toHaveLength(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath('equipment-after-battle.png'),fullPage:true});
});

test('真实探索奖励只给一件匕首，穿戴并刷新后保留',async({page},info)=>{
 await open(page,'equipment-reward-ui');await go(page,'supply');const before=await state(page),event=before.things.events.find(e=>e.templateId==='supply')!;
 await page.locator(`[data-event="${event.id}"][data-choice="gather"]`).click();await ready(page);
 await inventory(page);await expect(page.locator('[data-equipment-instance]')).toHaveCount(1);await equip(page,'gear:1');
 await page.reload();await painted(page);await inventory(page);
 const after=await state(page);expect(after.things.equipment.owned).toEqual([{instanceId:'gear:1',definitionId:'rogue-shadow-weapon'}]);expect(after.things.equipment.loadout.slots.mainHand).toBe('gear:1');expect(after.things.settlements).toContain(event.id);
 await page.screenshot({path:info.outputPath('equipment-exploration-reward.png'),fullPage:true});
});

test('双手武器与盾牌的冲突在操作前可见，非法选项禁用且状态不变',async({page})=>{
 await open(page,'equipment-conflict-ui');await go(page,'market');await inventory(page);await buy(page,'ranger-hunter-weapon');await buy(page,'round-shield');await equip(page,'gear:2');
 const before=await state(page);await expect(page.locator('[data-equipment-equip="gear:1"]')).toBeDisabled();await expect(page.locator('[data-equipment-instance="gear:1"]')).toContainText('双手武器与副手冲突');expect((await state(page)).things).toEqual(before.things);
 await unequip(page,'offHand');await equip(page,'gear:1');await expect(page.locator('[data-equipment-range]')).toHaveText('6');await expect(page.locator('[data-equipment-equip="gear:2"]')).toBeDisabled();
});

test('通过导入界面继续线上真实 v0.5.0 存档，坏存档不覆盖进度',async({page})=>{
 await open(page,'equipment-migration-ui');await page.locator('[data-panel="settings"]').click();
 const data=gunzipSync(readFileSync(new URL('../fixtures/v050-save.json.gz',import.meta.url))),legacy=JSON.parse(data.toString()).payload;
 await page.locator('#adventure-import').setInputFiles({name:'v050-adventure.json',mimeType:'application/json',buffer:data});await expect.poll(async()=>(await state(page)).seed).toBe(legacy.seed);
 const migrated=await state(page);expect(migrated.schemaVersion).toBe(5);expect(migrated.runtime).toEqual(legacy.runtime);expect(migrated.story).toEqual(legacy.story);expect(migrated.things.equipment.owned).toHaveLength(0);
 await page.locator('#adventure-import').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await expect(page.locator('.adventure-status')).toContainText('存档');expect(await state(page)).toEqual(migrated);
 await inventory(page);await expect(page.locator('.equipment-empty')).toBeVisible();
});
