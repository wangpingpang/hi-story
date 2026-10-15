import type {ProfessionBuild,ProfessionAbilities} from '../professions/index';
export const EQUIPMENT_VERSION='profession-equipment/1' as const;
export const EQUIPMENT_SLOTS=['body','mainHand','offHand','head','feet','neck','ringLeft','ringRight','waist'] as const;
export type EquipmentSlot=typeof EQUIPMENT_SLOTS[number];
export type EquipmentDirection='S'|'SE'|'E'|'NE'|'N'|'NW'|'W'|'SW';
export type WeaponFamily='unarmed'|'dagger'|'sword'|'greatsword'|'axe'|'mace'|'spear'|'bow'|'crossbow'|'staff';
export interface EquipmentDefinition {id:string;name:string;slot:EquipmentSlot;design:string;palette:string[];asset:{atlas:string;column:number;row:number;rect?:number[]};category:string;material:string;description:string;armor?:'none'|'light'|'medium'|'heavy'|'shield'|null;coverage?:'torso'|'full';paired?:boolean;weaponFamily?:WeaponFamily|null;hands?:number;damageDie?:number;range?:number;damageAbility?:'str'|'dex'|null;classId?:string;specializationId?:string}
export interface EquipmentSet {id:string;name:string;classId:string;specializationId:string;bodyId:string;weaponId:string;items:Partial<Record<EquipmentSlot,string>>;reason:string;style:string}
export interface EquipmentInstance {instanceId:string;definitionId:string}
export interface EquipmentLoadout {version:typeof EQUIPMENT_VERSION;slots:Partial<Record<EquipmentSlot,string>>}
export interface EquipmentContext {build:ProfessionBuild;abilities:ProfessionAbilities;owned:EquipmentInstance[]}
export interface BodyFit {heightCm:number;build:'slim'|'balanced'|'broad'|'stocky';shoulder:number;waist:number;limbs:number}
export interface FormVisibility {id:string;mode:'humanoid'|'meld'|'partial'|'retain';hiddenSlots?:EquipmentSlot[];equipmentLocked?:boolean}
export interface EquipmentRenderPiece {itemId:string;instanceId:string;slot:EquipmentSlot;atlas:string;source:[number,number,number,number];target:[number,number,number,number];secondaryTarget?:[number,number,number,number];rotation:number;layer:number;fit:'nine-slice'|'cloth'|'rigid'}
export interface EquipmentRenderPlan {version:'equipment-render/1';width:192;height:360;body:BodyFit;direction:EquipmentDirection;pieces:EquipmentRenderPiece[];hiddenBaseParts:string[];equipmentSuppressed:boolean;rig:{head:[number,number,number,number];torso:[number,number,number,number];legs:[number,number,number,number];feet:[number,number,number,number]}}
