import {describe,it,expect} from 'vitest';
import {createAdventureApplication,type AdventureApplication,type AdventureSnapshot} from '../src/application';
import {canonical,seedHash} from '../src/contracts/demo';
import {adventureBasicAttack,tacticalAction,tacticalActionWithMovement,nextDie,type AdventureRuntime} from '../src/modules/runtime';

const snapshot=(app:AdventureApplication)=>structuredClone(app.query().snapshot!) as AdventureSnapshot;
function seedFor20(value:number){for(let seed=0;seed<200000;seed++)if(nextDie(seed,20).value===value)return seed;throw Error('No dice seed');}
const seal=(value:unknown)=>{const payload=JSON.parse(JSON.stringify(value));return JSON.stringify({format:'hi-story-save/1',payload,checksum:seedHash(canonical(payload)).toString(16)});};
function command(app:AdventureApplication,type:string,payload:Record<string,unknown>){const s=snapshot(app);return {commandId:crypto.randomUUID(),runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type,payload};}
async function open(classId?:string){const app=createAdventureApplication();expect(await app.initialize({seed:'combat-options',...(classId?{professions:app.professionSetup(classId)}:{})})).toMatchObject({ok:true});return app;}
function encounter(r:AdventureRuntime,rng=seedFor20(15)){
 const enemy=Object.values(r.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;
 r.encounter={id:'basic-attack-audit',status:'active',round:1,participants:[{actorId:r.playerActorId,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:2,y:3},initiative:1}],rng,movement:4,action:true,guard:false,log:[],rewarded:false,obstacles:[]};return enemy;
}

describe('普通攻击显示与战后恢复闭环',()=>{
 it('长墙需要先远离玩家时连续回合沿绕行路线推进，不退回原死角',async()=>{
  const app=createAdventureApplication(),fighter=app.professionSetup('fighter');expect(await app.initialize({seed:'combat-options',professions:{...fighter,actors:{'npc-0':fighter.player}}})).toMatchObject({ok:true});
  let r=snapshot(app).runtime;const enemy=encounter(r);r.encounter!.participants[0].position={x:3,y:1};r.encounter!.participants[1].position={x:5,y:1};r.encounter!.obstacles=Array.from({length:6},(_,y)=>({x:4,y}));
  const positions=[{...r.encounter!.participants[1].position}];
  for(let round=0;round<3;round++){const result=tacticalActionWithMovement(r,'end');r=result.runtime;const move=result.movement.moves.find(m=>m.actorId===enemy);expect(move).toBeDefined();expect(move!.path.length-1).toBeLessThanOrEqual(4);positions.push({...r.encounter!.participants[1].position});}
  expect(new Set(positions.map(p=>`${p.x},${p.y}`)).size).toBe(positions.length);expect(r.encounter!.rolls!.some(d=>d.kind==='attack'&&d.actorId===enemy)).toBe(true);
 });
 it('敌人射程内被遮挡时绕到可攻击位置，反馈逐格路线且不超过移动预算',async()=>{
  const app=await open('fighter'),r=snapshot(app).runtime,p=r.playerActorId,enemy=encounter(r);
  r.encounter!.participants[0].position={x:3,y:0};r.encounter!.participants[1].position={x:6,y:3};r.encounter!.obstacles=[{x:4,y:1},{x:4,y:5}];
  const before=structuredClone(r),result=tacticalActionWithMovement(r,'end'),move=result.movement.moves.find(m=>m.actorId===enemy)!;
  expect(move).toBeDefined();expect(move.path[0]).toEqual({x:6,y:3});expect(move.path.length).toBeGreaterThan(1);expect(move.path.length-1).toBeLessThanOrEqual(4);
  for(const [i,point] of move.path.entries()){expect(r.encounter!.obstacles).not.toContainEqual(point);expect(point).not.toEqual({x:3,y:0});if(i)expect(Math.abs(point.x-move.path[i-1].x)+Math.abs(point.y-move.path[i-1].y)).toBe(1);}
  expect(result.runtime.encounter!.participants[1].position).toEqual(move.path.at(-1));expect(result.runtime.encounter!.rolls!.find(d=>d.kind==='attack'&&d.actorId===enemy)).toMatchObject({success:true});expect(result.runtime.actors[p].hp).toBeLessThan(r.actors[p].hp);expect(r).toEqual(before);
 });
 it('全遮挡无可达攻击位时有界返回，不穿障碍、不伪造命中或消费战斗骰子',async()=>{
  const app=await open('fighter'),r=snapshot(app).runtime,p=r.playerActorId,enemy=encounter(r);
  r.encounter!.participants[0].position={x:3,y:0};r.encounter!.participants[1].position={x:6,y:3};r.encounter!.obstacles=[{x:2,y:0},{x:4,y:0},{x:2,y:1},{x:3,y:1},{x:4,y:1}];
  const result=tacticalActionWithMovement(r,'end');expect(result.movement.moves).toEqual([]);expect(result.runtime.encounter!.rng).toBe(r.encounter!.rng);expect(result.runtime.actors[p].hp).toBe(r.actors[p].hp);expect(result.runtime.encounter!.participants[1].position).toEqual({x:6,y:3});expect(result.runtime.encounter!.rolls?.filter(d=>d.actorId===enemy)??[]).toEqual([]);expect(result.runtime.encounter!.round).toBe(2);
 });
 for(const classId of ['wizard','sorcerer','warlock','cleric'])it(`${classId} 当前攻击显示与真正掷骰一致，查询不消耗随机或资源`,async()=>{
  const app=await open(classId),s=snapshot(app),p=s.playerActorId,r=s.runtime,enemy=encounter(r,seedFor20(classId==='cleric'?1:15));
  const before=structuredClone(r),display=adventureBasicAttack(r.actors[p]),next=tacticalAction(r,'attack',enemy),rolls=next.encounter!.rolls!;
  expect(display).toMatchObject({kind:'spell',damageDice:1,damageDie:8,damageBonus:0});
  if(display.check==='save')expect(rolls.find(d=>d.kind==='save')).toMatchObject({threshold:display.saveDC,success:false});
  else expect(rolls.find(d=>d.kind==='attack')).toMatchObject({bonus:display.attackBonus,success:true});
  expect(rolls.find(d=>d.kind==='damage')).toMatchObject({sides:display.damageDie,bonus:display.damageBonus,dice:expect.any(Array)});
  expect(rolls.find(d=>d.kind==='damage')!.dice).toHaveLength(display.damageDice);
  expect(next.actors[p].profession!.resources).toEqual(r.actors[p].profession!.resources);expect(r).toEqual(before);
  const saved=app.exportSave();expect(app.queryEquipment().basicAttack).toEqual(display);expect(app.exportSave()).toBe(saved);
 });
 it('持法杖显示武器攻击，卸下恢复真实法术；穿盾和旧保存投影仍兼容',async()=>{
  const app=await open('cleric'),s=snapshot(app),p=s.playerActorId;
  s.things.equipment={version:'adventure-equipment/1',owned:[{instanceId:'gear:1',definitionId:'round-shield'}],loadout:{version:'profession-equipment/1',slots:{offHand:'gear:1'}},grants:[{sourceId:'purchase:legacy-shield',instanceId:'gear:1'}],sequence:1};
  // This is the persisted projection emitted before the display correction: its +3 must not change on restore.
  s.runtime.actors[p].equipmentCombat={defense:13,attackBonus:5,damageDie:8,range:6,damageBonus:3,minimum:0,weapon:false};
  expect(await app.restore(seal(s))).toMatchObject({ok:true});
  expect(app.queryEquipment().basicAttack).toMatchObject({name:'圣焰',check:'save',saveDC:13,damageBonus:0});
  expect(snapshot(app).runtime.actors[p].equipmentCombat).toEqual(s.runtime.actors[p].equipmentCombat);
  const wizard=await open('wizard'),view=wizard.queryEquipment(),staff=view.shop.find(o=>o.definition.id==='wizard-evoker-weapon')!;
  expect(staff.previewAttack).toMatchObject({kind:'weapon',check:'attack',range:1,damageDie:10,damageBonus:-1});
  expect(view.basicAttack).toMatchObject({kind:'spell',range:6,damageDie:8,damageBonus:0});
  const actor=snapshot(wizard).runtime.actors[snapshot(wizard).playerActorId];actor.equipmentCombat=structuredClone(staff.preview!);
  const r=snapshot(wizard).runtime;r.actors[actor.actorId]=actor;const enemy=encounter(r,seedFor20(20)),next=tacticalAction(r,'attack',enemy);
  expect(next.encounter!.rolls!.find(d=>d.kind==='damage')).toMatchObject({sides:10,bonus:-1});
  delete actor.equipmentCombat;expect(adventureBasicAttack(actor)).toEqual(view.basicAttack);
 });
 it('资源耗尽的职业战斗能逃离、用药、短休和长休，刷新保持恢复结果',async()=>{
  const app=await open('wizard'),s=snapshot(app),p=s.playerActorId;encounter(s.runtime,seedFor20(20));s.status='waiting-result';
  s.runtime.actors[p].hp=1;s.runtime.actors[p].profession!.resources.wizard=0;
  expect(await app.restore(seal(s))).toMatchObject({ok:true});
  const before=app.exportSave(),enemy=s.runtime.encounter!.participants[1].actorId;
  expect(await app.dispatch(command(app,'profession.skill',{skillId:'wizard-fire',targetId:enemy}))).toMatchObject({ok:false,error:{code:'INSUFFICIENT_PROFESSION_RESOURCE'}});expect(app.exportSave()).toBe(before);
  expect(app.queryProfessionSkillOptions().find(o=>o.id==='wizard-3')).toMatchObject({allowed:true,cost:0});
  expect(await app.dispatch(command(app,'combat.action',{action:'flee'}))).toMatchObject({ok:true});
  expect(snapshot(app)).toMatchObject({status:'active',runtime:{encounter:{status:'fled',rewarded:true}}});
  const escaped=snapshot(app);expect(escaped.runtime.actors[p].hp).toBe(1);expect(escaped.runtime.actors[p].profession!.resources.wizard).toBe(0);
  const potions=escaped.things.inventory.potion;
  expect(await app.dispatch(command(app,'inventory.use',{itemId:'potion'}))).toMatchObject({ok:true});
  expect(snapshot(app).runtime.actors[p].hp).toBe(escaped.runtime.actors[p].maxHp);expect(snapshot(app).things.inventory.potion).toBe(potions-1);
  for(const remaining of [2,4]){expect(await app.dispatch(command(app,'profession.rest',{kind:'short'}))).toMatchObject({ok:true});expect(snapshot(app).runtime.actors[p].profession!.resources.wizard).toBe(remaining);}
  const twice=app.exportSave();expect(await app.dispatch(command(app,'profession.rest',{kind:'short'}))).toMatchObject({ok:false,error:{code:'REST_LIMIT'}});expect(app.exportSave()).toBe(twice);
  expect(await app.dispatch(command(app,'profession.rest',{kind:'long'}))).toMatchObject({ok:true});expect(snapshot(app).runtime.actors[p].profession).toMatchObject({shortRests:0,resources:{wizard:4}});
  const resumed=createAdventureApplication();expect(await resumed.restore(app.exportSave())).toMatchObject({ok:true});expect(snapshot(resumed).runtime).toEqual(snapshot(app).runtime);expect(snapshot(resumed).things).toEqual(snapshot(app).things);expect(snapshot(resumed).story.time).toBe(10.5);
 });
});
