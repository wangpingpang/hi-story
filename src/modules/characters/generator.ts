import { freeze, type DeepReadonly } from '../../contracts';
import { generateAppearance, validateAppearance, type Appearance } from './appearance';
import { PROFILE_CATALOG, OCCUPATIONS, type OccupationId } from './profile-catalog';
import { assertSeed, seededRandom } from './random';

export const RANDOM_CHARACTER_VERSION = 'random-character/1' as const;
export type Gender = 'male' | 'female';
export interface CharacterGenerationOptions {
  control?: 'npc' | 'player';
  gender?: Gender;
  age?: number;
  occupationId?: OccupationId;
  name?: string;
  background?: string;
}
export interface GeneratedCharacter {
  version: typeof RANDOM_CHARACTER_VERSION;
  seed: string;
  actorId: string;
  control: 'npc' | 'player';
  name: string;
  gender: Gender;
  age: number;
  identity: { occupationId: OccupationId; occupation: string; expertise: string; background: string; backgroundSource: 'generated' | 'provided' };
  personality: { source: 'npc-initial' | 'choice-evidence'; traits: string[] };
  motivation: string;
  appearance: Appearance;
}
function text(value: unknown, max: number, field: string): asserts value is string {
  if(typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw Error(`${field}须为非空文本，长度不超过 ${max}，且不含控制字符`);
}
function profession(value: unknown): asserts value is OccupationId {
  if(typeof value !== 'string' || !Object.hasOwn(OCCUPATIONS,value)) throw Error('未知职业');
}
function validateOptions(options: CharacterGenerationOptions): void {
  if(!options || typeof options !== 'object' || Array.isArray(options)) throw Error('生成参数无效');
  if(Object.keys(options).some(key=>!['control','gender','age','occupationId','name','background'].includes(key))) throw Error('未知生成参数');
  if(options.control !== undefined && !['npc','player'].includes(options.control)) throw Error('控制类型无效');
  if(options.gender !== undefined && !['male','female'].includes(options.gender)) throw Error('性别无效');
  if(options.age !== undefined && (!Number.isInteger(options.age) || options.age<18 || options.age>70)) throw Error('年龄须为 18–70 岁的整数');
  if(options.occupationId !== undefined) profession(options.occupationId);
  if(options.name !== undefined) text(options.name,64,'姓名');
  if(options.background !== undefined) text(options.background,600,'背景');
}

export function generateCharacter(seed: string, options: CharacterGenerationOptions = {}): GeneratedCharacter {
  assertSeed(seed); validateOptions(options);
  const pick = <T>(field: string, values: readonly T[]): T => values[Math.floor(seededRandom(`${RANDOM_CHARACTER_VERSION}:${seed}:${field}`)()*values.length)];
  const gender = options.gender ?? pick('gender',['male','female'] as const);
  const control = options.control ?? 'npc';
  const occupationId = options.occupationId ?? pick('occupation',Object.keys(OCCUPATIONS) as OccupationId[]);
  const job = OCCUPATIONS[occupationId];
  const appearance = generateAppearance(seed);
  for(const slot of ['top','pants','shoes','accessory'] as const) appearance.parts[slot].styleId = pick(`wardrobe:${occupationId}:${slot}`,job.wardrobe[slot]);
  const result: GeneratedCharacter = {
    version: RANDOM_CHARACTER_VERSION, seed, actorId: `character:${seed}`, control,
    name: options.name ?? `${pick('given-name',gender==='female'?PROFILE_CATALOG.femaleNames:PROFILE_CATALOG.maleNames)}·${pick('surname',PROFILE_CATALOG.surnames)}`,
    gender, age: options.age ?? 18+Math.floor(seededRandom(`${RANDOM_CHARACTER_VERSION}:${seed}:age`)()*53),
    identity: { occupationId, occupation:job.label, expertise:job.expertise,
      background:options.background ?? `出身于${pick('origin',PROFILE_CATALOG.origins)}。${pick(`history:${occupationId}`,job.histories)}`,
      backgroundSource:options.background===undefined?'generated':'provided' },
    personality: { source:control==='npc'?'npc-initial':'choice-evidence', traits:control==='npc'?PROFILE_CATALOG.traits.map((axis,index)=>pick(`trait:${index}`,axis)):[] },
    motivation:pick(`motivation:${occupationId}`,job.motivations), appearance,
  };
  validateGeneratedCharacter(result);
  return result;
}
export function validateGeneratedCharacter(model: DeepReadonly<GeneratedCharacter>): void {
  if(!model || model.version!==RANDOM_CHARACTER_VERSION) throw Error('随机人物版本无效');
  assertSeed(model.seed);
  if(model.actorId!==`character:${model.seed}`) throw Error('人物编号与种子不一致');
  validateOptions({control:model.control,gender:model.gender,age:model.age,name:model.name,background:model.identity?.background,occupationId:model.identity?.occupationId});
  if(!['npc','player'].includes(model.control)||!['male','female'].includes(model.gender)||!Number.isInteger(model.age)) throw Error('人物字段缺失');
  profession(model.identity?.occupationId);
  text(model.name,64,'姓名'); text(model.identity.background,600,'背景'); text(model.motivation,600,'动机');
  const job=OCCUPATIONS[model.identity.occupationId];
  if(model.identity.occupation!==job.label || model.identity.expertise!==job.expertise || !['generated','provided'].includes(model.identity.backgroundSource)) throw Error('职业资料不一致');
  if(!model.personality || !Array.isArray(model.personality.traits)) throw Error('性格资料无效');
  if(model.control==='player') {
    if(model.personality.source!=='choice-evidence'||model.personality.traits.length) throw Error('玩家初始性格应等待选择证据');
  } else if(model.personality.source!=='npc-initial'||model.personality.traits.length!==3||PROFILE_CATALOG.traits.some((axis,index)=>!axis.some(value=>value===model.personality.traits[index]))) throw Error('NPC 初始性格无效');
  validateAppearance(model.appearance);
  if(model.appearance.seed!==model.seed) throw Error('外观与人物种子不一致');
}
export function generatedCharacterSnapshot(model: GeneratedCharacter): DeepReadonly<GeneratedCharacter> {
  validateGeneratedCharacter(model); return freeze(structuredClone(model));
}
