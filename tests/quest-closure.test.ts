import {describe,it,expect} from 'vitest';
import {createAdventureApplication,type AdventureApplication,type AdventureSnapshot} from '../src/application';
import {canonical,seedHash} from '../src/contracts/demo';
import {rollSkill,combatReachable,manhattan} from '../src/modules/runtime';

const snapshot=(app:AdventureApplication)=>structuredClone(app.query().snapshot!) as AdventureSnapshot;
let sequence=0;
const command=(app:AdventureApplication,type:string,payload:Record<string,unknown>)=>{const s=snapshot(app);return {commandId:`quest-closure-${++sequence}`,runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type,payload};};
async function act(app:AdventureApplication,type:string,payload:Record<string,unknown>){const result=await app.dispatch(command(app,type,payload));expect(result,JSON.stringify(result)).toMatchObject({ok:true});}
async function open(seed:string){const app=createAdventureApplication();expect(await app.initialize({seed})).toMatchObject({ok:true});return app;}
async function go(app:AdventureApplication,anchorId:string){const to=snapshot(app).runtime.map.anchors.find(a=>a.id===anchorId)!.position;for(const point of app.planRoute(to))await act(app,'world.move',{...point});}
async function choose(app:AdventureApplication,templateId:string,choiceId:string){const event=snapshot(app).things.events.find(e=>e.templateId===templateId)!;await act(app,'event.choose',{eventId:event.id,choiceId});}
async function accept(app:AdventureApplication,questId:string){if(!snapshot(app).things.tasks.some(t=>t.blueprint.id===questId))await act(app,'quest.accept',{questId});}
const task=(app:AdventureApplication,id:string)=>snapshot(app).things.tasks.find(t=>t.blueprint.id===id)!;
const pack=(s:AdventureSnapshot)=>{const payload=JSON.parse(JSON.stringify(s));return JSON.stringify({format:'hi-story-save/1',checksum:seedHash(canonical(payload)).toString(16),payload});};
async function completeMain(app:AdventureApplication){await go(app,'notes');await choose(app,'notes','read');const plot=snapshot(app).story.plotId;await go(app,plot==='letter'?'supply':plot==='seal'?'shrine':'cache');await choose(app,plot==='letter'?'supply':plot==='seal'?'shrine':'cache',plot==='letter'?'gather':plot==='seal'?'pray':'patient');await go(app,'watch');await choose(app,'watch','record');await go(app,'goal');await choose(app,'tower-door','complete');}
async function failedChecks(){for(let i=0;i<50;i++){const app=await open(`quest-recovery-${i}`),s=snapshot(app);const medicine=rollSkill(s.runtime,s.playerActorId,'medicine',11,'probe');if(!medicine.result.success&&!rollSkill(medicine.runtime,s.playerActorId,'athletics',13,'probe-athletics').result.success)return app;app.dispose();}throw Error('No deterministic failure seed');}

describe('任务分叉与终局闭环',()=>{
 it('截止前来不及交付时拒绝扣目标物品；真实行走超时后主线失败，旧矛盾终局恢复一致',async()=>{
  const app=await open('quest-deadline');await completeMain(app);const complete=snapshot(app),atTower=structuredClone(complete),towerEvent=atTower.things.events.find(e=>e.templateId==='tower-door')!;
  // 从真实完成旅程恢复交付前结构，只调整临界时间以隔离边界。
  const item=complete.story.plotId==='letter'?'supply':complete.story.plotId==='seal'?'seal':'relic';atTower.things.inventory[item]++;atTower.status='active';atTower.story.time=39.9;atTower.story.ending='';delete atTower.story.outcome;towerEvent.status='ready';delete towerEvent.choiceId;atTower.things.settlements=atTower.things.settlements.filter(id=>id!==towerEvent.id);atTower.things.facts=atTower.things.facts.filter(id=>id!=='main-complete');const main=atTower.things.tasks.find(t=>t.blueprint.main)!;main.status='active';main.rewarded=false;main.reason='';
  const boundary=createAdventureApplication();expect(await boundary.restore(pack(atTower))).toMatchObject({ok:true});const before=snapshot(boundary),choice=boundary.query().choices.find(c=>c.eventId===towerEvent.id)!;expect(choice).toMatchObject({allowed:false,reason:'剩余时间不足以完成交付。'});expect(await boundary.dispatch(command(boundary,'event.choose',{eventId:towerEvent.id,choiceId:'complete'}))).toMatchObject({ok:false});expect(snapshot(boundary)).toEqual(before);
  const p=before.runtime.actors[before.playerActorId].position,q=[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}].find(to=>boundary.planRoute(to).length===1)!;expect(q).toBeDefined();for(const to of [q,p,q])await act(boundary,'world.move',{...to});expect(snapshot(boundary).story.outcome).toBe('failed');expect(task(boundary,'main').status).toBe('failed');expect(snapshot(boundary).things.inventory[item]).toBe(before.things.inventory[item]);
  const legacy=structuredClone(complete);legacy.story.time=40.15;legacy.story.outcome='failed';legacy.story.ending='旅程期限已到，暮光塔关闭了入口。';const restored=createAdventureApplication();expect(await restored.restore(pack(legacy))).toMatchObject({ok:true});expect(task(restored,'main')).toMatchObject({status:'failed',rewarded:false,reason:legacy.story.ending});expect(snapshot(restored).things.gold).toBe(legacy.things.gold);expect(snapshot(restored).runtime).toEqual(legacy.runtime);
  const onTime=structuredClone(atTower);onTime.story.time=39.75;const exact=createAdventureApplication();expect(await exact.restore(pack(onTime))).toMatchObject({ok:true});await choose(exact,'tower-door','complete');expect(snapshot(exact).story.time).toBe(40);expect(snapshot(exact).story.outcome).toBe('success');expect(task(exact,'main').status).toBe('success');
 },60000);
 it('先接取再保留草药/绕行：委托明确失败，不妨碍主线，恢复不再出现进行中',async()=>{
  const app=await open('quest-explicit-choices');await go(app,'market');await accept(app,'herbalist');await accept(app,'shortcut');await choose(app,'herbalist','keep');await go(app,'gate');await choose(app,'gate','detour');
  expect(task(app,'herbalist')).toMatchObject({status:'failed',rewarded:false,reason:expect.stringContaining('保留草药')});expect(task(app,'shortcut')).toMatchObject({status:'failed',rewarded:false,reason:expect.stringContaining('绕行')});
  const gold=snapshot(app).things.gold;await go(app,'market');expect(snapshot(app).things.gold).toBe(gold);
  await completeMain(app);expect(snapshot(app).story.outcome).toBe('success');expect(snapshot(app).things.tasks.some(t=>t.status==='active')).toBe(false);
  const restored=createAdventureApplication();expect(await restored.restore(app.exportSave())).toMatchObject({ok:true});expect(snapshot(restored).things).toEqual(snapshot(app).things);expect(task(restored,'herbalist').status).toBe('failed');expect(task(restored,'shortcut').status).toBe('failed');
 },60000);
 it('先不可逆选择再接取：只读原因与命令复验一致；不能直接接连续链任务',async()=>{
  let app:AdventureApplication|undefined;for(let i=0;i<10;i++){const candidate=await open(`quest-before-accept-${i}`);if(!snapshot(candidate).things.tasks.some(t=>['herbalist','shortcut'].includes(t.blueprint.id))){app=candidate;break;}candidate.dispose();}expect(app).toBeDefined();const a=app!;
  await go(a,'market');await choose(a,'herbalist','keep');await go(a,'gate');await choose(a,'gate','detour');const before=snapshot(a);
  expect(a.queryQuestOptions()).toEqual(expect.arrayContaining([expect.objectContaining({questId:'herbalist',allowed:false,reason:expect.stringContaining('保留草药')}),expect.objectContaining({questId:'shortcut',allowed:false,reason:expect.stringContaining('绕行')})]));
  for(const questId of ['herbalist','shortcut','pact','echo'])expect(await a.dispatch(command(a,'quest.accept',{questId}))).toMatchObject({ok:false,error:{code:'OPTION_UNAVAILABLE'}});
  expect(snapshot(a)).toEqual(before);
 });
 it('真实医药/运动检定失败产生一次补救；扣耗材、领奖、开路、刷新和重复提交保持一致',async()=>{
  const app=await failedChecks();await go(app,'market');await accept(app,'herbalist');await accept(app,'shortcut');await choose(app,'herbalist','treat');expect(snapshot(app).things.facts).toContain('herb-attempted');expect(task(app,'herbalist').status).toBe('active');
  const herb=snapshot(app).things.inventory.herb,gold=snapshot(app).things.gold;await choose(app,'herbalist-recover','recover');expect(snapshot(app).things.inventory.herb).toBe(herb-1);expect(snapshot(app).things.gold).toBe(gold+4);expect(task(app,'herbalist')).toMatchObject({status:'success',rewarded:true});
  await go(app,'gate');await choose(app,'gate','lift');expect(snapshot(app).things.facts).toContain('gate-checked');expect(task(app,'shortcut').status).toBe('active');const restored=createAdventureApplication();expect(await restored.restore(app.exportSave())).toMatchObject({ok:true});
  const before=snapshot(restored),event=before.things.events.find(e=>e.templateId==='gate-recover')!,c=command(restored,'event.choose',{eventId:event.id,choiceId:'recover'});expect(await restored.dispatch(c)).toMatchObject({ok:true});const after=snapshot(restored);
  expect(after.things.inventory.rope).toBe(before.things.inventory.rope-1);expect(after.things.gold).toBe(before.things.gold+3);expect(after.runtime.doors.shortcut.open).toBe(true);expect(task(restored,'shortcut')).toMatchObject({status:'success',rewarded:true});
  expect(await restored.dispatch(c)).toMatchObject({ok:true,duplicate:true});expect(snapshot(restored)).toEqual(after);expect(await restored.dispatch(command(restored,'event.choose',{eventId:event.id,choiceId:'recover'}))).toMatchObject({ok:false});expect(snapshot(restored)).toEqual(after);
  const next=createAdventureApplication();expect(await next.restore(restored.exportSave())).toMatchObject({ok:true});expect(snapshot(next).things).toEqual(after.things);
 });
 it('旧有效状态中已失败检定补齐入口，重复恢复不扣费、不掷骰、不发奖',async()=>{
  const app=await failedChecks();await go(app,'market');await choose(app,'herbalist','treat');await go(app,'gate');await choose(app,'gate','lift');const legacy=snapshot(app);
  // 模拟旧版已提交失败后尚未提供补救入口的保存结构。
  legacy.things.events=legacy.things.events.filter(e=>!['herbalist-recover','gate-recover'].includes(e.templateId));legacy.things.followups=legacy.things.followups.filter(id=>!['herbalist-recover','gate-recover'].includes(id));legacy.story.planned=legacy.story.planned.filter(id=>!['herbalist-recover','gate-recover'].includes(id));
  const restored=createAdventureApplication();expect(await restored.restore(pack(legacy))).toMatchObject({ok:true});const after=snapshot(restored);expect(after.runtime).toEqual(legacy.runtime);expect(after.things.inventory).toEqual(legacy.things.inventory);expect(after.things.gold).toBe(legacy.things.gold);expect(after.things.tasks).toEqual(legacy.things.tasks);
  for(const id of ['herbalist-recover','gate-recover'])expect(after.things.events.filter(e=>e.templateId===id)).toHaveLength(1);
  const again=createAdventureApplication();expect(await again.restore(restored.exportSave())).toMatchObject({ok:true});expect(snapshot(again).things).toEqual(after.things);
 });
 it('已完成目标后补接委托只领奖一次；未完成支线在主线成功时收尾，旧终局恢复不领奖',async()=>{
  let app:AdventureApplication|undefined;for(let i=0;i<8;i++){const a=await open(`quest-late-success-${i}`);if(!snapshot(a).things.tasks.some(t=>t.blueprint.id==='herbalist')){app=a;break;}a.dispose();}const a=app!;expect(a).toBeDefined();await go(a,'market');await choose(a,'herbalist','return');const gold=snapshot(a).things.gold;await accept(a,'herbalist');expect(snapshot(a).things.gold).toBe(gold+4);expect(task(a,'herbalist').status).toBe('success');expect(await a.dispatch(command(a,'quest.accept',{questId:'herbalist'}))).toMatchObject({ok:false,error:{code:'TASK_ALREADY_EXISTS'}});await accept(a,'shortcut');await completeMain(a);expect(task(a,'shortcut')).toMatchObject({status:'abandoned',rewarded:false});
  const legacy=snapshot(a);legacy.things.tasks.find(t=>t.blueprint.id==='shortcut')!.status='active';legacy.things.tasks.find(t=>t.blueprint.id==='shortcut')!.reason='';const restored=createAdventureApplication();expect(await restored.restore(pack(legacy))).toMatchObject({ok:true});expect(task(restored,'shortcut').status).toBe('abandoned');expect(snapshot(restored).things.gold).toBe(legacy.things.gold);expect(snapshot(restored).runtime).toEqual(legacy.runtime);
 },60000);
 it('营地医者在真实战斗中离场后不能交草药，委托失败且奖励不变',async()=>{
  const app=await open('quest-medic-defeat');await go(app,'market');await accept(app,'herbalist');const p=Object.values(snapshot(app).runtime.actors).find(a=>a.storyNpcId==='npc-1')!.position;const routes=[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}].flatMap(to=>{try{const route=app.planRoute(to);return route.length?[route]:[];}catch{return [];}}).sort((a,b)=>a.length-b.length);for(const point of routes[0])await act(app,'world.move',{...point});await act(app,'npc.attack',{npcId:'npc-1'});
  for(let turn=0;turn<40&&snapshot(app).runtime.encounter!.status==='active';turn++){
   let s=snapshot(app),battle=s.runtime.encounter!,enemy=battle.participants[1];
   if(battle.action&&s.runtime.actors[s.playerActorId].hp<14&&s.things.inventory.potion>0)await act(app,'inventory.use',{itemId:'potion'});
   else if(battle.action){const candidates=Array.from({length:63},(_,i)=>({x:i%9,y:Math.floor(i/9)})).filter(to=>(combatReachable(s.runtime,to)??0)>0).sort((a,b)=>manhattan(a,enemy.position)-manhattan(b,enemy.position));if(manhattan(battle.participants[0].position,enemy.position)>s.runtime.actors[s.playerActorId].range&&candidates[0])await act(app,'combat.action',{action:'move',...candidates[0]});s=snapshot(app);battle=s.runtime.encounter!;if(manhattan(battle.participants[0].position,enemy.position)<=s.runtime.actors[s.playerActorId].range)await act(app,'combat.action',{action:'attack',targetId:enemy.actorId});}
   if(snapshot(app).runtime.encounter!.status==='active')await act(app,'combat.action',{action:'end'});
  }
  expect(snapshot(app).runtime.encounter!.status).toBe('victory');expect(task(app,'herbalist')).toMatchObject({status:'failed',rewarded:false,reason:expect.stringContaining('医者已经离场')});await go(app,'market');const event=snapshot(app).things.events.find(e=>e.templateId==='herbalist')!;expect(event.status).toBe('cancelled');const before=snapshot(app);expect(await app.dispatch(command(app,'event.choose',{eventId:event.id,choiceId:'return'}))).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
 },60000);
});
