import { freeze, requireRuntime, runtimeId, runtimeInteger, RuntimeError, type DeepReadonly, type GridPoint } from '../contracts';
import { assertActorCanAct, attributeModifier, registerActor, runtimeActor, ATTRIBUTE_NAMES, type ActorRuntime, type ActorSource, type ActorRuntimeOptions, type AttributeName } from '../modules/characters/index';
import { createWorld, placeEntity, type RuntimeMapInput, type WorldRuntime } from '../modules/world/index';
import { assertInteraction, createExploration, exploreMove, refreshExploration, type ExplorationRuntime } from '../modules/exploration/index';
import { abilityCheck, createRandomState, type RandomState } from '../modules/rules/index';
import { combatAction, startCombat, type CombatRuntime, type CombatAction } from '../modules/combat/index';
import { MemoryStore } from '../infrastructure/memory-store';

export interface RuntimeConfig {
  seed: string;
  map: RuntimeMapInput;
  actors: { source: ActorSource; position?: GridPoint; options?: ActorRuntimeOptions }[];
  objects?: { id: string; position: GridPoint; solid?: boolean }[];
  visionRadius?: number;
}
export type RuntimeAction =
  | { type: 'world.move'; destination: GridPoint }
  | { type: 'world.interact'; targetId: string }
  | { type: 'rules.check'; attribute: AttributeName; difficulty: number; mode?: 'normal' | 'advantage' | 'disadvantage' }
  | { type: 'combat.start'; combatId: string; actorIds: string[] }
  | { type: 'combat.move'; destination: GridPoint }
  | { type: 'combat.attack'; targetId: string }
  | { type: 'combat.end-turn' };
export interface RuntimeCommand {
  commandId: string; runId: string; actorId: string; expectedRevision: number; action: RuntimeAction;
}
export interface RuntimeSignal {
  id: string; runId: string; commandId: string; revision: number;
  kind: 'location.entered' | 'interaction.requested' | 'combat.ended';
  actorId: string; locationId?: string; targetId?: string; combatId?: string; winnerTeamId?: string;
}
export interface RuntimeSnapshot {
  schemaVersion: 1; runId: string; revision: number; playerActorId: string;
  world: WorldRuntime; characters: ActorRuntime; exploration: ExplorationRuntime; random: RandomState;
  combat?: CombatRuntime;
  signals: RuntimeSignal[];
  receipts: { commandId: string; fingerprint: string; result: RuntimeSuccess }[];
}
export interface RuntimeSuccess { ok: true; revision: number; duplicate: boolean; signals: RuntimeSignal[]; report?: unknown }
export type RuntimeResult = RuntimeSuccess | { ok: false; code: string; message: string };

function exactKeys(value: unknown, allowed: string[], required: string[] = []): asserts value is Record<string, unknown> {
  requireRuntime(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_COMMAND', '命令对象无效');
  requireRuntime(Object.keys(value).every(k => allowed.includes(k)) && required.every(k => Object.hasOwn(value, k)), 'INVALID_COMMAND', '命令字段缺失或包含未知字段');
}
const actionFields: Record<RuntimeAction['type'], string[]> = {
  'world.move': ['destination'], 'world.interact': ['targetId'], 'rules.check': ['attribute','difficulty','mode'],
  'combat.start': ['combatId','actorIds'], 'combat.move': ['destination'], 'combat.attack': ['targetId'], 'combat.end-turn': [],
};
function validateCommand(command: RuntimeCommand): void {
  exactKeys(command, ['commandId','runId','actorId','expectedRevision','action'], ['commandId','runId','actorId','expectedRevision','action']);
  runtimeId(command.commandId); runtimeId(command.runId); runtimeId(command.actorId); runtimeInteger(command.expectedRevision, 0, Number.MAX_SAFE_INTEGER, '命令版本');
  requireRuntime(command.action && Object.hasOwn(actionFields, command.action.type), 'UNKNOWN_COMMAND', '未知运行器命令');
  const fields = actionFields[command.action.type]; exactKeys(command.action, ['type', ...fields], ['type', ...fields.filter(k => k !== 'mode')]);
  if ('destination' in command.action) {
    exactKeys(command.action.destination, ['x', 'y'], ['x', 'y']);
    runtimeInteger(command.action.destination.x, 0, 255, 'x'); runtimeInteger(command.action.destination.y, 0, 255, 'y');
  }
  if ('targetId' in command.action) runtimeId(command.action.targetId);
  if (command.action.type === 'combat.start') {
    runtimeId(command.action.combatId); requireRuntime(Array.isArray(command.action.actorIds), 'INVALID_COMMAND', '参战人物须为数组'); command.action.actorIds.forEach(id => runtimeId(id));
  }
  if (command.action.type === 'rules.check') {
    requireRuntime((ATTRIBUTE_NAMES as readonly string[]).includes(command.action.attribute), 'INVALID_COMMAND', '未知检定属性');
    runtimeInteger(command.action.difficulty, 0, 1000, '难度');
    requireRuntime(command.action.mode === undefined || ['normal','advantage','disadvantage'].includes(command.action.mode), 'INVALID_COMMAND', '未知检定模式');
  }
}
function fingerprint(command: RuntimeCommand): string {
  const action = command.action;
  const data = actionFields[action.type].map(key => {
    const value = (action as unknown as Record<string, unknown>)[key];
    if (key === 'destination') { const p = value as GridPoint; return [p.x, p.y]; }
    return key === 'mode' ? value ?? 'normal' : value;
  });
  return JSON.stringify([command.runId, command.actorId, command.expectedRevision, action.type, data]);
}
type SignalInput = Omit<RuntimeSignal, 'id' | 'runId' | 'commandId' | 'revision'>;
type Handler = (state: RuntimeSnapshot, command: RuntimeCommand) => { signals?: SignalInput[]; report?: unknown };

/** Local application adapter; authority for NPC commands belongs to its calling coordinator. */
export class RuntimeSession {
  private config: RuntimeConfig;
  private store: MemoryStore<RuntimeSnapshot>;
  private usedRuns = new Set<string>();
  constructor(config: RuntimeConfig, private readonly runIdFactory: () => string = () => crypto.randomUUID(), private readonly beforeCommit?: (candidate: DeepReadonly<RuntimeSnapshot>) => void) {
    this.config = structuredClone(config); const initial = this.initialize(); this.store = new MemoryStore(initial); this.usedRuns.add(initial.runId);
  }
  private initialize(): RuntimeSnapshot {
    runtimeId(this.config.seed, '本局种子');
    requireRuntime(this.config.seed.length <= 248, 'INVALID_INPUT', '本局种子不得超过 248 字符');
    requireRuntime(Array.isArray(this.config.actors) && this.config.actors.length > 0, 'INVALID_INPUT', '至少注册一个玩家人物');
    const players = this.config.actors.filter(a => a.source.control === 'player');
    requireRuntime(players.length === 1, 'INVALID_INPUT', '首版需要且只允许一个玩家');
    let world = createWorld(this.config.map), characters: ActorRuntime = { actors: [] };
    for (const input of this.config.actors) {
      characters = registerActor(characters, input.source, input.options);
      const actor = runtimeActor(characters, input.source.actorId);
      world = placeEntity(world, actor.actorId, input.position ?? world.map.spawn, actor.hp > 0);
    }
    for (const object of this.config.objects ?? []) world = placeEntity(world, object.id, object.position, object.solid ?? false);
    const playerActorId = players[0].source.actorId;
    requireRuntime(runtimeActor(characters, playerActorId).hp > 0, 'ACTOR_DEAD', '开局玩家必须存活');
    const exploration = createExploration(world, playerActorId, this.config.visionRadius);
    const runId = this.runIdFactory(); runtimeId(runId, '本局编号'); requireRuntime(!this.usedRuns.has(runId), 'DUPLICATE_ID', '重开须产生全新的本局编号');
    return { schemaVersion: 1, runId, revision: 0, playerActorId, world, characters, exploration,
      random: createRandomState(`${this.config.seed}:runtime`), receipts: [],
      signals: exploration.currentLocations.map((locationId, i) => ({ id: `${runId}:initial:${i}`, runId, commandId: 'initialization', revision: 0, kind: 'location.entered', actorId: playerActorId, locationId })) };
  }
  query(): DeepReadonly<RuntimeSnapshot> { return freeze(this.store.read()); }
  restart(): DeepReadonly<RuntimeSnapshot> {
    const candidate = this.initialize(); this.beforeCommit?.(freeze(structuredClone(candidate))); this.store.commit(candidate); this.usedRuns.add(candidate.runId); return this.query();
  }
  dispatch(input: RuntimeCommand): RuntimeResult {
    try {
      validateCommand(input); const command = structuredClone(input), state = this.store.read();
      requireRuntime(command.runId === state.runId, 'RUN_MISMATCH', '命令来自其他局');
      runtimeActor(state.characters, command.actorId);
      requireRuntime(command.action.type.startsWith('combat.') || command.actorId === state.playerActorId, 'ACTOR_MISMATCH', '探索操作只能由当前玩家执行');
      if (command.action.type === 'combat.start') requireRuntime(command.actorId === state.playerActorId, 'ACTOR_MISMATCH', '只能由玩家发起战斗');
      const key = fingerprint(command), receipt = state.receipts.find(r => r.commandId === command.commandId);
      if (receipt) {
        requireRuntime(receipt.fingerprint === key, 'COMMAND_ID_CONFLICT', '相同命令编号对应不同操作');
        return structuredClone({ ...receipt.result, duplicate: true });
      }
      requireRuntime(command.expectedRevision === state.revision, 'REVISION_CONFLICT', '命令版本已经失效');
      if (state.combat?.status === 'active') requireRuntime(['combat.move','combat.attack','combat.end-turn'].includes(command.action.type), 'COMBAT_ACTIVE', '请先完成当前战斗');
      const handlers: Record<RuntimeAction['type'], Handler> = {
        'world.move': (s, c) => {
          requireRuntime(c.action.type === 'world.move', 'INVALID_COMMAND', '移动命令无效');
          assertActorCanAct(runtimeActor(s.characters, c.actorId), 'move');
          const moved = exploreMove(s.world, s.exploration, c.action.destination); s.world = moved.world; s.exploration = moved.exploration;
          return { signals: moved.signals };
        },
        'world.interact': (s, c) => {
          requireRuntime(c.action.type === 'world.interact', 'INVALID_COMMAND', '交互命令无效');
          assertActorCanAct(runtimeActor(s.characters, c.actorId), 'interact'); assertInteraction(s.world, s.exploration, c.action.targetId);
          return { signals: [{ kind: 'interaction.requested', actorId: c.actorId, targetId: c.action.targetId }] };
        },
        'rules.check': (s, c) => {
          requireRuntime(c.action.type === 'rules.check', 'INVALID_COMMAND', '检定命令无效');
          const actor = runtimeActor(s.characters, c.actorId); assertActorCanAct(actor, 'check');
          const check = abilityCheck(s.random, attributeModifier(actor.attributes[c.action.attribute]), c.action.difficulty, c.action.mode);
          s.random = check.random; return { report: check.result };
        },
        'combat.start': (s, c) => {
          requireRuntime(c.action.type === 'combat.start', 'INVALID_COMMAND', '战斗命令无效');
          assertActorCanAct(runtimeActor(s.characters, c.actorId), 'attack');
          requireRuntime(c.action.actorIds.includes(s.playerActorId), 'INVALID_INPUT', '当前玩家必须参与战斗');
          const combatId = c.action.combatId;
          requireRuntime(s.combat?.id !== combatId, 'DUPLICATE_ID', '战斗编号须更新');
          requireRuntime(!s.signals.some(signal => signal.combatId === combatId), 'DUPLICATE_ID', '已结束的战斗编号不能复用');
          const frame = startCombat(c.action.combatId, c.action.actorIds, s.characters, s.world, s.random);
          s.combat = frame.combat; s.random = frame.random; return { report: frame.combat.initiative };
        },
        'combat.move': (s, c) => this.applyCombat(s, c),
        'combat.attack': (s, c) => this.applyCombat(s, c),
        'combat.end-turn': (s, c) => this.applyCombat(s, c),
      };
      const outcome = handlers[command.action.type](state, command); state.revision++;
      const signals: RuntimeSignal[] = (outcome.signals ?? []).map((signal, i) => ({ ...signal,
        id: `${state.runId}:${state.revision}:${i}`, runId: state.runId, commandId: command.commandId, revision: state.revision }));
      state.signals.push(...signals);
      const result: RuntimeSuccess = { ok: true, revision: state.revision, duplicate: false, signals, report: outcome.report };
      state.receipts.push({ commandId: command.commandId, fingerprint: key, result: structuredClone(result) });
      this.beforeCommit?.(freeze(structuredClone(state))); this.store.commit(state); return structuredClone(result);
    } catch (error) {
      return { ok: false, code: error instanceof RuntimeError ? error.code : 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '运行器操作失败' };
    }
  }
  private applyCombat(s: RuntimeSnapshot, c: RuntimeCommand): ReturnType<Handler> {
    requireRuntime(s.combat, 'NO_COMBAT', '尚未开始战斗'); let action: CombatAction;
    if (c.action.type === 'combat.move') action = { kind: 'move', destination: c.action.destination };
    else if (c.action.type === 'combat.attack') action = { kind: 'attack', targetId: c.action.targetId };
    else { requireRuntime(c.action.type === 'combat.end-turn', 'INVALID_COMMAND', '战斗命令无效'); action = { kind: 'end-turn' }; }
    const frame = combatAction({ combat: s.combat, characters: s.characters, world: s.world, random: s.random }, c.actorId, action);
    s.combat = frame.combat; s.characters = frame.characters; s.world = frame.world; s.random = frame.random;
    const previous = s.exploration.currentLocations; s.exploration = refreshExploration(s.world, s.exploration);
    const signals: SignalInput[] = s.exploration.currentLocations.filter(id => !previous.includes(id)).map(locationId => ({ kind: 'location.entered', actorId: s.playerActorId, locationId }));
    if (frame.combat.status === 'ended') signals.push({ kind: 'combat.ended', actorId: c.actorId, combatId: frame.combat.id, winnerTeamId: frame.combat.winnerTeamId });
    return { signals, report: frame.report };
  }
}
