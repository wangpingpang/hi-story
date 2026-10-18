import {describe,it,expect} from 'vitest';
import {createAdventureApplication,type AdventureApplication,type AdventureSnapshot} from '../src/application';
import {canonical,seedHash} from '../src/contracts/demo';
import {useAdventureProfessionSkill,queryAdventureProfessionSkills,validateAdventureRuntime,nextDie,type AdventureRuntime} from '../src/modules/runtime';
import {listProfessions} from '../src/modules/professions';

const snapshot=(app:AdventureApplication)=>structuredClone(app.query().snapshot!) as AdventureSnapshot;
function command(app:AdventureApplication,skillId:string,targetId:string){const s=snapshot(app);return {commandId:crypto.randomUUID(),actorId:s.playerActorId,runId:s.runId,expectedRevision:s.revision,type:'profession.skill',payload:{skillId,targetId}};}
async function fixture(classId='wizard',ports:Parameters<typeof createAdventureApplication>[0]={}){
 const app=createAdventureApplication(ports);expect(await app.initialize({seed:'combat-options',professions:app.professionSetup(classId)})).toMatchObject({ok:true});
 const s=snapshot(app),r=s.runtime,id=s.playerActorId,enemy=Object.values(r.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;
 r.encounter={id:'skill-options-fixture',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:3,y:3},initiative:1}],rng:seedFor20(15),movement:4,action:true,guard:false,log:[],rewarded:false,obstacles:[]};
 s.status='waiting-result';await restore(app,s);return {app,r,id,enemy};
}
async function restore(app:AdventureApplication,s:AdventureSnapshot){const payload=JSON.parse(JSON.stringify(s));expect(await app.restore(JSON.stringify({format:'hi-story-save/1',payload,checksum:seedHash(canonical(payload)).toString(16)}))).toMatchObject({ok:true});}
function seedFor20(n:number){for(let seed=0;seed<200000;seed++)if(nextDie(seed,20).value===n)return seed;throw Error('seed');}
const skill=(r:AdventureRuntime,id:string)=>queryAdventureProfessionSkills(r,r.playerActorId).find(s=>s.id===id)!;

describe('战斗技能选择与权威结算',()=>{
 for(const c of listProfessions())it(`${c.name}一级有实际执行器与目标说明`,async()=>{
  const {app,r}=await fixture(c.id),before=app.exportSave(),options=app.queryProfessionSkillOptions();
  expect(options.length).toBeGreaterThan(0);expect(options.every(s=>s.resource&&s.targets.length===2)).toBe(true);
  expect(app.queryProfessionSkillOptions()).toEqual(options);expect(app.exportSave()).toBe(before);
  expect(()=>{(options[0] as any).cost=0;}).toThrow();expect(r.encounter!.rng).toBe(snapshot(app).runtime.encounter!.rng);
 });
 for(const cid of ['wizard','sorcerer'])it(`${cid}四系法术在一级可选，选择不扣资源`,async()=>{
  const {r}=await fixture(cid),before=structuredClone(r);
  for(const element of ['fire','frost','lightning','wind'])expect(skill(r,`${cid}-${element}`)).toMatchObject({allowed:true,cost:1,remaining:4,range:6});
  expect(r).toEqual(before);
 });
 it('施法未命中仍只扣一次资源和行动，不能再次施放',async()=>{
  const {r,id,enemy}=await fixture();r.encounter!.rng=seedFor20(1);const before=structuredClone(r),next=useAdventureProfessionSkill(r,id,'wizard-fire',enemy);
  expect(next.actors[enemy].hp).toBe(before.actors[enemy].hp);expect(next.actors[id].profession!.resources.wizard).toBe(3);expect(next.encounter!.action).toBe(false);expect(next.encounter!.rng).not.toBe(r.encounter!.rng);
  expect(()=>useAdventureProfessionSkill(next,id,'wizard-fire',enemy)).toThrow(/主行动/);expect(r).toEqual(before);validateAdventureRuntime(next);
 });
 it('法术自然20重击翻倍伤害骰；成功豁免不受伤害但消耗资源',async()=>{
  const {r,id,enemy}=await fixture();r.encounter!.rng=seedFor20(20);
  const hit=useAdventureProfessionSkill(r,id,'wizard-fire',enemy);expect(hit.encounter!.rolls!.find(d=>d.kind==='damage')).toMatchObject({dice:expect.any(Array),critical:true,sides:6});expect(hit.encounter!.rolls!.find(d=>d.kind==='damage')!.dice).toHaveLength(4);validateAdventureRuntime(hit);
  const saved=useAdventureProfessionSkill(r,id,'wizard-lightning',enemy);expect(saved.actors[enemy].hp).toBe(r.actors[enemy].hp);expect(saved.encounter!.rolls!.find(d=>d.kind==='save')).toMatchObject({success:true});expect(saved.actors[id].profession!.resources.wizard).toBe(3);validateAdventureRuntime(saved);
 });
 it('武器战技读取装备射程、命中与不同伤害骰，重击不重复加属性',async()=>{
  const {r,id,enemy}=await fixture('fighter');r.actors[id].equipmentCombat={defense:16,attackBonus:7,damageDie:10,range:6,damageBonus:4,minimum:0,weapon:true};r.encounter!.rng=seedFor20(20);
  expect(skill(r,'fighter-weapon-strike')).toMatchObject({range:6,allowed:true});const next=useAdventureProfessionSkill(r,id,'fighter-weapon-strike',enemy),rolls=next.encounter!.rolls!;
  expect(rolls[0]).toMatchObject({kind:'attack',bonus:7,critical:true});expect(rolls[1]).toMatchObject({kind:'damage',sides:10,bonus:4});expect(rolls[2]).toMatchObject({kind:'damage',sides:6,bonus:0});expect(rolls[1].dice).toHaveLength(2);expect(rolls[2].dice).toHaveLength(2);
  expect(r.actors[enemy].hp-next.actors[enemy].hp).toBe(Math.min(r.actors[enemy].hp,rolls[1].total+rolls[2].total));validateAdventureRuntime(next);
 });
 it('射程、障碍、非参战人物、自身伤害与敌方治疗均拒绝且不动RNG',async()=>{
  const {r,id,enemy}=await fixture();const outsider=Object.values(r.actors).find(a=>a.storyNpcId==='npc-1')!.actorId;
  const scenarios=[{target:id,mutate:()=>{}},{target:outsider,mutate:()=>{}},{target:enemy,mutate:()=>{r.encounter!.participants[1].position={x:8,y:6};}},{target:enemy,mutate:()=>{r.encounter!.participants[1].position={x:3,y:3};r.encounter!.obstacles=[{x:2,y:3}];}}];
  for(const scenario of scenarios){scenario.mutate();const before=structuredClone(r),option=skill(r,'wizard-fire');expect(option.targets.find(t=>t.actorId===scenario.target)?.allowed??false).toBe(false);expect(()=>useAdventureProfessionSkill(r,id,'wizard-fire',scenario.target)).toThrow();expect(r).toEqual(before);}
  const cleric=await fixture('cleric');cleric.r.actors[cleric.enemy].hp--;expect(skill(cleric.r,'cleric-mend').targets.find(t=>t.actorId===cleric.enemy)).toMatchObject({allowed:false,reason:'治疗只能选择友方目标。'});expect(()=>useAdventureProfessionSkill(cleric.r,cleric.id,'cleric-mend',cleric.enemy)).toThrow(/友方/);
 });
 it('治疗只选受伤友方，满血与倒地不消耗，资源不足可预见',async()=>{
  const {r,id}=await fixture('cleric');expect(skill(r,'cleric-mend').allowed).toBe(false);expect(()=>useAdventureProfessionSkill(r,id,'cleric-mend',id)).toThrow(/已满/);
  r.actors[id].hp-=4;const before=structuredClone(r),healed=useAdventureProfessionSkill(r,id,'cleric-mend',id);expect(healed.actors[id].hp).toBeGreaterThan(r.actors[id].hp);expect(healed.actors[id].hp).toBeLessThanOrEqual(r.actors[id].maxHp);expect(healed.actors[id].profession!.resources.cleric).toBe(3);validateAdventureRuntime(healed);expect(r).toEqual(before);
  r.actors[id].profession!.resources.cleric=0;expect(skill(r,'cleric-mend')).toMatchObject({allowed:false,reason:'职业资源不足。'});const empty=structuredClone(r);expect(()=>useAdventureProfessionSkill(r,id,'cleric-mend',id)).toThrow(/资源不足/);expect(r).toEqual(empty);
  r.actors[id].profession!.resources.cleric=4;r.actors[id].hp=0;expect(()=>useAdventureProfessionSkill(r,id,'cleric-mend',id)).toThrow();
 });
 it('探索中只允许治疗，不让攻击消耗检查随机流',async()=>{
  const {r,id,enemy}=await fixture();delete r.encounter;const before=structuredClone(r);expect(skill(r,'wizard-fire')).toMatchObject({allowed:false,reason:expect.stringContaining('遭遇战')});expect(()=>useAdventureProfessionSkill(r,id,'wizard-fire',enemy)).toThrow(/遭遇战/);expect(r).toEqual(before);
 });
 it('应用故障回滚、重复命令、战斗存档恢复与同输入续算一致',async()=>{
  let fail=false;const {app,id,enemy}=await fixture('wizard',{beforeCommit:()=>{if(fail)throw Error('injected failure');}}),before=app.exportSave(),c=command(app,'wizard-fire',enemy);
  fail=true;expect(await app.dispatch(c)).toMatchObject({ok:false});expect(app.exportSave()).toBe(before);
  fail=false;expect(await app.dispatch(c)).toMatchObject({ok:true});const after=app.exportSave();expect(await app.dispatch(c)).toMatchObject({ok:true,duplicate:true});expect(app.exportSave()).toBe(after);
  const restored=createAdventureApplication();expect(await restored.restore(after)).toMatchObject({ok:true});expect(snapshot(restored).runtime).toEqual(snapshot(app).runtime);
  expect(restored.queryProfessionSkillOptions().find(s=>s.id==='wizard-fire')).toMatchObject({remaining:3,allowed:false,reason:expect.stringContaining('主行动')});
  const end=(a:AdventureApplication)=>{const s=snapshot(a);return a.dispatch({commandId:crypto.randomUUID(),runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type:'combat.action',payload:{action:'end'}});};
  expect(await end(app)).toMatchObject({ok:true});expect(await end(restored)).toMatchObject({ok:true});expect(snapshot(restored).runtime).toEqual(snapshot(app).runtime);
 });
 it('旧四模板存档没有被静默改为职业模式',async()=>{
  const app=createAdventureApplication();await app.initialize({seed:'legacy-skills'});const before=app.exportSave();expect(app.queryProfessionSkillOptions()).toEqual([]);expect(app.exportSave()).toBe(before);
  const restored=createAdventureApplication();expect(await restored.restore(before)).toMatchObject({ok:true});expect(restored.queryProfessionSkillOptions()).toEqual([]);expect(snapshot(restored).runtime.professionVersion).toBeUndefined();
 });
});
