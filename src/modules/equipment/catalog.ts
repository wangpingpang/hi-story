import data from '../../../content/equipment/catalog.json';
import {freeze} from '../../contracts';
import {requireValue} from '../../contracts/demo';
import {getProfession} from '../professions/index';
import {EQUIPMENT_VERSION,EQUIPMENT_SLOTS,type EquipmentDefinition,type EquipmentSet} from './types';
export const equipmentCatalog=freeze(data);
const items=new Map<string,EquipmentDefinition>();
for(const raw of data.items){const d=raw as EquipmentDefinition;requireValue(/^[a-z][a-z0-9-]{0,90}$/.test(d.id)&&!items.has(d.id)&&EQUIPMENT_SLOTS.includes(d.slot)&&d.design.length>15,'INVALID_EQUIPMENT_CATALOG','装备定义无效或重复。');const a=data.atlases.find(a=>a.id===d.asset.atlas);requireValue(a&&d.asset.column>=0&&d.asset.column<a.columns&&d.asset.row>=0&&d.asset.row<a.rows&&Array.isArray(d.asset.rect)&&d.asset.rect.length===4&&d.asset.rect.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&d.asset.rect[0]+d.asset.rect[2]<=1.00001&&d.asset.rect[1]+d.asset.rect[3]<=1.00001,'INVALID_EQUIPMENT_CATALOG','装备素材引用无效。');items.set(d.id,d);}
requireValue(data.version===EQUIPMENT_VERSION&&items.size===102&&data.sets.length===36,'INVALID_EQUIPMENT_CATALOG','装备目录版本或数量不符。');
for(const s of data.sets){const c=getProfession(s.classId);requireValue(c.specs.some(p=>p.id===s.specializationId)&&Object.values(s.items).every(id=>items.has(id)),'INVALID_EQUIPMENT_CATALOG','专精推荐装引用无效。');}
export const listEquipment=()=>[...items.values()];
export function getEquipment(id:string):Readonly<EquipmentDefinition>{const d=items.get(id);requireValue(d,'UNKNOWN_EQUIPMENT','未知装备。');return d;}
export const listEquipmentSets=(classId?:string):EquipmentSet[]=>data.sets.filter(s=>classId===undefined||s.classId===classId) as EquipmentSet[];
export function getEquipmentSet(id:string):Readonly<EquipmentSet>{const s=data.sets.find(s=>s.id===id);requireValue(s,'UNKNOWN_EQUIPMENT_SET','未知推荐套装。');return s as EquipmentSet;}
export function getEquipmentAtlas(id:string){const a=data.atlases.find(a=>a.id===id);requireValue(a,'UNKNOWN_EQUIPMENT_ATLAS','未知装备图集。');return a;}
