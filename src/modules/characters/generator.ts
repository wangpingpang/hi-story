import { freeze, type DeepReadonly } from '../../contracts';
import { generateAppearance, validateAppearance, appearanceCatalogFor, setAppearancePart, type Appearance, type AppearanceVersion, type AppearancePart, type AppearanceSlot } from './appearance';
import { PROFILE_CATALOG, OCCUPATIONS, type OccupationId } from './profile-catalog';
import { assertSeed, seededRandom } from './random';
import { WARDROBES_V3 } from './wardrobes-v3';

export const RANDOM_CHARACTER_VERSION = 'random-character/1' as const;
export type Gender = 'male' | 'female';
export interface CharacterGenerationOptions {
  control?: 'npc' | 'player';
  gender?: Gender;
  age?: number;
  occupationId?: OccupationId;
  name?: string;
  background?: string;
  occupation?: string;
  expertise?: string;
  motivation?: string;
  personality?: { traits?: readonly string[]; parameters?: Readonly<Record<string,number>> };
  preferences?: { likes?: readonly string[]; dislikes?: readonly string[] };
  appearanceVersion?: AppearanceVersion;
  appearanceParts?: Partial<Record<AppearanceSlot, Partial<AppearancePart>>>;
}
export interface CharacterGenerationParams extends CharacterGenerationOptions { seed: string }
export interface GeneratedCharacter {
  version: typeof RANDOM_CHARACTER_VERSION;
  seed: string;
  actorId: string;
  control: 'npc' | 'player';
  name: string;
  gender: Gender;
  age: number;
  identity: { occupationId: OccupationId | 'custom'; occupation: string; expertise: string; background: string; backgroundSource: 'generated' | 'provided' };
  personality: { source: 'npc-initial' | 'story-input' | 'choice-evidence'; traits: string[]; parameters?: Record<string,number> };
  preferences?: { source: 'generated' | 'provided'; likes: string[]; dislikes: string[] };
  motivation: string;
  appearance: Appearance;
}
function text(value: unknown, max: number, field: string): asserts value is string {
  if(typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw Error(`${field}须为非空文本，长度不超过 ${max}，且不含控制字符`);
}
function profession(value: unknown): asserts value is OccupationId {
  if(typeof value !== 'string' || !Object.hasOwn(OCCUPATIONS,value)) throw Error('未知职业');
}
function textList(value: unknown, field: string): asserts value is string[] {
  if(!Array.isArray(value)||value.length>8)throw Error(`${field}须为最多 8 项的数组`);
  for(const item of value)text(item,64,field);
  if(new Set(value.map(item=>item.trim())).size!==value.length)throw Error(`${field}不能包含重复项`);
}
function personalityParameters(value: unknown): asserts value is Record<string,number> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>16)throw Error('性格参数须为最多 16 项的数值对象');
  for(const [key,number] of Object.entries(value)){
    text(key,32,'性格参数名');
    if(['__proto__','constructor','prototype'].includes(key)||typeof number!=='number'||!Number.isFinite(number)||number<0||number>1)throw Error('性格参数值须为 0–1 的有限数');
  }
}
function preferenceLists(likes: readonly string[], dislikes: readonly string[]) {
  textList(likes,'喜好');textList(dislikes,'厌恶');
  if(likes.some(item=>dislikes.some(other=>other.trim()===item.trim())))throw Error('同一偏好不能同时列入喜好与厌恶');
}
function validateOptions(options: CharacterGenerationOptions): void {
  if(!options || typeof options !== 'object' || Array.isArray(options)) throw Error('生成参数无效');
  if(Object.keys(options).some(key=>!['control','gender','age','occupationId','name','background','occupation','expertise','motivation','personality','preferences','appearanceVersion','appearanceParts'].includes(key))) throw Error('未知生成参数');
  if(options.control !== undefined && !['npc','player'].includes(options.control)) throw Error('控制类型无效');
  if(options.gender !== undefined && !['male','female'].includes(options.gender)) throw Error('性别无效');
  if(options.age !== undefined && (!Number.isInteger(options.age) || options.age<18 || options.age>70)) throw Error('年龄须为 18–70 岁的整数');
  if(options.occupationId !== undefined) profession(options.occupationId);
  if(options.name !== undefined) text(options.name,64,'姓名');
  if(options.background !== undefined) text(options.background,600,'背景');
  if(options.occupation !== undefined) {text(options.occupation,64,'职业');if(options.occupationId!==undefined)throw Error('自定义职业与职业编号不能同时指定');}
  if(options.expertise !== undefined) text(options.expertise,120,'专长');
  if(options.motivation !== undefined) text(options.motivation,600,'动机');
  if(options.personality!==undefined) {
    if(!options.personality||typeof options.personality!=='object'||Array.isArray(options.personality)||Object.keys(options.personality).some(key=>!['traits','parameters'].includes(key)))throw Error('性格参数无效');
    if(options.personality.traits!==undefined)textList(options.personality.traits,'性格');
    if(options.personality.parameters!==undefined)personalityParameters(options.personality.parameters);
    if(options.control==='player')throw Error('玩家初始性格应等待选择证据');
  }
  if(options.preferences!==undefined){
    if(!options.preferences||typeof options.preferences!=='object'||Array.isArray(options.preferences)||Object.keys(options.preferences).some(key=>!['likes','dislikes'].includes(key)))throw Error('偏好参数无效');
    preferenceLists(options.preferences.likes===undefined?[]:options.preferences.likes,options.preferences.dislikes===undefined?[]:options.preferences.dislikes);
  }
  if(options.appearanceVersion!==undefined)appearanceCatalogFor(options.appearanceVersion);
  if(options.appearanceParts!==undefined && (!options.appearanceParts||typeof options.appearanceParts!=='object'||Array.isArray(options.appearanceParts)))throw Error('外观参数无效');
}

export function generateCharacter(seed: string, options: CharacterGenerationOptions = {}): GeneratedCharacter {
  assertSeed(seed); validateOptions(options);
  const pick = <T>(field: string, values: readonly T[]): T => values[Math.floor(seededRandom(`${RANDOM_CHARACTER_VERSION}:${seed}:${field}`)()*values.length)];
  const gender = options.gender ?? pick('gender',['male','female'] as const);
  const control = options.control ?? 'npc';
  const occupationId = options.occupation!==undefined?'custom':options.occupationId ?? pick('occupation',Object.keys(OCCUPATIONS) as OccupationId[]);
  const job = occupationId==='custom'?{label:options.occupation!,expertise:'尚无专长记录',histories:[`职业设定为${options.occupation}，过往经历尚待补全。`],motivations:['希望找到适合自己的下一段旅程。'],wardrobe:OCCUPATIONS.courier.wardrobe}:OCCUPATIONS[occupationId];
  let appearance = generateAppearance(seed,options.appearanceVersion??'appearance/1');
  for(const slot of ['top','pants','shoes','accessory'] as const) {
    const pool=appearance.version==='appearance/3'?(occupationId==='custom'?appearanceCatalogFor(appearance.version)[slot].styles.map(s=>s.id):WARDROBES_V3[occupationId][slot]):job.wardrobe[slot];
    appearance.parts[slot].styleId=pick(`wardrobe:${occupationId}:${slot}`,pool);
  }
  for(const [key,override] of Object.entries(options.appearanceParts??{})){
    if(!Object.hasOwn(appearance.parts,key)||!override||typeof override!=='object'||Array.isArray(override)||Object.keys(override).some(field=>!['styleId','color'].includes(field)))throw Error('外观部件参数无效');
    const slot=key as AppearanceSlot;appearance=setAppearancePart(appearance,slot,{...appearance.parts[slot],...override});
  }
  const result: GeneratedCharacter = {
    version: RANDOM_CHARACTER_VERSION, seed, actorId: `character:${seed}`, control,
    name: options.name ?? `${pick('given-name',gender==='female'?PROFILE_CATALOG.femaleNames:PROFILE_CATALOG.maleNames)}·${pick('surname',PROFILE_CATALOG.surnames)}`,
    gender, age: options.age ?? 18+Math.floor(seededRandom(`${RANDOM_CHARACTER_VERSION}:${seed}:age`)()*53),
    identity: { occupationId, occupation:job.label, expertise:options.expertise??job.expertise,
      background:options.background ?? `出身于${pick('origin',PROFILE_CATALOG.origins)}。${pick(`history:${occupationId}`,job.histories)}`,
      backgroundSource:options.background===undefined?'generated':'provided' },
    personality: { source:control==='player'?'choice-evidence':options.personality?'story-input':'npc-initial', traits:control==='player'?[]:options.personality?[...(options.personality.traits??[])]:PROFILE_CATALOG.traits.map((axis,index)=>pick(`trait:${index}`,axis)),...(options.personality?{parameters:{...(options.personality.parameters??{})}}:{}) },
    preferences:options.preferences?{source:'provided',likes:[...(options.preferences.likes??[])],dislikes:[...(options.preferences.dislikes??[])]}:{source:'generated',likes:control==='player'?[]:[pick('likes',['热汤','安静的营地','旅行见闻','旧书','手工制品','可靠的约定'])],dislikes:control==='player'?[]:[pick('dislikes',['欺骗','浪费食物','无故失约','粗暴待人','打扰休息','轻视劳动'])]},
    motivation:options.motivation??pick(`motivation:${occupationId}`,job.motivations), appearance,
  };
  validateGeneratedCharacter(result);
  return result;
}
export function generateCharacterWithParams(params: CharacterGenerationParams): GeneratedCharacter {
  if(!params||typeof params!=='object'||Array.isArray(params))throw Error('带参生成人物参数无效');
  const {seed,appearanceVersion,...options}=params;
  return generateCharacter(seed,{...options,appearanceVersion:appearanceVersion??'appearance/2'});
}
export function validateGeneratedCharacter(model: DeepReadonly<GeneratedCharacter>): void {
  if(!model || model.version!==RANDOM_CHARACTER_VERSION) throw Error('随机人物版本无效');
  assertSeed(model.seed);
  if(model.actorId!==`character:${model.seed}`) throw Error('人物编号与种子不一致');
  validateOptions({control:model.control,gender:model.gender,age:model.age,name:model.name,background:model.identity?.background,...(model.identity?.occupationId==='custom'?{occupation:model.identity.occupation}:{occupationId:model.identity?.occupationId})});
  if(!['npc','player'].includes(model.control)||!['male','female'].includes(model.gender)||!Number.isInteger(model.age)) throw Error('人物字段缺失');
  if(model.identity?.occupationId!=='custom')profession(model.identity?.occupationId);
  text(model.name,64,'姓名'); text(model.identity.background,600,'背景'); text(model.motivation,600,'动机');
  text(model.identity.occupation,64,'职业');text(model.identity.expertise,120,'专长');
  if((model.identity.occupationId!=='custom'&&model.identity.occupation!==OCCUPATIONS[model.identity.occupationId].label) || !['generated','provided'].includes(model.identity.backgroundSource)) throw Error('职业资料不一致');
  if(!model.personality || !Array.isArray(model.personality.traits)) throw Error('性格资料无效');
  if(model.control==='player') {
    if(model.personality.source!=='choice-evidence'||model.personality.traits.length) throw Error('玩家初始性格应等待选择证据');
  } else if(model.personality.source==='story-input')textList(model.personality.traits,'性格');
  else if(model.personality.source!=='npc-initial'||model.personality.traits.length!==3||PROFILE_CATALOG.traits.some((axis,index)=>!axis.some(value=>value===model.personality.traits[index]))) throw Error('NPC 初始性格无效');
  if(model.personality.parameters!==undefined){if(model.control==='player'&&Object.keys(model.personality.parameters).length)throw Error('玩家初始性格应等待选择证据');personalityParameters(model.personality.parameters);}
  if(model.preferences!==undefined){
    if(!model.preferences||!['provided','generated'].includes(model.preferences.source))throw Error('偏好资料无效');
    preferenceLists(model.preferences.likes,model.preferences.dislikes);
  }
  validateAppearance(model.appearance);
  if(model.appearance.seed!==model.seed) throw Error('外观与人物种子不一致');
}
export function generatedCharacterSnapshot(model: GeneratedCharacter): DeepReadonly<GeneratedCharacter> {
  validateGeneratedCharacter(model); return freeze(structuredClone(model));
}
