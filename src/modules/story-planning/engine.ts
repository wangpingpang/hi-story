import corePack from "../../../content/story/core-rules.json";
import { RuleRegistry } from "./registry";
import { contexts, evaluate, execute, type Budget } from "./interpreter";
import { template, type Context } from "./fields";
import { initializeStory as createWorld } from "./initialize";
import { changedFields, collectDependencies } from "./dependencies";
import { reconcileIndexed } from "./scheduler";
import { updatePlans } from "./planner";
import type { Change, Option, World } from "./model";
import type { ActionRule } from "./rule-types";
export function createStoryRegistry() {
  return new RuleRegistry(corePack);
}
const defaults = createStoryRegistry();
interface BoundAction {
  rule: ActionRule;
  context: Context;
  option: Option;
}
function available(w: World, registry: RuleRegistry): BoundAction[] {
  if (w.ending) return [];
  const found: BoundAction[] = [],
    ids = new Set<string>(),
    budget = { remaining: 20_000 };
  for (const { packId, rule } of registry.actions())
    for (const context of contexts(rule.scope, { world: w }))
      if (evaluate(rule.when, context, budget)) {
        const suffix = {
          world: () => "",
          npc: () => `:${context.npc!.id}`,
          quest: () => `:${context.quest!.id}`,
        }[rule.scope]();
        const id = rule.id + suffix;
        if (ids.has(id)) throw Error(`可选行动编号冲突：${id}`);
        ids.add(id);
        found.push({
          rule,
          context,
          option: {
            id,
            actionId: rule.id,
            npcId: context.npc?.id,
            questId: context.quest?.id,
            category: rule.category,
            text: template(rule.text, context),
            cost: rule.cost,
            dependencies: [
              ...collectDependencies(rule, {
                scope: rule.scope,
                npcId: context.npc?.id,
                questId: context.quest?.id,
              }),
            ],
            external: rule.external,
            packId,
          },
        });
      }
  return found;
}
export function storyOptions(w: World, registry = defaults): Option[] {
  return available(w, registry).map((a) => a.option);
}
function updateWorld(
  before: World,
  w: World,
  registry: RuleRegistry,
  id: string,
  budget: Budget,
  full = false,
) {
  w.lastUpdate = {
    changedFields: [],
    evaluatedReactions: [],
    firedReactions: [],
    replannedPlans: [],
  };
  const dirty = reconcileIndexed(
    w,
    registry,
    id,
    budget,
    changedFields(before, w),
    full,
  );
  w.lastUpdate.changedFields = [...dirty].sort();
  updatePlans(w, registry, storyOptions(w, registry), dirty, id, budget, full);
}
export function initializeStory(
  seed: string,
  background?: { text: string; tags: string[] },
): World {
  const w = createWorld(seed, background);
  updateWorld(
    structuredClone(w),
    w,
    defaults,
    "init",
    { remaining: 20_000 },
    true,
  );
  return w;
}
function validateTransition(before: World, after: World) {
  if (!Number.isFinite(after.time) || after.time < before.time)
    throw Error("世界时间不能倒退或溢出");
  for (const old of before.quests.filter((q) => q.status !== "active")) {
    const next = after.quests.find((q) => q.id === old.id);
    if (!next || next.status !== old.status || next.reason !== old.reason)
      throw Error("已结束任务的结局不可改写");
  }
  if (before.ending && before.ending !== after.ending)
    throw Error("已经发生的终局不可改写");
}
export function applyRuleChange(
  state: World,
  id: string,
  registry: RuleRegistry,
  message: string,
): World {
  const w = structuredClone(state);
  w.revision++;
  w.history.push({ id, time: w.time, text: message });
  updateWorld(state, w, registry, id, { remaining: 20_000 }, true);
  validateTransition(state, w);
  return w;
}
export interface ActionCommand {
  id: string;
  revision: number;
  optionId: string;
  rulesRevision?: number;
}
export interface CombatRequest {
  kind: "combat";
  targetId: string;
  commandId: string;
  revision: number;
  rulesRevision: number;
  cost: number;
}
export function processPlayerAction(
  state: World,
  command: ActionCommand,
  registry = defaults,
): { world: World; request?: CombatRequest } {
  if (!command.id) throw Error("行动编号不能为空");
  if (state.processed.includes(command.id))
    return { world: structuredClone(state) };
  if (
    command.revision !== state.revision ||
    (command.rulesRevision !== undefined &&
      command.rulesRevision !== registry.revision)
  )
    throw Error("选项已经过期，请重新选择");
  const bound = available(state, registry).find(
    (a) => a.option.id === command.optionId,
  );
  if (!bound) throw Error("当前行动不可用");
  if (bound.rule.external)
    return {
      world: structuredClone(state),
      request: {
        kind: bound.rule.external,
        targetId: bound.context.npc!.id,
        commandId: command.id,
        revision: state.revision,
        rulesRevision: registry.revision,
        cost: bound.rule.cost,
      },
    };
  const w = structuredClone(state);
  const c: Context = {
    world: w,
    npc: bound.context.npc
      ? w.npcs.find((n) => n.id === bound.context.npc!.id)
      : undefined,
    quest: bound.context.quest
      ? w.quests.find((q) => q.id === bound.context.quest!.id)
      : undefined,
  };
  const budget = { remaining: 20_000 };
  const result = execute(bound.rule.effects, c, budget).join("");
  w.time += bound.rule.cost;
  w.revision++;
  w.processed.push(command.id);
  w.history.push({
    id: command.id,
    time: w.time,
    text: bound.option.text + result,
  });
  updateWorld(state, w, registry, command.id, budget);
  validateTransition(state, w);
  return { world: w };
}
// External modules adapt their result contracts here; they never add story-specific branches.
const changeHandlers: {
  [K in Change["kind"]]: (w: World, c: Extract<Change, { kind: K }>) => string;
} = {
  "npc-death": (w, c) => {
    const n = w.npcs.find((n) => n.id === c.npcId);
    if (!n) throw Error("人物不存在");
    n.alive = false;
    return `${n.name}死亡，互动和委托重新检查。`;
  },
  "npc-move": (w, c) => {
    const npc = w.npcs.find((n) => n.id === c.npcId);
    if (!npc) throw Error("人物不存在");
    if (!c.location.trim() || c.location.length > 128)
      throw Error("地点编号不合法");
    npc.location = c.location;
    return `${npc.name}移动到${c.location}。`;
  },
  time: (w, c) => {
    if (!Number.isFinite(c.hours) || c.hours < 0)
      throw Error("时间必须是非负有限数");
    w.time += c.hours;
    return `世界时间推进${c.hours}小时。`;
  },
  access: (w, c) => {
    w.accessible = c.accessible;
    return w.accessible
      ? "目标地点恢复通行。"
      : "目标地点无法通行，相关行动失效。";
  },
  resource: (w, c) => {
    w.resource = c.available;
    return "任务物资状态发生变化。";
  },
  notes: (w, c) => {
    w.notes = c.available;
    return "既存笔记状态发生变化。";
  },
};
export function receiveWorldChange(
  state: World,
  id: string,
  change: Change,
  registry = defaults,
): World {
  if (!id) throw Error("结果编号不能为空");
  if (state.processed.includes(id)) return structuredClone(state);
  const w = structuredClone(state);
  const handler = changeHandlers[change.kind] as (
    w: World,
    c: Change,
  ) => string;
  const text = handler(w, change);
  w.processed.push(id);
  w.revision++;
  w.history.push({ id, time: w.time, text });
  updateWorld(state, w, registry, id, { remaining: 20_000 });
  validateTransition(state, w);
  return w;
}
