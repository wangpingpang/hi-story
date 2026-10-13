import type { Context } from "./fields";
import type { World } from "./model";
import type { Scope } from "./rule-types";
export interface Binding {
  scope: Scope;
  npcId?: string;
  questId?: string;
}
export function dependencyKey(path: string, b: Binding): string {
  if (path.startsWith("npc.")) return `npc.${b.npcId ?? "*"}.${path.slice(4)}`;
  if (path.startsWith("quest."))
    return `quest.${b.questId ?? "*"}.${path.slice(6)}`;
  if (path.startsWith("main.") || path.startsWith("side."))
    return `quest.${path}`;
  return path;
}
export function contextFor(w: World, b: Binding): Context {
  return {
    world: w,
    npc: b.npcId ? w.npcs.find((n) => n.id === b.npcId) : undefined,
    quest: b.questId ? w.quests.find((q) => q.id === b.questId) : undefined,
  };
}
export function changeKeys(path: string, c: Context): string[] {
  const binding: Binding = {
    scope: c.npc ? "npc" : c.quest ? "quest" : "world",
    npcId: c.npc?.id,
    questId: c.quest?.id,
  };
  const key = dependencyKey(path, binding),
    keys = [key];
  if (key.startsWith("npc.") || key.startsWith("quest.")) {
    const [type, , ...rest] = key.split(".");
    keys.push(`${type}.*.${rest.join(".")}`);
  }
  return keys;
}
