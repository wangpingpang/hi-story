import {recordRoll} from './dice-record';
import {adventureCombatStats} from './equipment';
import type {DiceRollRecord} from '../../contracts/adventure';
import { GameError, requireValue, record } from '../../contracts/demo';
import {
  PROFESSION_VERSION, ABILITY_IDS, createProfessionRuntime, validateProfessionRuntime,
  defaultProfessionAbilities, deriveProfession, professionAbilityModifier, professionSkillAccess,
  getProfessionSkill, getProfession, spendProfessionResource, restProfession,
  advanceProfession, reconcileProfessionGrowth, availableProfessionSkills,
  type ProfessionSetup, type ProfessionAbilities, type ProfessionAbility, type ProfessionRuntimeState,
  type ProfessionSkillDefinition,
} from '../professions/index';
import { nextDie, manhattan, type AdventureActor, type AdventureRuntime } from './adventure';

export interface AdventureProfessionInitialization {player:ProfessionSetup;actors?:Record<string,ProfessionSetup>}
export const PROFESSION_COMBAT_OPTIONS_VERSION='profession-combat-options/1' as const;
export interface ProfessionSkillOption {
  id:string;name:string;kind:string;effect:string;check:string;cost:number;resource:string;remaining:number;range:number;
  allowed:boolean;reason:string;
  targets:{actorId:string;name:string;hp:number;maxHp:number;allowed:boolean;reason:string}[];
}
export const PROFESSION_ADVENTURE_RULES_VERSION='adventure-dnd/2-professions' as const;
export interface ProfessionCombatProfile {attackAbility:ProfessionAbility;attacks:number}
export function configureProfessionActor(actor:AdventureActor,setup:ProfessionSetup):AdventureActor {
  record(setup,['build','abilities']);const scores=setup.abilities??defaultProfessionAbilities(setup.build.classes[0]?.classId),derived=deriveProfession(setup.build,scores);
  return {...actor,abilities:structuredClone(scores),skills:Object.keys(derived.skillRanks) as AdventureActor['skills'],proficiency:derived.proficiency,maxHp:derived.maxHp,hp:derived.maxHp,defense:derived.unarmoredAC,attackBonus:derived.attackBonus,range:derived.attackRange,damageDie:derived.damageDie,profession:createProfessionRuntime(setup.build,scores),professionCombat:{attackAbility:derived.attackAbility,attacks:derived.attacks}};
}
export function validateActorProfession(actor:AdventureActor):void {
  if(!actor.profession)return;validateProfessionRuntime(actor.profession,actor.abilities);const d=deriveProfession(actor.profession.build,actor.abilities);
  requireValue(actor.maxHp===d.maxHp&&actor.proficiency===d.proficiency&&actor.attackBonus===d.attackBonus&&actor.defense===d.unarmoredAC&&actor.range===d.attackRange&&actor.damageDie===d.damageDie&&actor.professionCombat?.attackAbility===d.attackAbility&&actor.professionCombat?.attacks===d.attacks&&actor.skills.length===Object.keys(d.skillRanks).length&&actor.skills.every(s=>Object.hasOwn(d.skillRanks,s))&&new Set(actor.skills).size===actor.skills.length,'INVALID_PROFESSION_ACTOR','人物数值与职业派生结果不一致。');
}
export function restAdventureProfession(state:AdventureRuntime,actorId:string,kind:'short'|'long'):{runtime:AdventureRuntime;hours:number}{
  requireValue(state.encounter?.status!=='active','WAITING_RESULT','战斗中不能休息。');const a=state.actors[actorId];requireValue(a?.profession,'NO_PROFESSION','该角色尚未接入职业体系。');validateActorProfession(a);
  const result=restProfession(a.profession,a.abilities,a.hp,kind),next=structuredClone(state);next.actors[actorId].profession=result.profession;next.actors[actorId].hp=result.hp;return {runtime:next,hours:result.hours};
}
/** Caller must authorize XP/training. This is deliberately not a free player command. */
export function advanceAdventureProfession(state:AdventureRuntime,actorId:string,classId:string,specializationId?:string,attributeIncreases?:Partial<ProfessionAbilities>):AdventureRuntime {
  requireValue(state.encounter?.status!=='active','WAITING_RESULT','战斗中不能升级。');const a=state.actors[actorId];requireValue(a?.profession&&a.hp>0,'NO_PROFESSION','角色必须存活且已接入职业体系。');validateActorProfession(a);const old=deriveProfession(a.profession.build,a.abilities),scores=structuredClone(a.abilities);
  if([4,8,12].includes(old.totalLevel+1)){const points=record(attributeIncreases,[...ABILITY_IDS]);requireValue(Object.values(points).reduce<number>((n,v)=>n+(typeof v==='number'?v:0),0)===2&&Object.entries(points).every(([k,v])=>Number.isInteger(v)&&(v as number)>=1&&(v as number)<=2&&scores[k as ProfessionAbility]+(v as number)<=20),'ATTRIBUTE_CHOICE_REQUIRED','本级须分配2点属性提升，单项不超过2点，上限20。');for(const [k,v]of Object.entries(points))scores[k as ProfessionAbility]+=v as number;}
  else requireValue(attributeIncreases===undefined,'INVALID_ATTRIBUTE_INCREASE','只有总等级4、8、12可以提升属性。');
  const build=advanceProfession(a.profession.build,scores,classId,specializationId),nextState=reconcileProfessionGrowth(a.profession,scores,build),configured=configureProfessionActor(a,{build,abilities:scores});configured.profession=nextState;configured.hp=Math.min(configured.maxHp,a.hp+configured.maxHp-a.maxHp);
  const next=structuredClone(state);next.actors[actorId]=configured;return next;
}
export function professionSkillRank(actor:AdventureActor,skill:AdventureActor['skills'][number]):number {
  return actor.profession?deriveProfession(actor.profession.build,actor.abilities).skillRanks[skill]??0:actor.skills.includes(skill)?1:0;
}
function position(s:AdventureRuntime,id:string){if(s.encounter?.status==='active'){const p=s.encounter.participants.find(p=>p.actorId===id);requireValue(p,'INVALID_TARGET','目标不在当前战场。');return p.position;}return s.actors[id].position;}
export function professionLineOfSight(s:AdventureRuntime,fromId:string,toId:string):boolean {
  const source=position(s,fromId),target=position(s,toId),a={x:Math.round(source.x),y:Math.round(source.y)},b={x:Math.round(target.x),y:Math.round(target.y)};let x=a.x,y=a.y;const dx=Math.abs(b.x-x),dy=Math.abs(b.y-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1;let error=dx-dy;
  while(x!==b.x||y!==b.y){const e=2*error;if(e>-dy){error-=dy;x+=sx;}if(e<dx){error+=dx;y+=sy;}if(x===b.x&&y===b.y)break;if(s.encounter?.status==='active'?s.encounter.obstacles.some(p=>p.x===x&&p.y===y):s.map.cells[y]?.[x]?.blocksSight!==false)return false;}
  return true;
}
function skillRange(actor:AdventureActor,skill:Readonly<ProfessionSkillDefinition>):number {
  return skill.execution!.kind==='weapon'?adventureCombatStats(actor).range:skill.execution!.range;
}
function validateSkillActor(state:AdventureRuntime,actorId:string,skillId:string) {
  const actor=state.actors[actorId];requireValue(actor?.profession&&actor.hp>0,'NO_PROFESSION','角色必须存活且已接入职业体系。');
  validateActorProfession(actor);const access=professionSkillAccess(actor.profession.build,actor.abilities,skillId);
  requireValue(access.learned,'SKILL_LOCKED',access.reason);requireValue(access.executable,'SKILL_NOT_IMPLEMENTED',access.reason);
  return {actor,skill:getProfessionSkill(skillId)};
}
/** The same target checks serve the read-only picker and authoritative execution. */
function validateSkillTarget(state:AdventureRuntime,actorId:string,skill:Readonly<ProfessionSkillDefinition>,targetId:string):void {
  const actor=state.actors[actorId],target=state.actors[targetId],heal=skill.execution!.kind==='heal',battle=state.encounter;
  requireValue(target,'INVALID_TARGET','请选择有效目标。');
  requireValue(target.hp>0,'UNSUPPORTED_DYING_RULES','目标已经倒地；当前技能不能复生。');
  if(battle?.status==='active'){
    requireValue(battle.participants.some(p=>p.actorId===actorId)&&battle.participants.some(p=>p.actorId===targetId),'INVALID_TARGET','目标不在当前战场。');
    const sameSide=(actorId===state.playerActorId)===(targetId===state.playerActorId);
    requireValue(heal?sameSide:!sameSide,'INVALID_TARGET',heal?'治疗只能选择友方目标。':'伤害技能只能选择敌方目标。');
  }
  requireValue(heal?target.hp<target.maxHp:targetId!==actorId,'INVALID_TARGET',heal?'目标生命已满，无需治疗。':'不能攻击自己。');
  requireValue(manhattan(position(state,actorId),position(state,targetId))<=skillRange(actor,skill),'OUT_OF_RANGE','目标超出技能范围。');
  requireValue(professionLineOfSight(state,actorId,targetId),'OUT_OF_RANGE','目标视线被障碍阻挡。');
}
function validateSkillAction(state:AdventureRuntime,actorId:string,skill:Readonly<ProfessionSkillDefinition>):void {
  if(state.encounter?.status==='active')requireValue(actorId===state.playerActorId&&state.encounter.action,'NO_ACTION','本回合主行动已用完。');
  else requireValue(skill.execution!.kind==='heal','BATTLE_REQUIRED','伤害技能只能在遭遇战中使用。');
  requireValue(state.actors[actorId].profession!.resources[skill.classId]>=skill.cost,'INSUFFICIENT_PROFESSION_RESOURCE','职业资源不足。');
}
export function queryAdventureProfessionSkills(state:AdventureRuntime,actorId:string):ProfessionSkillOption[] {
  const actor=state.actors[actorId];if(!actor?.profession)return [];
  const ids=state.encounter?.status==='active'?state.encounter.participants.map(p=>p.actorId):Object.keys(state.actors);
  const reason=(check:()=>void)=>{try{check();return '';}catch(error){if(error instanceof GameError)return error.message;throw error;}};
  return availableProfessionSkills(actor.profession.build,actor.abilities).filter(s=>s.execution).map(skill=>{
    const unavailable=reason(()=>{validateSkillActor(state,actorId,skill.id);validateSkillAction(state,actorId,skill);});
    const targets=ids.map(id=>{const target=state.actors[id],why=unavailable||reason(()=>validateSkillTarget(state,actorId,skill,id));return {actorId:id,name:target.profile.name,hp:target.hp,maxHp:target.maxHp,allowed:!why,reason:why};});
    const why=unavailable||(targets.some(t=>t.allowed)?'':'没有合法目标；查看射程、视线与目标生命。');
    return {id:skill.id,name:skill.name,kind:skill.kind,effect:skill.effect,check:skill.check,cost:skill.cost,resource:getProfession(skill.classId).resource,remaining:actor.profession!.resources[skill.classId],range:skillRange(actor,skill),allowed:!why,reason:why,targets};
  });
}
/** Mutates only a caller-owned candidate, shared by player and AI execution. */
function resolve(state:AdventureRuntime,actorId:string,skillId:string,targetId:string):void {
  const {actor:a,skill}=validateSkillActor(state,actorId,skillId),target=state.actors[targetId],e=skill.execution!;
  validateSkillTarget(state,actorId,skill,targetId);
  a.profession=spendProfessionResource(a.profession!,a.abilities,skillId);
  const level=a.profession.build.classes.find(p=>p.classId===skill.classId)!,c=getProfession(skill.classId),ability=e.kind==='unarmed'?'dex':level.skillAbility??c.skillAbility,modifier=professionAbilityModifier(a.abilities[ability]),dc=8+a.proficiency+modifier;
  const battle=state.encounter?.status==='active'?state.encounter:undefined;
  const die=(sides:number)=>{const r=nextDie(battle?battle.rng:state.checkRng,sides);if(battle)battle.rng=r.rng;else state.checkRng=r.rng;return r.value;};
  const log=(text:string)=>{if(battle)battle.log.push(text);};
  const sides=e.kind==='unarmed'?(level.level>=9?10:level.level>=5?8:6):e.sides,count=e.kind==='unarmed'?e.dice:e.dice+(level.level>=5?1:0)+(level.level>=9?1:0);
  const amount=(critical=false)=>{const dice:number[]=[];for(let i=0;i<count*(critical?2:1);i++)dice.push(die(sides));const bonus=e.addAbility?modifier:0,minimum=e.kind==='heal'?1:0,total=Math.max(minimum,dice.reduce((n,v)=>n+v,0)+bonus);if(battle)recordRoll(battle,{kind:e.kind==='heal'?'healing':'damage',actorId,targetId,sides:sides as DiceRollRecord['sides'],dice,bonus,total,minimum,critical});return total;};
  if(e.kind==='heal'){const hp=Math.min(target.maxHp-target.hp,Math.max(1,amount()));target.hp+=hp;log(`${a.profile.name}使用${skill.name}，${target.profile.name}恢复${hp}生命。`);return;}
  if(e.kind==='save'){const d=die(20),saveModifier=professionAbilityModifier(target.abilities[e.saveAbility!])+(target.profession&&deriveProfession(target.profession.build,target.abilities).savingThrows.includes(e.saveAbility!)?target.proficiency:0),success=d+saveModifier>=dc;if(battle)recordRoll(battle,{kind:'save',actorId:targetId,targetId:actorId,sides:20,dice:[d],bonus:saveModifier,total:d+saveModifier,threshold:dc,success,visual:'spell'});const damage=success?0:amount();target.hp=Math.max(0,target.hp-damage);log(`${a.profile.name}使用${skill.name}：${target.profile.name}豁免d20 ${d}+${saveModifier} / DC ${dc}，${success?'成功':'失败'}，${damage}伤害。`);return;}
  if(e.kind==='weapon'){
    const stats=adventureCombatStats(a),d=die(20),ac=adventureCombatStats(target).defense+(battle?.guard&&targetId===state.playerActorId?2:0),hit=d!==1&&(d===20||d+stats.attackBonus>=ac),critical=d===20;
    if(battle)recordRoll(battle,{kind:'attack',actorId,targetId,sides:20,dice:[d],bonus:stats.attackBonus,total:d+stats.attackBonus,threshold:ac,success:hit,critical});
    let damage=0;
    if(hit){const dice=Array.from({length:critical?2:1},()=>die(stats.damageDie)),base=Math.max(stats.minimum,dice.reduce((n,v)=>n+v,0)+stats.damageBonus);
      if(battle)recordRoll(battle,{kind:'damage',actorId,targetId,sides:stats.damageDie as DiceRollRecord['sides'],dice,bonus:stats.damageBonus,total:base,minimum:stats.minimum,critical});
      damage=base+amount(critical);target.hp=Math.max(0,target.hp-damage);
    }
    log(`${a.profile.name}使用${skill.name}：d20 ${d}+${stats.attackBonus} / AC ${ac}，${hit?`${critical?'重击，':''}${damage}伤害`:'未命中'}。`);return;
  }
  for(let i=0;i<(e.attacks??1)&&target.hp>0;i++){const d=die(20),bonus=a.proficiency+modifier,ac=adventureCombatStats(target).defense+(battle?.guard&&targetId===state.playerActorId?2:0),hit=d!==1&&(d===20||d+bonus>=ac),damage=(()=>{if(battle)recordRoll(battle,{kind:'attack',actorId,targetId,sides:20,dice:[d],bonus,total:d+bonus,threshold:ac,success:hit,critical:d===20,visual:e.kind==='unarmed'?'unarmed':'spell'});return hit?amount(d===20):0;})();target.hp=Math.max(0,target.hp-damage);log(`${a.profile.name}使用${skill.name}：d20 ${d}+${bonus} / AC ${ac}，${hit?`${d===20?'重击，':''}${damage}伤害`:'未命中'}。`);}
}
export function useAdventureProfessionSkill(state:AdventureRuntime,actorId:string,skillId:string,targetId:string):AdventureRuntime {
  requireValue(state.professionVersion===PROFESSION_VERSION,'NO_PROFESSION','当前冒险未启用职业体系。');
  const {skill}=validateSkillActor(state,actorId,skillId);validateSkillAction(state,actorId,skill);
  const next=structuredClone(state);resolve(next,actorId,skillId,targetId);if(next.encounter?.status==='active'){next.encounter.action=false;if(next.encounter.participants.slice(1).every(p=>next.actors[p.actorId].hp===0)){next.encounter.status='victory';next.encounter.log.push('战斗胜利。');}}return next;
}
export function tryProfessionBasicAttack(s:AdventureRuntime,actorId:string,targetId:string):boolean {
  const a=s.actors[actorId];if(!a.profession)return false;
  const primary=a.profession.build.classes[0];if(!primary)return false;
  const skill=getProfession(primary.classId).skills.filter(k=>k.level<=primary.level&&k.cost===0&&['attack','save'].includes(k.execution?.kind??''))[0];
  if(!skill)return false;resolve(s,actorId,skill.id,targetId);return true;
}
export function professionBasicAttackCount(actor:AdventureActor):number {if(actor.equipmentCombat?.weapon)return actor.professionCombat?.attacks??1;const primary=actor.profession?.build.classes[0];return primary&&getProfession(primary.classId).skills.some(k=>k.level<=primary.level&&k.cost===0&&['attack','save'].includes(k.execution?.kind??''))?1:actor.professionCombat?.attacks??1;}
export function defaultAdventureProfession(classId:string):ProfessionSetup {getProfession(classId);return {build:{version:PROFESSION_VERSION,classes:[{classId,level:1}]}};}
export type { ProfessionRuntimeState };
