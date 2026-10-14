import { quantity, setQuantity, setClue, validateItemId } from "../inventory/index";
import { transitionQuest, explainQuest } from "../objectives/index";
import type { NPC, Quest, World } from "./model";
import { changeKeys } from "./dependency-keys";
import type { Scalar, Value } from "./rule-types";
export interface Context {
  world: World;
  npc?: NPC;
  quest?: Quest;
  changes?: Set<string>;
}
type ReadValue = Scalar | string[];
interface Field {
  read: (c: Context) => ReadValue;
  write?: (c: Context, v: Scalar) => void;
  type?: "number" | "string" | "boolean";
  choices?: string[];
  min?: number;
}
const fields = new Map<string, Field>();
function worldField<K extends keyof World>(
  key: K,
  type: "number" | "boolean" | "string",
  min?: number,
) {
  fields.set(key, {
    type,
    min,
    read: (c) => c.world[key] as Scalar,
    write: (c, v) => {
      (c.world as unknown as Record<string, Scalar>)[key] = v;
    },
  });
}
export function syncHoldings(w: World) {
  w.gold = quantity(w.inventory, "gold");
  w.resource = quantity(w.inventory, "supplies") > 0;
  w.notes = quantity(w.inventory, "notes") > 0;
  w.clue = w.inventory.clues.includes("main");
}
function holdingField(path: string): Field | undefined {
  const alias = { gold: "gold", resource: "supplies", notes: "notes" }[path];
  const item = path.startsWith("item.") ? path.slice(5) : alias;
  const clue = path.startsWith("clue.") ? path.slice(5) : path === "clue" ? "main" : undefined;
  if (item) {
    validateItemId(item);
    const flag = path === "resource" || path === "notes";
    return { type: flag ? "boolean" : "number",
      read: c => flag ? quantity(c.world.inventory, item) > 0 : quantity(c.world.inventory, item),
      write: (c, v) => { c.world.inventory = setQuantity(c.world.inventory, item, flag ? (v ? Math.max(1, quantity(c.world.inventory, item)) : 0) : v as number); syncHoldings(c.world); }
    };
  }
  if (clue) {
    validateItemId(clue);
    return { type: "boolean", read: c => c.world.inventory.clues.includes(clue),
      write: (c, v) => { c.world.inventory = setClue(c.world.inventory, clue, v as boolean); syncHoldings(c.world); }
    };
  }
}
const fieldFor = (path: string) => holdingField(path) ?? fields.get(path);
for (const path of ["gold", "resource", "notes", "clue"]) fields.set(path, holdingField(path)!);
fields.set("time", { read: (c) => c.world.time });
for (const key of [
  "accessible",
  "targetReached",
] as const)
  worldField(key, "boolean");
worldField("ending", "string");
for (const key of ["goal", "location", "deadline"] as const)
  fields.set(key, { read: (c) => c.world[key] });
for (const key of ["need", "reason", "obstacle"] as const)
  fields.set(`conflict.${key}`, { read: (c) => c.world.conflict[key] });
function npc(c: Context) {
  if (!c.npc) throw Error("规则缺少 NPC 上下文");
  return c.npc;
}
function quest(c: Context) {
  if (!c.quest) throw Error("规则缺少任务上下文");
  return c.quest;
}
for (const key of [
  "id",
  "name",
  "role",
  "trait",
  "goal",
  "location",
  "knowledge",
] as const)
  fields.set(`npc.${key}`, { read: (c) => npc(c)[key] });
fields.set("npc.alive", {
  type: "boolean",
  read: (c) => npc(c).alive,
  write: (c, v) => {
    npc(c).alive = v as boolean;
  },
});
fields.set("npc.trust", {
  type: "number",
  read: (c) => npc(c).trust,
  write: (c, v) => {
    npc(c).trust = v as number;
  },
});
fields.set("npc.response", {
  type: "string",
  read: (c) => npc(c).response,
  write: (c, v) => {
    npc(c).response = v as string;
  },
});
const statuses = ["active", "success", "failed", "abandoned", "expired"];
fields.set("quest.id", { read: (c) => quest(c).id });
fields.set("quest.status", {
  type: "string",
  choices: statuses,
  read: (c) => quest(c).status,
  write: (c, v) => {
    Object.assign(quest(c), transitionQuest(quest(c), v as Quest["status"]));
  },
});
fields.set("quest.reason", {
  type: "string",
  read: (c) => quest(c).reason,
  write: (c, v) => {
    Object.assign(quest(c), explainQuest(quest(c), v as string));
  },
});
for (const id of ["main", "side"])
  for (const key of ["status", "reason"] as const) {
    const target = (c: Context) => {
      const q = c.world.quests.find((q) => q.id === id);
      if (!q) throw Error(`任务 ${id} 不存在`);
      return q;
    };
    fields.set(`${id}.${key}`, {
      type: "string",
      choices: key === "status" ? statuses : undefined,
      read: (c) => target(c)[key],
      write: (c, v) => {
        Object.assign(target(c), key === "status" ? transitionQuest(target(c), v as Quest["status"]) : explainQuest(target(c), v as string));
      },
    });
  }
export function validateField(path: string, write = false, scope?: string) {
  const field = fieldFor(path);
  if (!field || (write && !field.write))
    throw Error(`不支持的${write ? "写入" : "读取"}字段：${path}`);
  if (
    (path.startsWith("npc.") && scope !== "npc") ||
    (path.startsWith("quest.") && scope !== "quest")
  )
    throw Error(`字段 ${path} 与规则作用域不匹配`);
  return field;
}
export function read(path: string, c: Context): ReadValue {
  const f = fieldFor(path);
  if (!f) throw Error(`未知字段 ${path}`);
  return f.read(c);
}
export function value(v: Value, c: Context): ReadValue {
  return typeof v === "object" ? read(v.ref, c) : v;
}
export function write(path: string, v: ReadValue, c: Context) {
  const f = fieldFor(path);
  if (!f?.write) throw Error(`字段不可写：${path}`);
  if (
    Array.isArray(v) ||
    typeof v !== f.type ||
    (typeof v === "number" &&
      (!Number.isFinite(v) || (f.min !== undefined && v < f.min))) ||
    (f.choices && !f.choices.includes(v as string))
  )
    throw Error(`字段值不合法：${path}`);
  const previous = f.read(c);
  f.write(c, v);
  if (previous !== v)
    for (const key of changeKeys(path, c)) c.changes?.add(key);
  if (previous !== v) {
    const pairs = [["gold", "item.gold"], ["resource", "item.supplies"], ["notes", "item.notes"], ["clue", "clue.main"]];
    for (const pair of pairs) if (pair.includes(path)) for (const key of pair) c.changes?.add(key);
  }
}
export function template(text: string, c: Context) {
  return text.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, path) =>
    String(read(path, c)),
  );
}
export function validateTemplate(text: string, scope: string) {
  for (const m of text.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g))
    validateField(m[1], false, scope);
}

export function fieldPaths(w?: World): string[] {
  return [...fields.keys(), ...Object.keys(w?.inventory.items ?? {}).map(id => `item.${id}`), ...(w?.inventory.clues ?? []).map(id => `clue.${id}`)];
}
