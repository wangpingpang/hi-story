import { read, fieldPaths, type Context } from "./fields";
import type { World } from "./model";
import type { Scope } from "./rule-types";
import { dependencyKey, changeKeys, type Binding } from "./dependency-keys";
export {
  contextFor,
  dependencyKey,
  changeKeys,
  type Binding,
} from "./dependency-keys";
export function collectDependencies(
  node: unknown,
  b: Binding = { scope: "world" },
): Set<string> {
  const result = new Set<string>();
  const visit = (x: unknown, binding: Binding) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) {
      x.forEach((v) => visit(v, binding));
      return;
    }
    const v = x as Record<string, unknown>;
    if (typeof v.ref === "string") result.add(dependencyKey(v.ref, binding));
    if (v.op === "add" && typeof v.path === "string")
      result.add(dependencyKey(v.path, binding));
    for (const k of ["text", "template", "title"])
      if (typeof v[k] === "string")
        for (const m of String(v[k]).matchAll(/\{([a-zA-Z0-9_.-]+)\}/g))
          result.add(dependencyKey(m[1], binding));
    if (v.op === "some" || v.op === "each") {
      const scope: Scope = v.collection === "npcs" ? "npc" : "quest";
      result.add(`@ids.${scope}`);
      const child = { scope };
      for (const [key, value] of Object.entries(v))
        if (["where", "condition", "effects"].includes(key))
          visit(value, child);
      return;
    }
    Object.values(v).forEach((value) => visit(value, binding));
  };
  visit(node, b);
  return result;
}
export function changedFields(before: World, after: World): Set<string> {
  const snapshot = (w: World) => {
    const result = new Map<string, string>();
    // Accessors supply canonical field names, including new host fields added later.
    for (const path of fieldPaths()) {
      const scopes = path.startsWith("npc.")
        ? w.npcs.map((npc) => ({ world: w, npc }))
        : path.startsWith("quest.")
          ? w.quests.map((quest) => ({ world: w, quest }))
          : [{ world: w }];
      for (const c of scopes) {
        const key = changeKeys(path, c)[0];
        result.set(key, JSON.stringify(read(path, c)));
      }
    }
    result.set("@ids.npc", JSON.stringify(w.npcs.map((n) => n.id)));
    result.set("@ids.quest", JSON.stringify(w.quests.map((q) => q.id)));
    return result;
  };
  const a = snapshot(before),
    b = snapshot(after),
    result = new Set<string>();
  for (const key of new Set([...a.keys(), ...b.keys()]))
    if (a.get(key) !== b.get(key)) {
      result.add(key);
      if (key.startsWith("npc.") || key.startsWith("quest.")) {
        const [kind, , ...rest] = key.split(".");
        result.add(`${kind}.*.${rest.join(".")}`);
      }
    }
  return result;
}
