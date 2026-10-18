import {record, requireValue} from '../../contracts/demo';
import type {AdventureActor, AdventureRuntime} from './adventure';
export interface EquipmentCombatProfile {
 defense:number;attackBonus:number;damageDie:number;range:number;damageBonus:number;minimum:0|1;weapon:boolean;
}
/** Base actor statistics remain intact, including optional profession formulas. */
export function adventureCombatStats(actor:AdventureActor):EquipmentCombatProfile {
 const ability=actor.professionCombat?.attackAbility??(actor.range>1?'dex':'str'),modifier=Math.floor((actor.abilities[ability]-10)/2);
 return actor.equipmentCombat??{defense:actor.defense,attackBonus:actor.attackBonus,damageDie:actor.profession?actor.damageDie:6,range:actor.range,damageBonus:actor.profession?modifier:Math.max(1,modifier),minimum:actor.profession?0:1,weapon:false};
}
export function validateEquipmentCombat(input:unknown):asserts input is EquipmentCombatProfile {
 const p=record(input,['defense','attackBonus','damageDie','range','damageBonus','minimum','weapon']);
 requireValue(Number.isInteger(p.defense)&&(p.defense as number)>=0&&(p.defense as number)<=40&&Number.isInteger(p.attackBonus)&&(p.attackBonus as number)>=-5&&(p.attackBonus as number)<=20&&[4,6,8,10,12].includes(p.damageDie as number)&&Number.isInteger(p.range)&&(p.range as number)>=1&&(p.range as number)<=12&&Number.isInteger(p.damageBonus)&&(p.damageBonus as number)>=-5&&(p.damageBonus as number)<=10&&(p.minimum===0||p.minimum===1)&&typeof p.weapon==='boolean','INVALID_EQUIPMENT_COMBAT','装备战斗数值无效。');
}
/** Application authorizes the candidate against the unique things ledger. */
export function setAdventureEquipmentCombat(state:AdventureRuntime,actorId:string,profile:EquipmentCombatProfile|undefined):AdventureRuntime {
 requireValue(state.encounter?.status!=='active','WAITING_RESULT','战斗中不能更换装备。');
 requireValue(actorId===state.playerActorId&&state.actors[actorId]?.hp>0,'INVALID_TARGET','当前只能调整玩家的装备。');
 if(profile)validateEquipmentCombat(profile);
 const next=structuredClone(state);if(profile)next.actors[actorId].equipmentCombat=structuredClone(profile);else delete next.actors[actorId].equipmentCombat;return next;
}
