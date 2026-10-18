import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createAdventureApplication,type AdventureApplication,type AdventureSnapshot} from '../src/application';
import {canonical,seedHash} from '../src/contracts/demo';
import {createAdventureEquipment,grantAdventureEquipment,validateAdventureEquipment} from '../src/modules/things';
import {nextDie,advanceAdventureProfession} from '../src/modules/runtime';

const snapshot=(app:AdventureApplication)=>structuredClone(app.query().snapshot!) as AdventureSnapshot;
function command(app:AdventureApplication,type:string,payload:Record<string,unknown>,commandId=crypto.randomUUID()){
 const s=app.query().snapshot!;return {commandId,runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type,payload};
}
async function act(app:AdventureApplication,type:string,payload:Record<string,unknown>){const result=await app.dispatch(command(app,type,payload));expect(result,JSON.stringify(result)).toMatchObject({ok:true});}
async function open(classId?:string,ports:Parameters<typeof createAdventureApplication>[0]={}){
 const app=createAdventureApplication(ports);expect(await app.initialize({seed:'equipment-gameplay',...(classId?{professions:app.professionSetup(classId)}:{})})).toMatchObject({ok:true});return app;
}
async function go(app:AdventureApplication,id:string){const target=snapshot(app).runtime.map.anchors.find(a=>a.id===id)!.position;const path=app.planRoute(target);expect(path.length).toBeGreaterThan(0);for(const point of path)await act(app,'world.move',{...point});}
function seal(value:unknown){const payload=JSON.parse(JSON.stringify(value));return JSON.stringify({format:'hi-story-save/1',payload,checksum:seedHash(canonical(payload)).toString(16)});}
async function buy(app:AdventureApplication,definitionId:string){await act(app,'equipment.buy',{definitionId});return snapshot(app).things.equipment.owned.at(-1)!.instanceId;}
function rngFor(value:number){for(let seed=0;seed<100000;seed++)if(nextDie(seed,20).value===value)return seed;throw Error('No dice seed');}
async function battle(app:AdventureApplication){
 const s=snapshot(app),enemy=Object.values(s.runtime.actors).filter(a=>a.storyNpcId).sort((a,b)=>b.maxHp-a.maxHp)[0];
 if(enemy.profession)s.runtime=advanceAdventureProfession(s.runtime,enemy.actorId,enemy.profession.build.classes[0].classId);
 s.runtime.encounter={id:'equipment-battle',status:'active',round:1,participants:[{actorId:s.playerActorId,position:{x:1,y:3},initiative:20},{actorId:enemy.actorId,position:{x:2,y:3},initiative:1}],rng:rngFor(15),action:true,movement:4,guard:false,log:[],rewarded:false,obstacles:[],rolls:[],rollSequence:0};
 s.status='waiting-result';expect(await app.restore(seal(s))).toMatchObject({ok:true});return enemy.actorId;
}

describe('v0.6.0 真实装备闭环',()=>{
 it('购买需要实际靠近商人，同一购买重放只扣费和发放一次',async()=>{
  const app=await open(),initial=snapshot(app);
  expect(await app.dispatch(command(app,'equipment.buy',{definitionId:'fighter-guardian-weapon'}))).toMatchObject({ok:false,error:{code:'OUT_OF_RANGE'}});expect(snapshot(app)).toEqual(initial);
  await go(app,'market');const before=snapshot(app),c=command(app,'equipment.buy',{definitionId:'fighter-guardian-weapon'});
  expect(await app.dispatch(c)).toMatchObject({ok:true});const after=snapshot(app);
  expect(after.things.gold).toBe(before.things.gold-5);expect(after.things.equipment.owned).toEqual([{instanceId:'gear:1',definitionId:'fighter-guardian-weapon'}]);
  expect(await app.dispatch(c)).toMatchObject({ok:true,duplicate:true});expect(snapshot(app)).toEqual(after);
  expect(app.queryEquipment().owned[0].definition.name).toBe('守门短剑');
 });
 it('探索奖励进入同一实物账本，结算过的营地不会再次发奖',async()=>{
  const app=await open();await go(app,'supply');const s=snapshot(app),event=s.things.events.find(e=>e.templateId==='supply')!;
  const c=command(app,'event.choose',{eventId:event.id,choiceId:'gather'});expect(await app.dispatch(c)).toMatchObject({ok:true});
  expect(snapshot(app).things.equipment.owned).toEqual([{instanceId:'gear:1',definitionId:'rogue-shadow-weapon'}]);expect(snapshot(app).things.inventory.supply).toBe(1);
  expect(await app.dispatch(c)).toMatchObject({ok:true,duplicate:true});expect(snapshot(app).things.equipment.owned).toHaveLength(1);
  expect(await app.restore(app.exportSave())).toMatchObject({ok:true});const before=snapshot(app);
  expect(await app.dispatch(command(app,'event.choose',{eventId:event.id,choiceId:'gather'}))).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
 });
 it('默认模式武器、甲和盾改变真实数值，卸下恢复基线且不产生第二件实物',async()=>{
  const app=await open(),base=app.queryCombatStats();await go(app,'market');
  const sword=await buy(app,'fighter-guardian-weapon'),armor=await buy(app,'ranger-hunter-body'),shield=await buy(app,'round-shield');
  for(const instanceId of [sword,armor,shield])await act(app,'equipment.equip',{instanceId});
  expect(app.queryCombatStats()).toMatchObject({attackBonus:3,damageDie:8,damageBonus:1,range:1,defense:17,weapon:true});
  const worn=snapshot(app);await act(app,'equipment.equip',{instanceId:sword});expect(app.queryCombatStats().attackBonus).toBe(3);expect(snapshot(app).things.equipment.owned).toHaveLength(3);
  for(const slot of ['mainHand','body','offHand'])await act(app,'equipment.unequip',{slot});
  expect(app.queryCombatStats()).toEqual(base);expect(snapshot(app).things.equipment.owned).toEqual(worn.things.equipment.owned);expect(snapshot(app).runtime.actors[worn.playerActorId].equipmentCombat).toBeUndefined();
 });
 it('双手冲突、错误槽位、未拥有实例与未知购买均失败且保持状态',async()=>{
  const app=await open();await go(app,'market');const bow=await buy(app,'ranger-hunter-weapon'),shield=await buy(app,'round-shield');await act(app,'equipment.equip',{instanceId:shield});
  for(const payload of [{instanceId:bow},{instanceId:'gear:999'},{instanceId:shield,slot:'body'},{instanceId:bow,slot:'__proto__'}]){
   const before=snapshot(app);expect(await app.dispatch(command(app,'equipment.equip',payload))).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
  }
  await act(app,'equipment.unequip',{slot:'offHand'});await act(app,'equipment.equip',{instanceId:bow});expect(app.queryCombatStats().range).toBe(6);
  const before=snapshot(app);expect(await app.dispatch(command(app,'equipment.equip',{instanceId:shield}))).toMatchObject({ok:false,error:{code:'EQUIPMENT_HAND_CONFLICT'}});expect(snapshot(app)).toEqual(before);
  expect(await app.dispatch(command(app,'equipment.buy',{definitionId:'imaginary-sword'}))).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
 });
 it('职业模式保留职业生命/技能资源，熟练限制真实执行',async()=>{
  const app=await open('wizard');await go(app,'market');const before=snapshot(app),armor=await buy(app,'fighter-guardian-body');
  expect(await app.dispatch(command(app,'equipment.equip',{instanceId:armor}))).toMatchObject({ok:false,error:{code:'EQUIPMENT_NOT_PROFICIENT'}});
  const staff=await buy(app,'wizard-evoker-weapon');await act(app,'equipment.equip',{instanceId:staff});
  const actor=snapshot(app).runtime.actors[before.playerActorId];expect(actor.maxHp).toBe(before.runtime.actors[before.playerActorId].maxHp);expect(actor.profession).toEqual(before.runtime.actors[before.playerActorId].profession);
  expect(app.queryCombatStats()).toMatchObject({damageDie:10,range:1,weapon:true});await act(app,'equipment.unequip',{slot:'mainHand'});expect(app.queryCombatStats().weapon).toBe(false);
 });
 it('实际命中、伤害骰与敌人攻击阈值读取装备数值，战斗中禁止换装',async()=>{
  const app=await open();await go(app,'market');const sword=await buy(app,'fighter-guardian-weapon'),armor=await buy(app,'ranger-hunter-body'),shield=await buy(app,'round-shield');
  for(const instanceId of [sword,armor,shield])await act(app,'equipment.equip',{instanceId});
  const targetId=await battle(app),before=snapshot(app);
  expect(await app.dispatch(command(app,'equipment.unequip',{slot:'body'}))).toMatchObject({ok:false,error:{code:'WAITING_RESULT'}});expect(snapshot(app)).toEqual(before);
  await act(app,'combat.action',{action:'attack',targetId});const after=snapshot(app),rolls=after.runtime.encounter!.rolls!;
  const attack=rolls.find(r=>r.actorId===after.playerActorId&&r.kind==='attack')!,damage=rolls.find(r=>r.actorId===after.playerActorId&&r.kind==='damage')!;
  expect(attack.bonus).toBe(3);expect(damage).toMatchObject({sides:8,bonus:1,minimum:0});expect(before.runtime.actors[targetId].hp-after.runtime.actors[targetId].hp).toBe(damage.total);
  await act(app,'combat.action',{action:'end'});const enemyRoll=snapshot(app).runtime.encounter!.rolls!.find(r=>r.kind==='attack'&&r.targetId===after.playerActorId)!;expect(enemyRoll.threshold).toBe(17);
 });
 it('配装后的真实战斗存档恢复可重放相同结果',async()=>{
  const app=await open();await go(app,'market');const sword=await buy(app,'fighter-guardian-weapon');await act(app,'equipment.equip',{instanceId:sword});const targetId=await battle(app);
  const other=createAdventureApplication();expect(await other.restore(app.exportSave())).toMatchObject({ok:true});
  await act(app,'combat.action',{action:'attack',targetId});await act(other,'combat.action',{action:'attack',targetId});
  expect(snapshot(other).runtime).toEqual(snapshot(app).runtime);expect(snapshot(other).things).toEqual(snapshot(app).things);
 });
 it('职业战士穿甲持盾的防御与武器结算生效，职业基础数值保持完整',async()=>{
  const app=await open('fighter');await go(app,'market');const sword=await buy(app,'fighter-guardian-weapon'),armor=await buy(app,'fighter-guardian-body'),shield=await buy(app,'round-shield');
  for(const instanceId of [sword,armor,shield])await act(app,'equipment.equip',{instanceId});expect(app.queryCombatStats().defense).toBe(18);
  const targetId=await battle(app);await act(app,'combat.action',{action:'attack',targetId});
  const s=snapshot(app),damage=s.runtime.encounter!.rolls!.find(r=>r.kind==='damage'&&r.actorId===s.playerActorId)!;expect(damage.sides).toBe(8);expect(damage.bonus).toBe(3);
  await act(app,'combat.action',{action:'end'});expect(snapshot(app).runtime.encounter!.rolls!.find(r=>r.kind==='attack'&&r.targetId===s.playerActorId)?.threshold).toBe(18);
 });
 it('法师持实体法杖时基础攻击按武器结算，施法仍由独立技能执行',async()=>{
  const app=await open('wizard');await go(app,'market');const staff=await buy(app,'wizard-evoker-weapon');await act(app,'equipment.equip',{instanceId:staff});const targetId=await battle(app);
  await act(app,'combat.action',{action:'attack',targetId});const s=snapshot(app),attack=s.runtime.encounter!.rolls!.find(r=>r.actorId===s.playerActorId&&r.kind==='attack')!;
  expect(attack.visual).not.toBe('spell');expect(s.runtime.encounter!.rolls!.find(r=>r.kind==='damage'&&r.actorId===s.playerActorId)?.sides).toBe(10);
 });
 it.each(['fighter','barbarian','rogue','monk','ranger','paladin','cleric','druid','bard','wizard','sorcerer','warlock'])('%s 的装备预览使用当前职业熟练，查询不写入实物或随机流',async classId=>{
  const app=await open(classId),before=snapshot(app);const view=app.queryEquipment();expect(view.shop.find(i=>i.definition.id==='rogue-shadow-weapon')!.equipReason).toBe('');expect(view.owned).toHaveLength(0);expect(snapshot(app)).toEqual(before);
 });
 it('恢复线上真实 v0.5.0 存档时只补空装备，进度和随机状态不变',async()=>{
  const save=gunzipSync(readFileSync(new URL('./fixtures/v050-save.json.gz',import.meta.url))).toString(),legacy=JSON.parse(save).payload;
  expect(legacy.schemaVersion).toBe(4);expect(legacy.things.equipment).toBeUndefined();
  let stored=save;const app=createAdventureApplication({storage:{read:()=>stored,write:v=>{stored=v;}}});expect(await app.continueSaved()).toMatchObject({ok:true});
  const after=snapshot(app);expect(after.schemaVersion).toBe(5);expect(after.runtime).toEqual(legacy.runtime);expect(after.story).toEqual(legacy.story);
  const {equipment,...oldThings}=after.things;expect(oldThings).toEqual(legacy.things);expect(equipment).toEqual(createAdventureEquipment());expect(after.adventureId).toBe(legacy.adventureId);expect(after.runId).not.toBe(legacy.runId);expect(JSON.parse(stored).payload.schemaVersion).toBe(5);
 });
 it('穿戴与所有权保存恢复一致，恢复后重复购买来源也不会再次扣费',async()=>{
  const app=await open();await go(app,'market');const c=command(app,'equipment.buy',{definitionId:'round-shield'});expect(await app.dispatch(c)).toMatchObject({ok:true});await act(app,'equipment.equip',{instanceId:'gear:1'});
  const before=snapshot(app);expect(await app.restore(app.exportSave())).toMatchObject({ok:true});expect(snapshot(app).runtime).toEqual(before.runtime);expect(snapshot(app).things).toEqual(before.things);
  expect(await app.dispatch(command(app,'equipment.buy',{definitionId:'round-shield'},c.commandId))).toMatchObject({ok:true});expect(snapshot(app).things).toEqual(before.things);
 });
 it('伪造派生数值、悬空穿戴、重复实物或损坏版本都不会覆盖当前局',async()=>{
  const app=await open();await go(app,'market');const shield=await buy(app,'round-shield');await act(app,'equipment.equip',{instanceId:shield});const before=snapshot(app);
  for(const change of [(s:AdventureSnapshot)=>{s.runtime.actors[s.playerActorId].equipmentCombat!.defense=40;},(s:AdventureSnapshot)=>{s.things.equipment.loadout.slots.offHand='gear:9';},(s:AdventureSnapshot)=>{s.things.equipment.owned.push({...s.things.equipment.owned[0]});},(s:AdventureSnapshot)=>{(s.versions as any).equipment='wrong';}]){
   const invalid=snapshot(app);change(invalid);expect(await app.restore(seal(invalid))).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
  }
  expect(await app.restore('{broken')).toMatchObject({ok:false,error:{code:'INVALID_SAVE',message:'存档内容不是有效的 JSON。'}});expect(snapshot(app)).toEqual(before);
 });
 it('购买/穿戴提交故障会回滚金币、实例、数值、回执和随机状态',async()=>{
  let fail=false;const app=await open(undefined,{beforeCommit:()=>{if(fail)throw Error('injected');}});await go(app,'market');
  let before=snapshot(app);const buyCommand=command(app,'equipment.buy',{definitionId:'round-shield'});fail=true;expect(await app.dispatch(buyCommand)).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
  fail=false;expect(await app.dispatch(buyCommand)).toMatchObject({ok:true});before=snapshot(app);const wearCommand=command(app,'equipment.equip',{instanceId:'gear:1'});fail=true;expect(await app.dispatch(wearCommand)).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
  fail=false;expect(await app.dispatch(wearCommand)).toMatchObject({ok:true});expect(app.queryCombatStats().defense).toBe(17);
 });
 it('相同奖励来源只能对应一个实例，来源冲突不改变账本',()=>{
  const equipment=createAdventureEquipment();grantAdventureEquipment(equipment,'round-shield','reward:camp');const before=structuredClone(equipment);
  expect(grantAdventureEquipment(equipment,'round-shield','reward:camp').duplicate).toBe(true);expect(equipment).toEqual(before);
  expect(()=>grantAdventureEquipment(equipment,'rogue-shadow-weapon','reward:camp')).toThrow();expect(equipment).toEqual(before);validateAdventureEquipment(equipment);
 });
});
