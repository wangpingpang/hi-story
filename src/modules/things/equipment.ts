import {record, requireValue} from '../../contracts/demo';
import {getEquipment, createEquipmentLoadout, EQUIPMENT_VERSION, EQUIPMENT_SLOTS, type EquipmentInstance, type EquipmentLoadout} from '../equipment/index';

export interface AdventureEquipmentInventory {
 version:'adventure-equipment/1';
 owned:EquipmentInstance[];
 loadout:EquipmentLoadout;
 grants:{sourceId:string;instanceId:string}[];
 sequence:number;
}
export function createAdventureEquipment():AdventureEquipmentInventory {
 return {version:'adventure-equipment/1',owned:[],loadout:createEquipmentLoadout(),grants:[],sequence:0};
}
export function validateAdventureEquipment(input:unknown):asserts input is AdventureEquipmentInventory {
 const s=record(input,['version','owned','loadout','grants','sequence']);
 requireValue(s.version==='adventure-equipment/1'&&Array.isArray(s.owned)&&s.owned.length<=500&&Array.isArray(s.grants)&&s.grants.length===s.owned.length&&s.sequence===s.owned.length,'INVALID_EQUIPMENT_INVENTORY','装备账本或版本无效。');
 const ids=new Set<string>();
 for(const raw of s.owned){const item=record(raw,['instanceId','definitionId']);requireValue(typeof item.instanceId==='string'&&/^gear:[1-9][0-9]{0,3}$/.test(item.instanceId)&&!ids.has(item.instanceId)&&typeof item.definitionId==='string','INVALID_EQUIPMENT_INVENTORY','装备实物编号无效或重复。');getEquipment(item.definitionId);ids.add(item.instanceId);}
 for(let n=1;n<=s.owned.length;n++)requireValue(ids.has(`gear:${n}`),'INVALID_EQUIPMENT_INVENTORY','装备实物序列不完整。');
 const sources=new Set<string>(),granted=new Set<string>();
 for(const raw of s.grants){const grant=record(raw,['sourceId','instanceId']);requireValue(typeof grant.sourceId==='string'&&grant.sourceId.length>0&&grant.sourceId.length<=400&&!/[\x00-\x1f]/.test(grant.sourceId)&&!sources.has(grant.sourceId)&&typeof grant.instanceId==='string'&&ids.has(grant.instanceId)&&!granted.has(grant.instanceId),'INVALID_EQUIPMENT_INVENTORY','装备来源账本无效或重复。');sources.add(grant.sourceId);granted.add(grant.instanceId);}
 const loadout=record(s.loadout,['version','slots']);requireValue(loadout.version===EQUIPMENT_VERSION,'INCOMPATIBLE_EQUIPMENT','穿戴版本无效。');
 const slots=record(loadout.slots,[...EQUIPMENT_SLOTS]),equipped=new Set<string>();
 for(const id of Object.values(slots)){requireValue(typeof id==='string'&&ids.has(id)&&!equipped.has(id),'INVALID_EQUIPMENT_INVENTORY','穿戴引用未拥有或重复的实物。');equipped.add(id);}
}
/** Mutates a lifecycle-owned candidate only; a source can grant exactly one item. */
export function grantAdventureEquipment(s:AdventureEquipmentInventory,definitionId:string,sourceId:string):{instance:EquipmentInstance;duplicate:boolean} {
 validateAdventureEquipment(s);getEquipment(definitionId);
 requireValue(typeof sourceId==='string'&&sourceId.length>0&&sourceId.length<=400&&!/[\x00-\x1f]/.test(sourceId),'INVALID_EQUIPMENT_SOURCE','装备来源无效。');
 const grant=s.grants.find(g=>g.sourceId===sourceId);
 if(grant){const instance=s.owned.find(i=>i.instanceId===grant.instanceId)!;requireValue(instance.definitionId===definitionId,'COMMAND_ID_CONFLICT','相同来源不能发放不同装备。');return {instance,duplicate:true};}
 requireValue(s.owned.length<500,'EQUIPMENT_INVENTORY_FULL','装备背包已满。');
 const instance={instanceId:`gear:${++s.sequence}`,definitionId};s.owned.push(instance);s.grants.push({sourceId,instanceId:instance.instanceId});return {instance,duplicate:false};
}
