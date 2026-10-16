import { freeze, type DeepReadonly } from '../../contracts';
import {
  ACTIONS, DIRECTIONS, WEAPONS, SPELLS, EXPRESSIONS, validateAppearance,
  type Appearance, type Gender, type Action, type Direction, type Weapon, type Spell, type Expression,
} from '../characters';

export const CHARACTER_VISUAL_VERSION = 'character-visual/1' as const;

/** A structural view of any actor. Identity, profession and gameplay state stay with their owner. */
export interface VisualActor {
  actorId: string;
  gender: Gender;
  appearance: DeepReadonly<Appearance>;
}
export interface VisualPose {
  action: Action;
  direction: Direction;
  progress: number;
  weapon: Weapon;
  spell: Spell;
  expression: Expression;
}
export interface CharacterVisualFrame {
  version: typeof CHARACTER_VISUAL_VERSION;
  actor: VisualActor;
  pose: VisualPose;
}

export function validateCharacterVisualFrame(frame: DeepReadonly<CharacterVisualFrame>): void {
  if (!frame || frame.version !== CHARACTER_VISUAL_VERSION) throw Error('人物显示协议版本无效');
  const actor = frame.actor, pose = frame.pose;
  if (!actor || typeof actor.actorId !== 'string' || !actor.actorId.trim() || actor.actorId.length > 256 || /[\x00-\x1f\x7f]/.test(actor.actorId)) throw Error('显示人物编号无效');
  if (!['male', 'female'].includes(actor.gender)) throw Error('显示人物身体类型无效');
  validateAppearance(actor.appearance);
  if (!pose || !Object.hasOwn(ACTIONS, pose.action) || !DIRECTIONS.includes(pose.direction) || !WEAPONS.includes(pose.weapon) || !SPELLS.includes(pose.spell) || !Object.hasOwn(EXPRESSIONS, pose.expression)) throw Error('显示人物姿势无效');
  if (!Number.isFinite(pose.progress) || pose.progress < 0 || pose.progress > 1) throw Error('显示人物动作进度须为 0–1');
}

/** GeneratedCharacter, player records, or runner projections can all supply this same minimal shape. */
export function createCharacterVisualFrame<T extends VisualActor>(actor: DeepReadonly<T>, pose: Partial<VisualPose> = {}): DeepReadonly<CharacterVisualFrame> {
  if (!pose || typeof pose !== 'object' || Array.isArray(pose)) throw Error('显示人物姿势无效');
  const frame: CharacterVisualFrame = {
    version: CHARACTER_VISUAL_VERSION,
    actor: { actorId: actor?.actorId, gender: actor?.gender, appearance: structuredClone(actor?.appearance) },
    pose: {
      action: Object.hasOwn(pose, 'action') ? pose.action! : 'stand',
      direction: Object.hasOwn(pose, 'direction') ? pose.direction! : 'S',
      progress: Object.hasOwn(pose, 'progress') ? pose.progress! : 0,
      weapon: Object.hasOwn(pose, 'weapon') ? pose.weapon! : 'unarmed',
      spell: Object.hasOwn(pose, 'spell') ? pose.spell! : 'arcane',
      expression: Object.hasOwn(pose, 'expression') ? pose.expression! : 'neutral',
    },
  };
  validateCharacterVisualFrame(frame);
  return freeze(frame);
}

export type { Appearance, Gender, Action, Direction, Weapon, Spell, Expression };
