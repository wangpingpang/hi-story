import {canonical, requireValue} from '../contracts/demo';
import {getEquipment, getEquipmentAtlas, validateEquipmentLoadout, equipItem, unequipItem, deriveEquipmentCombat, EQUIPMENT_SLOTS, type EquipmentContext, type EquipmentDefinition, type EquipmentSlot} from '../modules/equipment';
import {createProfessionBuild} from '../modules/professions';
import {adventureCombatStats, adventureBasicAttack, setAdventureEquipmentCombat, canInteract, type EquipmentCombatProfile, type BasicAttackProfile} from '../modules/runtime';
import {grantAdventureEquipment, changeAdventureGold} from '../modules/things';
import type {AdventureSnapshot} from './adventure-application';

export const ADVENTURE_EQUIPMENT_SHOP=[
 {definitionId:'rogue-shadow-weapon',price:4},
 {definitionId:'fighter-guardian-weapon',price:5},
 {definitionId:'ranger-hunter-weapon',price:7},
 {definitionId:'wizard-evoker-weapon',price:5},
 {definitionId:'ranger-beast-body',price:4},
 {definitionId:'ranger-hunter-body',price:6},
 {definitionId:'fighter-guardian-body',price:8},
 {definitionId:'round-shield',price:3},
] as const;
export const EQUIPMENT_SLOT_LABELS:Record<EquipmentSlot,string>={body:'身体',mainHand:'主手',offHand:'副手',head:'头部',feet:'足部',neck:'项链',ringLeft:'左戒指',ringRight:'右戒指',waist:'腰部'};
export function adventureEquipmentContext(s:AdventureSnapshot):EquipmentContext {
 const a=s.runtime.actors[s.playerActorId];
 const classId=({warden:'paladin',ranger:'ranger',scholar:'wizard',envoy:'bard'} as const)[a.archetype];
 return {build:a.profession?.build??createProfessionBuild([{classId,level:1}],a.abilities),abilities:a.abilities,owned:s.things.equipment.owned};
}
export function deriveAdventureEquipment(s:AdventureSnapshot,loadout=s.things.equipment.loadout,context=adventureEquipmentContext(s)):EquipmentCombatProfile|undefined {
 validateEquipmentLoadout(loadout,context);if(!Object.keys(loadout.slots).length)return undefined;
 const a=s.runtime.actors[s.playerActorId],base=adventureCombatStats({...a,equipmentCombat:undefined}),derived=deriveEquipmentCombat(loadout,context);
 const definition=(slot:EquipmentSlot)=>{const item=context.owned.find(i=>i.instanceId===loadout.slots[slot]);return item?getEquipment(item.definitionId):undefined;};
 const body=definition('body'),shield=definition('offHand')?.armor==='shield',weapon=definition('mainHand');
 const usesArmorFormula=Boolean((body?.armor&&body.armor!=='none')||(a.profession&&shield));
 const defense=usesArmorFormula?derived.armorClass!:base.defense+(shield?2:0);
 return {...base,defense,...(weapon?{weapon:true,attackBonus:derived.weaponAttackBonus!,damageDie:derived.damageDie!,range:derived.range!,damageBonus:Math.floor((a.abilities[weapon.damageAbility??'str']-10)/2),minimum:0 as const}:{})};
}
export function validateAdventureEquipmentBinding(s:AdventureSnapshot):void {
 validateEquipmentLoadout(s.things.equipment.loadout,adventureEquipmentContext(s));
 const actual=s.runtime.actors[s.playerActorId].equipmentCombat,expected=deriveAdventureEquipment(s);
 requireValue(canonical(actual??null)===canonical(expected??null),'INVALID_EQUIPMENT_COMBAT','装备数值与穿戴或所有权不一致。');
 for(const actor of Object.values(s.runtime.actors))requireValue(actor.actorId===s.playerActorId||actor.equipmentCombat===undefined,'INVALID_EQUIPMENT_COMBAT','本版 NPC 尚未接入装备实例。');
}
export function changeAdventureLoadout(s:AdventureSnapshot,instanceId?:string,slot?:EquipmentSlot):void {
 requireValue(s.status==='active'&&s.runtime.encounter?.status!=='active','WAITING_RESULT','战斗中不能更换装备。');
 const context=adventureEquipmentContext(s);
 const next=instanceId?equipItem(s.things.equipment.loadout,context,instanceId,slot):unequipItem(s.things.equipment.loadout,context,slot!);
 const projection=deriveAdventureEquipment(s,next,context);
 s.runtime=setAdventureEquipmentCombat(s.runtime,s.playerActorId,projection);s.things.equipment.loadout=next;
}
export function equipmentShopPrice(s:AdventureSnapshot,price:number):number {const attitude=s.story.npcs.find(n=>n.id==='npc-1')?.attitude;return Math.max(1,price+(attitude==='hostile'?2:attitude==='friendly'?-1:0));}
export function equipmentShopReason(s:AdventureSnapshot):string {
 if(s.status==='ended')return '冒险已经结束。';if(s.runtime.encounter?.status==='active')return '战斗中不能购买或换装。';
 const market=s.runtime.map.anchors.find(a=>a.id==='market');if(!market||!canInteract(s.runtime,market.position))return '靠近商道营地后购买装备。';
 if(!s.story.npcs.find(n=>n.id==='npc-1')?.alive)return '营地医者已经离场，装备商店关闭。';return '';
}
export function buyAdventureEquipment(s:AdventureSnapshot,definitionId:string,commandId:string):void {
 const offer=ADVENTURE_EQUIPMENT_SHOP.find(o=>o.definitionId===definitionId);requireValue(offer,'INVALID_ITEM','该装备不在本次商店目录中。');
 requireValue(!equipmentShopReason(s),'OUT_OF_RANGE',equipmentShopReason(s));
 const sourceId=`purchase:${commandId}`,old=s.things.equipment.grants.find(g=>g.sourceId===sourceId);
 if(old){requireValue(s.things.equipment.owned.find(i=>i.instanceId===old.instanceId)?.definitionId===definitionId,'COMMAND_ID_CONFLICT','相同购买编号对应了不同装备。');return;}
 requireValue(s.things.equipment.owned.length<500,'EQUIPMENT_INVENTORY_FULL','装备背包已满。');
 const price=equipmentShopPrice(s,offer.price);changeAdventureGold(s.things,-price);grantAdventureEquipment(s.things.equipment,definitionId,sourceId);
 s.story.log.push({id:commandId,text:`花费${price}金币购买${getEquipment(definitionId).name}，已放入装备背包。`});
}
export interface EquipmentItemView {instanceId:string;definition:Readonly<EquipmentDefinition>;equippedSlot?:EquipmentSlot;reason:string;preview?:EquipmentCombatProfile;previewAttack?:BasicAttackProfile}
export interface AdventureEquipmentView {
 combat:EquipmentCombatProfile;base:EquipmentCombatProfile;basicAttack:BasicAttackProfile;slots:{id:EquipmentSlot;label:string;instanceId?:string;name?:string}[];
 owned:EquipmentItemView[];shop:{definition:Readonly<EquipmentDefinition>;price:number;reason:string;equipReason:string;preview?:EquipmentCombatProfile;previewAttack?:BasicAttackProfile}[];
 locked:boolean;shopReason:string;
}
export function adventureEquipmentView(s:AdventureSnapshot):AdventureEquipmentView {
 const a=s.runtime.actors[s.playerActorId],context=adventureEquipmentContext(s),loadout=s.things.equipment.loadout,locked=s.status!=='active',shopReason=equipmentShopReason(s);
 const preview=(instanceId:string,ctx=context)=>{try{const next=equipItem(loadout,ctx,instanceId),projection=deriveAdventureEquipment(s,next,ctx);return {reason:'',preview:projection??adventureCombatStats({...a,equipmentCombat:undefined}),previewAttack:adventureBasicAttack({...a,equipmentCombat:projection})};}catch(error){return {reason:error instanceof Error?error.message:'无法穿戴。'};}};
 return {combat:adventureCombatStats(a),base:adventureCombatStats({...a,equipmentCombat:undefined}),basicAttack:adventureBasicAttack(a),locked,shopReason,
 slots:EQUIPMENT_SLOTS.map(id=>({id,label:EQUIPMENT_SLOT_LABELS[id],...(loadout.slots[id]?{instanceId:loadout.slots[id],name:getEquipment(context.owned.find(i=>i.instanceId===loadout.slots[id])!.definitionId).name}:{})})),
 owned:context.owned.map(i=>({instanceId:i.instanceId,definition:getEquipment(i.definitionId),equippedSlot:EQUIPMENT_SLOTS.find(slot=>loadout.slots[slot]===i.instanceId),...preview(i.instanceId)})),
 shop:ADVENTURE_EQUIPMENT_SHOP.map(offer=>{const price=equipmentShopPrice(s,offer.price),p=preview('preview:shop',{...context,owned:[...context.owned,{instanceId:'preview:shop',definitionId:offer.definitionId}]});return {definition:getEquipment(offer.definitionId),price,reason:shopReason||(s.things.gold<price?'金币不足。':context.owned.length>=500?'装备背包已满。':''),equipReason:p.reason,preview:p.preview,previewAttack:p.previewAttack};})};
}
export {getEquipmentAtlas};
export type {EquipmentSlot, EquipmentCombatProfile};
