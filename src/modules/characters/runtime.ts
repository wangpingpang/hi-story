import { requireRuntime, runtimeId, runtimeInteger } from '../../contracts';
export const ATTRIBUTE_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
export type AttributeName = typeof ATTRIBUTE_NAMES[number];
export type Attributes = Record<AttributeName, number>;
export type RuntimeStatus = 'stunned' | 'rooted';
export interface RuntimeActor {
  actorId: string; name: string; control: 'player' | 'npc';
  teamId: string; maxHp: number; hp: number; attributes: Attributes;
  armorClass: number; speed: number; attackBonus: number; attackRange: number;
  damage: { count: number; sides: number; bonus: number };
  statuses: RuntimeStatus[];
}
export interface ActorRuntime { actors: RuntimeActor[] }
export type ActorSource = Pick<RuntimeActor, 'actorId' | 'name' | 'control'>;
export interface ActorRuntimeOptions {
  teamId?: string; maxHp?: number; hp?: number; attributes?: Partial<Attributes>;
  armorClass?: number; speed?: number; attackBonus?: number; attackRange?: number;
  damage?: { count: number; sides: number; bonus: number }; statuses?: RuntimeStatus[];
}
export const attributeModifier = (score: number) => { runtimeInteger(score, 1, 30, '属性'); return Math.floor((score - 10) / 2); };
export function runtimeActor(state: ActorRuntime, actorId: string): RuntimeActor {
  const actor = state.actors.find(a => a.actorId === actorId); requireRuntime(actor, 'INVALID_TARGET', '运行人物不存在'); return actor;
}
export function registerActor(state: ActorRuntime, source: ActorSource, options: ActorRuntimeOptions = {}): ActorRuntime {
  runtimeId(source.actorId); runtimeId(source.name, '姓名');
  requireRuntime(['player', 'npc'].includes(source.control), 'INVALID_INPUT', '人物控制类型无效');
  requireRuntime(!state.actors.some(a => a.actorId === source.actorId), 'DUPLICATE_ID', '运行人物编号重复');
  requireRuntime(!Object.keys(options).some(k => !['teamId','maxHp','hp','attributes','armorClass','speed','attackBonus','attackRange','damage','statuses'].includes(k)), 'INVALID_INPUT', '未知人物运行参数');
  requireRuntime(!Object.keys(options.attributes ?? {}).some(k => !(ATTRIBUTE_NAMES as readonly string[]).includes(k)), 'INVALID_INPUT', '未知属性');
  const attributes = Object.fromEntries(ATTRIBUTE_NAMES.map(k => [k, options.attributes?.[k] ?? 10])) as Attributes;
  ATTRIBUTE_NAMES.forEach(k => runtimeInteger(attributes[k], 1, 30, k));
  const str = attributeModifier(attributes.strength), dex = attributeModifier(attributes.dexterity), con = attributeModifier(attributes.constitution);
  const maxHp = options.maxHp ?? Math.max(1, 10 + con);
  const actor: RuntimeActor = { actorId: source.actorId, name: source.name, control: source.control,
    teamId: options.teamId ?? (source.control === 'player' ? 'player' : 'neutral'),
    maxHp, hp: options.hp ?? maxHp, attributes, armorClass: options.armorClass ?? 10 + dex,
    speed: options.speed ?? 3, attackBonus: options.attackBonus ?? str, attackRange: options.attackRange ?? 1,
    damage: structuredClone(options.damage ?? { count: 1, sides: 6, bonus: str }), statuses: [...(options.statuses ?? [])] };
  runtimeId(actor.teamId, '队伍编号'); runtimeInteger(actor.maxHp, 1, 100000, '最大生命'); runtimeInteger(actor.hp, 0, actor.maxHp, '生命');
  runtimeInteger(actor.armorClass, 1, 1000, '护甲'); runtimeInteger(actor.speed, 0, 256, '移动力');
  runtimeInteger(actor.attackBonus, -1000, 1000, '命中加值'); runtimeInteger(actor.attackRange, 1, 32, '攻击距离');
  runtimeInteger(actor.damage.count, 1, 100, '伤害骰个数'); runtimeInteger(actor.damage.sides, 2, 1000, '伤害骰面数'); runtimeInteger(actor.damage.bonus, -1000, 1000, '伤害加值');
  requireRuntime(new Set(actor.statuses).size === actor.statuses.length && actor.statuses.every(s => ['stunned', 'rooted'].includes(s)), 'INVALID_INPUT', '人物状态无效');
  const next = structuredClone(state); next.actors.push(actor); return next;
}
export function assertActorCanAct(actor: RuntimeActor, action: 'move' | 'attack' | 'interact' | 'check'): void {
  requireRuntime(actor.hp > 0, 'ACTOR_DEAD', '死亡人物无法行动');
  requireRuntime(!actor.statuses.includes('stunned'), 'ACTOR_STUNNED', '眩晕人物无法行动');
  if (action === 'move') requireRuntime(!actor.statuses.includes('rooted'), 'ACTOR_ROOTED', '定身人物无法移动');
}
export function damageActor(state: ActorRuntime, actorId: string, amount: number): ActorRuntime {
  runtimeInteger(amount, 0, 1000000, '伤害'); const next = structuredClone(state);
  const actor = runtimeActor(next, actorId); actor.hp = Math.max(0, actor.hp - amount); return next;
}
/** Dead actors cannot be revived by ordinary healing in this version. */
export function healActor(state: ActorRuntime, actorId: string, amount: number): ActorRuntime {
  runtimeInteger(amount, 0, 1000000, '治疗'); const next = structuredClone(state); const actor = runtimeActor(next, actorId);
  requireRuntime(actor.hp > 0, 'ACTOR_DEAD', '普通治疗不能复活'); actor.hp = Math.min(actor.maxHp, actor.hp + amount); return next;
}
export function setActorStatus(state: ActorRuntime, actorId: string, status: RuntimeStatus, enabled: boolean): ActorRuntime {
  requireRuntime(['stunned', 'rooted'].includes(status) && typeof enabled === 'boolean', 'INVALID_INPUT', '状态参数无效');
  const next = structuredClone(state); const actor = runtimeActor(next, actorId);
  actor.statuses = actor.statuses.filter(s => s !== status); if (enabled) actor.statuses.push(status); return next;
}
