import { record, requireValue } from '../../contracts/demo';
import { professionCatalog, getProfessionSkill } from './catalog';
import { deriveProfession, professionAbilityModifier, professionSkillAccess, validateProfessionBuild } from './progression';
import { PROFESSION_VERSION, type ProfessionAbilities, type ProfessionBuild, type ProfessionRuntimeState } from './types';

export function createProfessionRuntime(build:ProfessionBuild,scores:ProfessionAbilities):ProfessionRuntimeState {const d=deriveProfession(build,scores);return {version:PROFESSION_VERSION,build:structuredClone(build),resources:{...d.resourceMax},shortRests:0};}
export function validateProfessionRuntime(input:unknown,scores:ProfessionAbilities):asserts input is ProfessionRuntimeState {
  const s=record(input,['version','build','resources','shortRests']);requireValue(s.version===PROFESSION_VERSION,'INCOMPATIBLE_PROFESSION','职业运行状态版本不兼容。');validateProfessionBuild(s.build,scores);const max=deriveProfession(s.build,scores).resourceMax;
  const resources=record(s.resources,Object.keys(max));requireValue(Object.keys(resources).length===Object.keys(max).length&&Object.entries(max).every(([id,n])=>Number.isInteger(resources[id])&&(resources[id] as number)>=0&&(resources[id] as number)<=n)&&Number.isInteger(s.shortRests)&&(s.shortRests as number)>=0&&(s.shortRests as number)<=2,'INVALID_PROFESSION_RESOURCE','职业资源或短休次数无效。');
}
export function spendProfessionResource(state:ProfessionRuntimeState,scores:ProfessionAbilities,skillId:string):ProfessionRuntimeState {
  validateProfessionRuntime(state,scores);const access=professionSkillAccess(state.build,scores,skillId);requireValue(access.learned,'SKILL_LOCKED',access.reason);requireValue(access.executable,'SKILL_NOT_IMPLEMENTED',access.reason);const skill=getProfessionSkill(skillId);
  requireValue(state.resources[skill.classId]>=skill.cost,'INSUFFICIENT_PROFESSION_RESOURCE','职业资源不足。');const next=structuredClone(state);next.resources[skill.classId]-=skill.cost;return next;
}
export function restProfession(state:ProfessionRuntimeState,scores:ProfessionAbilities,hp:number,kind:'short'|'long'):{profession:ProfessionRuntimeState;hp:number;hours:number}{
  validateProfessionRuntime(state,scores);const d=deriveProfession(state.build,scores);requireValue(Number.isInteger(hp)&&hp>0&&hp<=d.maxHp,'INVALID_TARGET','只有存活角色可以主动休息。');requireValue(['short','long'].includes(kind),'INVALID_REST','休息类型无效。');const next=structuredClone(state);
  if(kind==='short'){requireValue(next.shortRests<2,'REST_LIMIT','每次长休之间最多两次获益短休。');next.shortRests++;for(const [id,n]of Object.entries(d.resourceMax))next.resources[id]=Math.min(n,next.resources[id]+Math.ceil(n/2));return {profession:next,hp:Math.min(d.maxHp,hp+Math.max(1,d.totalLevel+professionAbilityModifier(scores.con))),hours:1};}
  next.shortRests=0;next.resources={...d.resourceMax};return {profession:next,hp:d.maxHp,hours:8};
}
/** Reconciliation does not refill spent pools; only the increased capacity is added. */
export function reconcileProfessionGrowth(state:ProfessionRuntimeState,scores:ProfessionAbilities,nextBuild:ProfessionBuild):ProfessionRuntimeState {
  validateProfessionRuntime(state,scores);const old=deriveProfession(state.build,scores),next=deriveProfession(nextBuild,scores);requireValue(next.totalLevel===old.totalLevel+1,'INVALID_LEVEL','成长必须一次增加一级。');
  requireValue(nextBuild.classes.length>=state.build.classes.length&&state.build.classes.every((c,i)=>nextBuild.classes[i]?.classId===c.classId&&nextBuild.classes[i].skillAbility===c.skillAbility&&nextBuild.classes[i].level>=c.level&&nextBuild.classes[i].level<=c.level+1&&(c.specializationId===undefined||nextBuild.classes[i].specializationId===c.specializationId)),'INVALID_PROFESSION_BUILD','成长不能删除、换序或重修已有职业。');
  return {version:PROFESSION_VERSION,build:structuredClone(nextBuild),shortRests:state.shortRests,resources:Object.fromEntries(Object.entries(next.resourceMax).map(([id,max])=>[id,Object.hasOwn(old.resourceMax,id)?Math.min(max,state.resources[id]+max-old.resourceMax[id]):max]))};
}
export const professionExecutionStatus=()=>({catalogSkills:Object.keys(professionCatalog.skills).length,executableSkills:Object.values(professionCatalog.skills).filter(s=>s.execution).map(s=>s.id)});
