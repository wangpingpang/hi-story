import { validateField, validateTemplate } from "./fields";
import type { RulePack, Scope } from "./rule-types";
const idPattern = /^[a-zA-Z][a-zA-Z0-9_/-]{0,63}$/;
function record(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw Error("规则节点必须是对象");
  return x as Record<string, unknown>;
}
function string(x: unknown) {
  if (typeof x !== "string" || !x.trim() || x.length > 2048)
    throw Error("字符串字段不合法");
  return x;
}
function array(x: unknown, max = 64): unknown[] {
  if (!Array.isArray(x) || x.length > max) throw Error("规则数组不合法或过长");
  return x;
}
function number(x: unknown, min: number, max: number) {
  if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max)
    throw Error("数值字段不合法");
  return x;
}
function scope(x: unknown): Scope {
  if (!["world", "npc", "quest"].includes(String(x)))
    throw Error("作用域不合法");
  return x as Scope;
}
function keys(x: Record<string, unknown>, allowed: string[]) {
  for (const k of Object.keys(x))
    if (!allowed.includes(k)) throw Error(`未知规则字段：${k}`);
}
function operand(x: unknown, s: Scope) {
  if (
    typeof x === "string" ||
    typeof x === "boolean" ||
    (typeof x === "number" && Number.isFinite(x))
  )
    return;
  const o = record(x);
  keys(o, ["ref"]);
  validateField(string(o.ref), false, s);
}
function condition(x: unknown, s: Scope, depth = 0): void {
  if (depth > 16) throw Error("规则嵌套过深");
  const c = record(x);
  const handlers: Record<string, () => void> = {
    all: () => {
      keys(c, ["op", "args"]);
      array(c.args).forEach((a) => condition(a, s, depth + 1));
    },
    any: () => {
      keys(c, ["op", "args"]);
      array(c.args).forEach((a) => condition(a, s, depth + 1));
    },
    not: () => {
      keys(c, ["op", "arg"]);
      condition(c.arg, s, depth + 1);
    },
    some: () => {
      keys(c, ["op", "collection", "where"]);
      const inner = collection(c.collection);
      condition(c.where, inner, depth + 1);
    },
  };
  for (const op of ["eq", "ne", "gt", "gte", "includes"])
    handlers[op] = () => {
      keys(c, ["op", "left", "right"]);
      operand(c.left, s);
      operand(c.right, s);
    };
  const handler = Object.hasOwn(handlers, String(c.op))
    ? handlers[String(c.op)]
    : undefined;
  if (!handler) throw Error(`未知条件操作：${c.op}`);
  handler();
}
function collection(x: unknown): Scope {
  if (x === "npcs") return "npc";
  if (x === "quests") return "quest";
  throw Error("集合不合法");
}
function effects(x: unknown, s: Scope, depth = 0): void {
  if (depth > 16) throw Error("效果嵌套过深");
  for (const item of array(x)) {
    const e = record(item);
    const handlers: Record<string, () => void> = {
      set: () => {
        keys(e, ["op", "path", "value"]);
        const f = validateField(string(e.path), true, s);
        operand(e.value, s);
        if (typeof e.value !== "object" && typeof e.value !== f.type)
          throw Error("写入类型不匹配");
      },
      add: () => {
        keys(e, ["op", "path", "value"]);
        if (validateField(string(e.path), true, s).type !== "number")
          throw Error("只能累加数值字段");
        operand(e.value, s);
        if (typeof e.value !== "object" && typeof e.value !== "number")
          throw Error("增量必须是数值");
      },
      format: () => {
        keys(e, ["op", "path", "template"]);
        if (validateField(string(e.path), true, s).type !== "string")
          throw Error("格式化只能写入文字字段");
        validateTemplate(string(e.template), s);
      },
      text: () => {
        keys(e, ["op", "template"]);
        validateTemplate(string(e.template), s);
      },
      when: () => {
        keys(e, ["op", "condition", "then", "otherwise"]);
        condition(e.condition, s, depth + 1);
        effects(e.then, s, depth + 1);
        if (e.otherwise !== undefined) effects(e.otherwise, s, depth + 1);
      },
      chance: () => {
        keys(e, ["op", "probability", "then", "otherwise"]);
        number(e.probability, 0, 1);
        effects(e.then, s, depth + 1);
        if (e.otherwise !== undefined) effects(e.otherwise, s, depth + 1);
      },
      each: () => {
        keys(e, ["op", "collection", "effects", "condition"]);
        const inner = collection(e.collection);
        if (e.condition !== undefined) condition(e.condition, inner, depth + 1);
        effects(e.effects, inner, depth + 1);
      },
    };
    const handler = Object.hasOwn(handlers, String(e.op))
      ? handlers[String(e.op)]
      : undefined;
    if (!handler) throw Error(`未知效果操作：${e.op}`);
    handler();
  }
}
export function parseRulePack(input: unknown): RulePack {
  // Treat plugin packages as data; snapshot before validating, and never evaluate code.
  let raw: string;
  try {
    raw = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    throw Error("规则包必须是 JSON 数据");
  }
  if (!raw || raw.length > 256_000) throw Error("规则包超过大小限制");
  const p = record(JSON.parse(raw));
  keys(p, [
    "schemaVersion",
    "id",
    "version",
    "name",
    "requires",
    "actions",
    "reactions",
    "plans",
  ]);
  if (p.schemaVersion !== 1) throw Error("不支持的规则包版本");
  if (!idPattern.test(string(p.id))) throw Error("规则包编号不合法");
  string(p.version);
  string(p.name);
  array(p.requires).forEach((r) => {
    if (!idPattern.test(string(r)) || r === p.id)
      throw Error("规则包依赖不合法");
  });
  const ids = new Set<string>();
  for (const item of array(p.actions)) {
    const a = record(item);
    keys(a, [
      "id",
      "scope",
      "category",
      "text",
      "cost",
      "when",
      "effects",
      "external",
      "event",
    ]);
    if (a.event !== undefined) {
      const event = record(a.event);
      keys(event, ["id", "repeat", "questId"]);
      if (!idPattern.test(string(event.id)) || !["once", "repeatable"].includes(String(event.repeat)) ||
          (event.questId !== undefined && !["main", "side"].includes(String(event.questId)))) throw Error("事件绑定不合法");
    }
    const id = string(a.id);
    if (!idPattern.test(id) || ids.has(id)) throw Error("行动编号不合法或重复");
    ids.add(id);
    const s = scope(a.scope);
    string(a.category);
    validateTemplate(string(a.text), s);
    number(a.cost, 0, 1_000);
    condition(a.when, s);
    effects(a.effects, s);
    if (
      a.external !== undefined &&
      (a.external !== "combat" || s !== "npc" || array(a.effects).length)
    )
      throw Error("外部行动必须是无即时效果的 NPC 战斗请求");
  }
  ids.clear();
  for (const item of array(p.reactions)) {
    const r = record(item);
    keys(r, ["id", "scope", "priority", "when", "effects"]);
    const id = string(r.id);
    if (!idPattern.test(id) || ids.has(id)) throw Error("反应编号不合法或重复");
    ids.add(id);
    const s = scope(r.scope);
    number(r.priority, -1_000, 1_000);
    condition(r.when, s);
    effects(r.effects, s);
  }

  const planIds = new Set<string>();
  for (const item of array(p.plans ?? [], 16)) {
    const plan = record(item);
    keys(plan, ["id", "title", "questId", "stages"]);
    const id = string(plan.id);
    if (!idPattern.test(id) || planIds.has(id))
      throw Error("任务计划编号不合法或重复");
    planIds.add(id);
    validateTemplate(string(plan.title), "world");
    if (!["main", "side"].includes(String(plan.questId)))
      throw Error("任务计划关联任务不合法");
    const stages = array(plan.stages, 16).map(record);
    if (!stages.length) throw Error("任务计划不能为空");
    const ids = new Set<string>();
    for (const stage of stages) {
      keys(stage, ["id", "title", "requires", "complete", "routes"]);
      const id = string(stage.id);
      if (!idPattern.test(id) || ids.has(id))
        throw Error("阶段编号不合法或重复");
      ids.add(id);
      validateTemplate(string(stage.title), "world");
      condition(stage.complete, "world");
      array(stage.requires).forEach(string);
      const routes = new Set<string>();
      for (const item of array(stage.routes, 16)) {
        const route = record(item);
        keys(route, ["id", "title", "when", "actionIds", "npcWhen"]);
        const rid = string(route.id);
        if (!idPattern.test(rid) || routes.has(rid))
          throw Error("路线编号不合法或重复");
        routes.add(rid);
        validateTemplate(string(route.title), "world");
        condition(route.when, "world");
        if (route.npcWhen !== undefined) condition(route.npcWhen, "npc");
        array(route.actionIds).forEach((a) => {
          if (!idPattern.test(string(a))) throw Error("路线行动编号不合法");
        });
      }
    }
    const graph = new Map(
      stages.map((s) => [String(s.id), s.requires as string[]]),
    );
    const done = new Set<string>(),
      pending = new Set<string>();
    const visit = (id: string) => {
      if (!ids.has(id)) throw Error("阶段依赖不存在");
      if (pending.has(id)) throw Error("阶段存在循环依赖");
      if (done.has(id)) return;
      pending.add(id);
      for (const dep of graph.get(id)!) visit(dep);
      pending.delete(id);
      done.add(id);
    };
    for (const id of ids) visit(id);
  }
  return p as unknown as RulePack;
}
