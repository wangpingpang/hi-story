import { record, requireValue } from '../../contracts/demo';
import { getProfession, getProfessionSkill, professionCatalog } from './catalog';
import { ABILITY_IDS, PROFESSION_VERSION, type ProfessionAbilities, type ProfessionBuild, type ProfessionCatalog, type ProfessionCheckSkill, type ProfessionDerived, type ProfessionLevel } from './types';

export const professionAbilityModifier=(score:number)=>{requireValue(Number.isInteger(score)&&score>=3&&score<=20,'INVALID_ABILITIES','属性须为3—20整数。');return Math.floor((score-10)/2);};
export function validateProfessionAbilities(scores:unknown):asserts scores is ProfessionAbilities {const a=record(scores,[...ABILITY_IDS]);requireValue(ABILITY_IDS.every(k=>Number.isInteger(a[k])&&(a[k] as number)>=3&&(a[k] as number)<=20),'INVALID_ABILITIES','必须提供完整六属性，范围3—20。');}
export const professionProficiency=(level:number)=>{requireValue(Number.isInteger(level)&&level>=0&&level<=12,'INVALID_LEVEL','总等级须为0—12。');return level===0?2:2+Math.floor((level-1)/4);};
export const professionResourceMax=(level:number)=>{requireValue(Number.isInteger(level)&&level>=1&&level<=12,'INVALID_LEVEL','职业等级须为1—12。');return 3+Math.ceil(level/2);};
export function validateProfessionBuild(input:unknown,scores:ProfessionAbilities,catalog=professionCatalog):asserts input is ProfessionBuild {
  validateProfessionAbilities(scores);const b=record(input,['version','classes']);
  requireValue(b.version===catalog.version&&Array.isArray(b.classes)&&b.classes.length<=2,'INVALID_PROFESSION_BUILD','职业版本不符或超过两个职业。');
  const seen=new Set<string>();let total=0;
  for(const raw of b.classes){const a=record(raw,['classId','level','specializationId','skillAbility']);requireValue(typeof a.classId==='string'&&!seen.has(a.classId),'INVALID_PROFESSION_BUILD','职业编号无效或重复。');const c=getProfession(a.classId,catalog);seen.add(c.id);
    requireValue(Number.isInteger(a.level)&&(a.level as number)>=1&&(a.level as number)<=12,'INVALID_LEVEL','职业等级须为1—12。');total+=a.level as number;
    requireValue(a.skillAbility===undefined||c.skillAbilityChoices.includes(a.skillAbility as 'str'|'dex'),'INVALID_PROFESSION_BUILD','该职业不支持所选战技属性。');
    requireValue((a.level as number)<3?a.specializationId===undefined:typeof a.specializationId==='string'&&c.specs.some(s=>s.id===a.specializationId),'INVALID_SPECIALIZATION','3级起须选择本职业的一条专精，低于3级不可提前选择。');
  }
  requireValue(total<=12,'LEVEL_CAP','角色总等级不能超过12。');
  if(b.classes.length===2)for(const raw of b.classes as ProfessionLevel[]){const c=getProfession(raw.classId,catalog);requireValue(c.prerequisites.every(g=>g.some(k=>scores[k]>=13)),'MULTICLASS_REQUIREMENT','兼职必须满足新旧职业的全部属性门槛。');}
}
export function createProfessionBuild(classes:ProfessionLevel[],scores:ProfessionAbilities,catalog=professionCatalog):ProfessionBuild {const b={version:PROFESSION_VERSION,classes:structuredClone(classes)};validateProfessionBuild(b,scores,catalog);return b;}
export function availableProfessionSkills(build:ProfessionBuild,scores:ProfessionAbilities,catalog=professionCatalog){validateProfessionBuild(build,scores,catalog);return build.classes.flatMap(p=>{const c=getProfession(p.classId,catalog);return c.skills.concat(c.specs.find(s=>s.id===p.specializationId)?.skills??[]).filter(s=>s.level<=p.level);});}
export function deriveProfession(build:ProfessionBuild,scores:ProfessionAbilities,catalog=professionCatalog):ProfessionDerived {
  validateProfessionBuild(build,scores,catalog);const totalLevel=build.classes.reduce((n,c)=>n+c.level,0),proficiency=professionProficiency(totalLevel),con=professionAbilityModifier(scores.con),dex=professionAbilityModifier(scores.dex);
  const first=build.classes[0],base=first?getProfession(first.classId,catalog):undefined;
  let maxHp=base?Math.max(1,base.die+con):Math.max(1,4+con);const resourceMax:Record<string,number>={};const ranks:Partial<Record<ProfessionCheckSkill,1|2>>={};const armor=new Set<ProfessionDerived['armorTraining'][number]>();
  for(const [i,p]of build.classes.entries()){const c=getProfession(p.classId,catalog);maxHp+=(p.level-(i===0?1:0))*Math.max(1,c.die/2+1+con);resourceMax[c.id]=professionResourceMax(p.level);for(const s of c.skillProficiencies)ranks[s]=Math.max(ranks[s]??0,1) as 1|2;if(p.level>=2)for(const s of c.expertise)ranks[s]=2;for(const a of c.armorTraining)if(i===0||a!=='heavy')armor.add(a);}
  // Unarmored formulas are alternatives, not additive bonuses. Equipment lives elsewhere.
  let unarmoredAC=10+dex;
  for(const p of build.classes){const c=getProfession(p.classId,catalog);for(const f of c.defenseFormulas)if(p.level>=f.level&&(!f.specializationId||f.specializationId===p.specializationId))unarmoredAC=Math.max(unarmoredAC,f.base+f.abilities.reduce((n,a)=>n+professionAbilityModifier(scores[a]),0));for(const a of c.specs.find(s=>s.id===p.specializationId)?.armorTraining??[])armor.add(a);}
  const attackAbility=first?.skillAbility??base?.attackAbility??'str';
  const damageDie=base&&first?base.damageDieProgression.filter(p=>p.level<=first.level).at(-1)!.sides:4;
  return {totalLevel,proficiency,maxHp,unarmoredAC,attackBonus:proficiency+professionAbilityModifier(scores[attackAbility]),attackAbility,attackRange:base?.attackRange??1,damageDie,attacks:build.classes.some(p=>getProfession(p.classId,catalog).extraAttack&&p.level>=5)?2:1,savingThrows:[...(base?.savingThrows??[])],skillRanks:ranks,armorTraining:[...armor],resourceMax,skillIds:availableProfessionSkills(build,scores,catalog).map(s=>s.id)};
}
export function advanceProfession(build:ProfessionBuild,scores:ProfessionAbilities,classId:string,specializationId?:string,catalog=professionCatalog):ProfessionBuild {
  validateProfessionBuild(build,scores,catalog);getProfession(classId,catalog);const next=structuredClone(build),level=next.classes.find(c=>c.classId===classId);
  if(level){level.level++;if(specializationId!==undefined){requireValue(level.level===3,'INVALID_SPECIALIZATION','只能在达到职业3级时选择专精。');level.specializationId=specializationId;}}
  else {next.classes.push({classId,level:1});requireValue(specializationId===undefined,'INVALID_SPECIALIZATION','新职业1级不能选择专精。');}
  validateProfessionBuild(next,scores,catalog);return next;
}
export function professionSkillAccess(build:ProfessionBuild,scores:ProfessionAbilities,skillId:string,catalog=professionCatalog):{learned:boolean;executable:boolean;reason:string}{
  validateProfessionBuild(build,scores,catalog);const skill=getProfessionSkill(skillId,catalog),p=build.classes.find(c=>c.classId===skill.classId);
  if(!p)return {learned:false,executable:false,reason:'尚未学习该职业。'};
  if(p.level<skill.level)return {learned:false,executable:false,reason:`需要本职业${skill.level}级。`};
  if(skill.branch&&p.specializationId!==skill.branch)return {learned:false,executable:false,reason:'未选择对应专精。'};
  return {learned:true,executable:Boolean(skill.execution),reason:skill.execution?'':'技能执行尚未接入；目录仅提供规则定义。'};
}
export function defaultProfessionAbilities(classId?:string,catalog=professionCatalog):ProfessionAbilities {return classId?structuredClone(getProfession(classId,catalog).defaultScores):{str:10,dex:10,con:10,int:10,wis:10,cha:10};}
