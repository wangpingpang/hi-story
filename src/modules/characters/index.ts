import { freeze, type DeepReadonly } from '../../contracts';
import { generateAppearance, validateAppearance, type Appearance } from './appearance';
export { APPEARANCE_VERSION, LATEST_APPEARANCE_VERSION, APPEARANCE_SLOTS, APPEARANCE_CATALOG, APPEARANCE_CATALOG_V2, APPEARANCE_CATALOG_V3, appearanceCatalogFor, generateAppearance, validateAppearance, rerollAppearance, rerollAppearancePart, setAppearancePart } from './appearance';
export type { Appearance, AppearancePart, AppearanceSlot, AppearanceVersion } from './appearance';
export { RANDOM_CHARACTER_VERSION, generateCharacter, generateCharacterWithParams, validateGeneratedCharacter, generatedCharacterSnapshot } from './generator';
export type { GeneratedCharacter, CharacterGenerationOptions, CharacterGenerationParams, Gender } from './generator';
export { PROFILE_CATALOG, OCCUPATIONS } from './profile-catalog';
export type { OccupationId } from './profile-catalog';
export { ANIMATION_VERSION, ACTIONS, DIRECTIONS, DIRECTION_VECTORS, WEAPONS, SPELLS, createAnimation, advanceAnimation, requestAnimation, animationProgress, validateVitals } from './animation';
export type { Action, Direction, Weapon, Spell, VisualVitals, AnimationState, MotionEvent } from './animation';
export { EXPRESSIONS, ENVIRONMENTS, ACTOR_STATUSES, DIALOGUE_TONES, resolveExpression, validateExpressionSignals } from './expression';
export type { Expression, ExpressionSignals, ExpressionResult } from './expression';

export type CharacterId = 'courier' | 'luyan';
export type Condition = 'ready' | 'exerted';
export interface Character {
 actorId: CharacterId;
 name: string;
 control: 'player' | 'npc';
 identity: { occupation: string; background: string; expertise: string };
 appearance: Appearance;
 condition: Condition;
 changes: { from: Condition; to: Condition; sourceEventId: string }[];
}
export type Roster = Record<CharacterId, Character>;
export const MODEL_VERSION = 'characters/2';
export function create(seed = 'fog-bridge'): Roster {
 return {
  courier: { actorId:'courier', name:'沈青', control:'player', identity:{occupation:'递信人',background:'这一程受托将封好的信送往河岸驿站。',expertise:'递信与凭证核验'},appearance:generateAppearance(`${seed}:courier`),condition:'ready',changes:[] },
  luyan: { actorId:'luyan', name:'陆砚', control:'npc', identity:{occupation:'渡口搬运人',background:'正在旧渡口将木箱搬向棚屋，能按自己的节奏安全完成。',expertise:'搬运与渡口路径'},appearance:generateAppearance(`${seed}:luyan`),condition:'ready',changes:[] }
 };
}
export function validate(roster: Roster): void {
 for(const id of ['courier','luyan'] as const){
  const c=roster[id];
  if(!c || c.actorId!==id || c.control!==(id==='courier'?'player':'npc'))throw Error('人物身份或控制类型无效');
  if(![c.name,c.identity?.occupation,c.identity?.background,c.identity?.expertise].every(v=>typeof v==='string'&&v.trim()))throw Error('人物资料不完整');
  validateAppearance(c.appearance);
  if(!['ready','exerted'].includes(c.condition)||!Array.isArray(c.changes))throw Error('人物状态无效');
  let previous:Condition='ready';
  const events=new Set<string>();
  for(const change of c.changes){
   if(change.from!==previous || change.to!=='exerted' || change.from===change.to || typeof change.sourceEventId!=='string' || !change.sourceEventId.trim() || events.has(change.sourceEventId))throw Error('人物状态来源无效');
   previous=change.to;events.add(change.sourceEventId);
  }
  if(previous!==c.condition)throw Error('人物状态与变化记录不一致');
 }
 if(Object.keys(roster).length!==2)throw Error('未知人物');
}
// Only application supplies a validated, committed-in-the-same-transaction event reference.
export function exert(roster:Roster,id:CharacterId,sourceEventId:string):Roster {
 validate(roster);
 if(!Object.hasOwn(roster,id)||!sourceEventId.trim())throw Error('人物或事件无效');
 const next=structuredClone(roster),c=next[id];
 if(c.condition==='ready'){
  c.changes.push({from:c.condition,to:'exerted',sourceEventId});c.condition='exerted';
 }
 validate(next);return next;
}
export function snapshot(roster:Roster):DeepReadonly<Roster>{validate(roster);return freeze(structuredClone(roster));}
