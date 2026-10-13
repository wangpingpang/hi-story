import { contextFor, collectDependencies, type Binding } from "./dependencies";
import { evaluate, execute, type Budget } from "./interpreter";
import type { World } from "./model";
import type { ReactionRule } from "./rule-types";
import type { RuleRegistry } from "./registry";
interface Entry {
  order: number;
  key: string;
  rule: ReactionRule;
  binding: Binding;
  dependencies: Set<string>;
}
interface Index {
  revision: number;
  entities: string;
  entries: Entry[];
  watchers: Map<string, Entry[]>;
}
const cache = new WeakMap<RuleRegistry, Index>();
function index(w: World, registry: RuleRegistry): Index {
  const entities = JSON.stringify([
      w.npcs.map((n) => n.id),
      w.quests.map((q) => q.id),
    ]),
    cached = cache.get(registry);
  if (cached?.revision === registry.revision && cached.entities === entities)
    return cached;
  const entries: Entry[] = [],
    watchers = new Map<string, Entry[]>();
  for (const { packId, rule } of registry.reactions()) {
    const bindings: Binding[] =
      rule.scope === "npc"
        ? w.npcs.map((n) => ({ scope: "npc", npcId: n.id }))
        : rule.scope === "quest"
          ? w.quests.map((q) => ({ scope: "quest", questId: q.id }))
          : [{ scope: "world" }];
    for (const binding of bindings) {
      const dependencies = collectDependencies(rule, binding);
      if (collectDependencies(rule.when, binding).size === 0)
        dependencies.add("@transaction");
      const entry = {
        order: entries.length,
        key: `${packId}/${rule.id}/${binding.npcId ?? binding.questId ?? "world"}`,
        rule,
        binding,
        dependencies,
      };
      entries.push(entry);
      for (const dependency of dependencies) {
        const bucket = watchers.get(dependency) ?? [];
        bucket.push(entry);
        watchers.set(dependency, bucket);
      }
    }
  }
  const result = { revision: registry.revision, entities, entries, watchers };
  cache.set(registry, result);
  return result;
}
export function reconcileIndexed(
  w: World,
  registry: RuleRegistry,
  id: string,
  budget: Budget,
  initial: Set<string>,
  full = false,
): Set<string> {
  const compiled = index(w, registry),
    pending = new Set<Entry>(),
    fired = new Set<string>(),
    dirty = new Set(initial);
  const enqueue = (keys: Iterable<string>) => {
    for (const key of keys)
      for (const e of compiled.watchers.get(key) ?? [])
        if (!fired.has(e.key)) pending.add(e);
  };
  if (full) compiled.entries.forEach((e) => pending.add(e));
  else enqueue(initial);
  enqueue(["@transaction"]);
  while (pending.size) {
    const entry = [...pending].reduce((best, e) =>
      e.order < best.order ? e : best,
    );
    pending.delete(entry);
    if (fired.has(entry.key)) continue;
    w.lastUpdate.evaluatedReactions.push(entry.key);
    const c = contextFor(w, entry.binding);
    if (!evaluate(entry.rule.when, c, budget)) continue;
    fired.add(entry.key);
    w.lastUpdate.firedReactions.push(entry.key);
    const changes = new Set<string>();
    c.changes = changes;
    const text = execute(entry.rule.effects, c, budget).join("");
    if (text) w.history.push({ id: `${id}:${entry.key}`, time: w.time, text });
    changes.forEach((key) => dirty.add(key));
    enqueue(changes);
  }
  return dirty;
}
