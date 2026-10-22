import {getProfession,professionAbilityModifier,type ProfessionAbility} from '../professions';
import type {AdventureActor} from './adventure';
import {adventureCombatStats} from './equipment';
import {professionBasicAttackCount,professionBasicSkill} from './profession';

export const BASIC_ATTACK_VERSION='basic-attack/1' as const;
/** Transient display facts; equipment projections and saved actor fields stay unchanged. */
export interface BasicAttackProfile {
 version:typeof BASIC_ATTACK_VERSION;kind:'weapon'|'spell';name:string;skillId?:string;
 check:'attack'|'save';attackBonus?:number;saveDC?:number;saveAbility?:ProfessionAbility;
 damageDice:number;damageDie:number;damageBonus:number;minimum:0|1;range:number;attacks:number;
}
export function adventureBasicAttack(actor:AdventureActor):BasicAttackProfile {
 const skill=professionBasicSkill(actor);
 if(skill){
  const execution=skill.execution!,level=actor.profession!.build.classes.find(p=>p.classId===skill.classId)!,ability=level.skillAbility??getProfession(skill.classId).skillAbility;
  const modifier=professionAbilityModifier(actor.abilities[ability]),bonus=actor.proficiency+modifier;
  return {version:BASIC_ATTACK_VERSION,kind:'spell',name:skill.name,skillId:skill.id,check:execution.kind==='save'?'save':'attack',
   ...(execution.kind==='save'?{saveDC:8+bonus,saveAbility:execution.saveAbility}:{attackBonus:bonus}),
   damageDice:execution.dice+(level.level>=5?1:0)+(level.level>=9?1:0),damageDie:execution.sides,damageBonus:execution.addAbility?modifier:0,
   minimum:0,range:execution.range,attacks:execution.attacks??1};
 }
 const stats=adventureCombatStats(actor);
 return {version:BASIC_ATTACK_VERSION,kind:'weapon',name:stats.weapon?'武器攻击':'普通攻击',check:'attack',attackBonus:stats.attackBonus,
  damageDice:1,damageDie:stats.damageDie,damageBonus:stats.damageBonus,minimum:stats.minimum,range:stats.range,attacks:professionBasicAttackCount(actor)};
}
