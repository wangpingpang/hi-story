import pack from '../../../content/professions/catalog.json';
import { requireValue } from '../../contracts/demo';
import { ABILITY_IDS, PROFESSION_SKILLS, PROFESSION_VERSION, type ProfessionAbility, type ProfessionCatalog, type ProfessionDefinition, type ProfessionPack, type ProfessionSkillDefinition } from './types';

const idOK=(s:unknown):s is string=>typeof s==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(s);
const textOK=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=4000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s);
const integer=(n:unknown,min:number,max:number)=>Number.isInteger(n)&&(n as number)>=min&&(n as number)<=max;
function deeplyFreeze<T>(v:T):T {if(v&&typeof v==='object'){Object.freeze(v);for(const x of Object.values(v))deeplyFreeze(x);}return v;}
export function createProfessionCatalog(input:unknown):ProfessionCatalog {
  requireValue(input&&typeof input==='object','INVALID_PROFESSION_CATALOG','职业目录必须是对象。');
  const p=structuredClone(input) as ProfessionPack;
  requireValue(p.version===PROFESSION_VERSION&&textOK(p.source)&&Array.isArray(p.classes)&&p.classes.length>=1&&p.classes.length<=64,'INVALID_PROFESSION_CATALOG','职业目录版本或数量无效。');
  const classes:Record<string,ProfessionDefinition>=Object.create(null),skills:Record<string,ProfessionSkillDefinition>=Object.create(null);
  for(const c of p.classes){
    requireValue(c&&idOK(c.id)&&!Object.hasOwn(classes,c.id)&&textOK(c.name)&&[6,8,10,12].includes(c.die)&&Array.isArray(c.skills)&&c.skills.length<=100&&Array.isArray(c.specs)&&c.specs.length<=12,'INVALID_PROFESSION_CATALOG','职业定义或编号重复。');
    requireValue(ABILITY_IDS.includes(c.skillAbility)&&ABILITY_IDS.includes(c.attackAbility)&&integer(c.weaponDie,2,12)&&integer(c.attackRange,1,12)&&typeof c.extraAttack==='boolean','INVALID_PROFESSION_CATALOG','职业计算配置无效。');
    requireValue(Array.isArray(c.prerequisites)&&c.prerequisites.length>0&&c.prerequisites.length<=6&&c.prerequisites.every(g=>Array.isArray(g)&&g.length>0&&g.length<=6&&g.every(a=>ABILITY_IDS.includes(a))),'INVALID_PROFESSION_CATALOG','兼职属性条件无效。');
    requireValue(Array.isArray(c.savingThrows)&&c.savingThrows.length===2&&new Set(c.savingThrows).size===2&&c.savingThrows.every(a=>ABILITY_IDS.includes(a)),'INVALID_PROFESSION_CATALOG','起始豁免无效。');
    requireValue([c.skillProficiencies,c.expertise].every(a=>Array.isArray(a)&&new Set(a).size===a.length&&a.every(s=>PROFESSION_SKILLS.includes(s)))&&c.expertise.every(s=>c.skillProficiencies.includes(s)),'INVALID_PROFESSION_CATALOG','职业技能熟练无效。');
    requireValue(Array.isArray(c.armorTraining)&&new Set(c.armorTraining).size===c.armorTraining.length&&c.armorTraining.every(a=>['light','medium','heavy','shield'].includes(a)),'INVALID_PROFESSION_CATALOG','护甲熟练无效。');
    requireValue(c.defaultScores&&ABILITY_IDS.every(a=>integer(c.defaultScores[a],3,20))&&Array.isArray(c.skillAbilityChoices)&&c.skillAbilityChoices.every(a=>a==='str'||a==='dex'),'INVALID_PROFESSION_CATALOG','默认属性与战技选项无效。');
    requireValue(Array.isArray(c.defenseFormulas)&&c.defenseFormulas.length<=8&&c.defenseFormulas.every(f=>integer(f.base,8,16)&&integer(f.level,1,12)&&Array.isArray(f.abilities)&&f.abilities.length<=2&&new Set(f.abilities).size===f.abilities.length&&f.abilities.every(a=>ABILITY_IDS.includes(a))&&(f.specializationId===undefined||c.specs.some(s=>s.id===f.specializationId))),'INVALID_PROFESSION_CATALOG','无甲防御公式无效。');
    requireValue(Array.isArray(c.damageDieProgression)&&c.damageDieProgression.length>=1&&c.damageDieProgression[0].level===1&&c.damageDieProgression.every((p,i)=>integer(p.level,1,12)&&integer(p.sides,2,12)&&(i===0||p.level>c.damageDieProgression[i-1].level)),'INVALID_PROFESSION_CATALOG','武器伤害成长无效。');
    requireValue(['en','group','color','motto','intro','resource','ability','strength','weakness','explore','social','story'].every(k=>textOK(c[k as keyof ProfessionDefinition]))&&Array.isArray(c.hooks)&&c.hooks.length===3&&c.hooks.every(textOK)&&Array.isArray(c.tips)&&c.tips.length>=4&&c.tips.every(textOK)&&Array.isArray(c.ratings)&&c.ratings.length===5&&c.ratings.every(n=>integer(n,1,5)),'INVALID_PROFESSION_CATALOG','职业攻略字段缺失。');
    classes[c.id]=c;const branches=new Set<string>();
    function addSkill(s:ProfessionSkillDefinition,branch:string|null):void {
      requireValue(s&&idOK(s.id)&&!Object.hasOwn(skills,s.id)&&s.classId===c.id&&s.branch===branch&&integer(s.level,1,12)&&integer(s.cost,0,3+Math.ceil(s.level/2)),'INVALID_PROFESSION_CATALOG','技能定义或引用无效。');
      requireValue(['name','type','action','range','check','duration','effect','failure','scaling','kind','components'].every(k=>textOK(s[k as keyof ProfessionSkillDefinition])),'INVALID_PROFESSION_CATALOG','技能字段不完整。');
      if(s.execution){const e=s.execution;requireValue(['attack','save','heal','unarmed'].includes(e.kind)&&integer(e.dice,1,10)&&integer(e.sides,2,12)&&integer(e.range,1,12)&&(e.kind!=='save'||ABILITY_IDS.includes(e.saveAbility as ProfessionAbility))&&(e.attacks===undefined||integer(e.attacks,1,2))&&(e.addAbility===undefined||typeof e.addAbility==='boolean')&&s.action==='主行动','INVALID_PROFESSION_CATALOG','技能执行配置无效。');}
      skills[s.id]=s;
    }
    for(const s of c.skills)addSkill(s,null);
    for(const s of c.specs){requireValue(s&&idOK(s.id)&&!branches.has(s.id)&&textOK(s.name)&&textOK(s.description)&&Array.isArray(s.skills)&&s.skills.length===3&&s.skills.map(x=>x.level).join(',')==='3,6,10'&&Array.isArray(s.armorTraining)&&s.armorTraining.every(a=>['light','medium','heavy','shield'].includes(a)),'INVALID_PROFESSION_CATALOG','专精定义无效。');branches.add(s.id);for(const a of s.skills)addSkill(a,s.id);}
  }
  requireValue(Object.keys(skills).length<=2048,'INVALID_PROFESSION_CATALOG','技能目录过大。');
  return deeplyFreeze({version:PROFESSION_VERSION,classes,skills});
}
export const professionCatalog=createProfessionCatalog(pack);
export function getProfession(id:string,catalog=professionCatalog):Readonly<ProfessionDefinition> {requireValue(Object.hasOwn(catalog.classes,id),'UNKNOWN_PROFESSION','未知职业。');return catalog.classes[id];}
export function getProfessionSkill(id:string,catalog=professionCatalog):Readonly<ProfessionSkillDefinition> {requireValue(Object.hasOwn(catalog.skills,id),'UNKNOWN_PROFESSION_SKILL','未知职业技能。');return catalog.skills[id];}
export const listProfessions=(catalog=professionCatalog)=>Object.values(catalog.classes);
