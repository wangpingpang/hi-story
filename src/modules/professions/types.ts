export const PROFESSION_VERSION = 'class-framework/1' as const;
export const ABILITY_IDS = ['str','dex','con','int','wis','cha'] as const;
export type ProfessionAbility = typeof ABILITY_IDS[number];
export type ProfessionAbilities = Record<ProfessionAbility,number>;
export const PROFESSION_SKILLS = ['athletics','acrobatics','sleight','stealth','arcana','history','investigation','nature','religion','animalHandling','insight','medicine','perception','survival','deception','intimidation','performance','persuasion'] as const;
export type ProfessionCheckSkill = typeof PROFESSION_SKILLS[number];
export type ArmorTraining = 'light'|'medium'|'heavy'|'shield';
export interface SkillExecution {
  kind:'attack'|'save'|'heal'|'unarmed';dice:number;sides:number;range:number;
  damageType?:string;saveAbility?:ProfessionAbility;addAbility?:boolean;attacks?:number;
}
export interface ProfessionSkillDefinition {
  id:string;classId:string;name:string;type:string;level:number;branch:string|null;
  action:string;cost:number;range:string;check:string;duration:string;effect:string;failure:string;scaling:string;
  kind:string;components:string;execution?:SkillExecution;
}
export interface SpecializationDefinition {id:string;name:string;description:string;skills:ProfessionSkillDefinition[];armorTraining:ArmorTraining[]}
export interface ProfessionDefinition {
  id:string;name:string;en:string;group:string;color:string;motto:string;intro:string;resource:string;
  ability:string;die:number;strength:string;weakness:string;explore:string;social:string;story:string;
  hooks:string[];tips:string[];ratings:number[];skills:ProfessionSkillDefinition[];specs:SpecializationDefinition[];
  skillAbility:ProfessionAbility;attackAbility:ProfessionAbility;prerequisites:ProfessionAbility[][];
  savingThrows:ProfessionAbility[];skillProficiencies:ProfessionCheckSkill[];expertise:ProfessionCheckSkill[];
  weaponDie:number;attackRange:number;armorTraining:ArmorTraining[];extraAttack:boolean;
  defaultScores:ProfessionAbilities;skillAbilityChoices:ProfessionAbility[];
  defenseFormulas:{base:number;abilities:ProfessionAbility[];level:number;specializationId?:string}[];
  damageDieProgression:{level:number;sides:number}[];
}
export interface ProfessionPack {version:typeof PROFESSION_VERSION;source:string;classes:ProfessionDefinition[]}
export interface ProfessionCatalog {
  readonly version:typeof PROFESSION_VERSION;
  readonly classes:Readonly<Record<string,Readonly<ProfessionDefinition>>>;
  readonly skills:Readonly<Record<string,Readonly<ProfessionSkillDefinition>>>;
}
export interface ProfessionLevel {classId:string;level:number;specializationId?:string;skillAbility?:'str'|'dex'}
/** Array order records the starting class; a resident may have an empty array. */
export interface ProfessionBuild {version:typeof PROFESSION_VERSION;classes:ProfessionLevel[]}
export interface ProfessionSetup {build:ProfessionBuild;abilities?:ProfessionAbilities}
export interface ProfessionDerived {
  totalLevel:number;proficiency:number;maxHp:number;unarmoredAC:number;attackBonus:number;
  attackAbility:ProfessionAbility;attackRange:number;damageDie:number;attacks:number;
  savingThrows:ProfessionAbility[];skillRanks:Partial<Record<ProfessionCheckSkill,1|2>>;
  armorTraining:ArmorTraining[];resourceMax:Record<string,number>;skillIds:string[];
}
/** Runtime owns these current values; the professions module only returns new values. */
export interface ProfessionRuntimeState {
  version:typeof PROFESSION_VERSION;build:ProfessionBuild;resources:Record<string,number>;shortRests:number;
}
