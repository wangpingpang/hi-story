import { storyOptions, type World, type RuleRegistry } from "../modules/story-planning";
import { assembleEvents, type EventBinding, type EventInstance, type Settlement } from "../modules/story-runtime";
import { quantity, itemName } from "../modules/inventory";
export function bindStoryEvents(runId: string, w: World, registry: RuleRegistry, previous: EventInstance[]) {
  const bindings: EventBinding[] = storyOptions(w, registry).filter(o => {
    if (!o.npcId) return true;
    const npc = w.npcs.find(n => n.id === o.npcId);
    return npc?.alive && npc.location === w.location;
  }).map(o => {
    const questIds = o.event?.questId ? [o.event.questId] : [...new Set([
      ...(o.questId ? [o.questId] : []),
      ...w.plans.filter(p => p.status !== "retired" && p.stages.some(s => s.routes.some(r => r.optionIds.includes(o.id)))).map(p => p.questId)
    ])];
    if (questIds.some(id => !w.quests.some(q => q.id === id))) throw Error("事件引用不存在的任务");
    return { packId: o.packId, definitionId: o.event?.id ?? o.actionId,
      repeat: o.event?.repeat ?? "repeatable", locationId: w.location, npcId: o.npcId,
      questIds, optionId: o.id };
  });
  return assembleEvents(runId, previous, bindings);
}
export function describeSettlement(before: World, after: World, commandId: string, optionId: string, revision: number): Settlement {
  return { commandId, optionId, revision,
    itemChanges: [...new Set([...Object.keys(before.inventory.items), ...Object.keys(after.inventory.items)])]
      .map(id => ({ id, before: quantity(before.inventory, id), after: quantity(after.inventory, id) })).filter(c => c.before !== c.after),
    cluesAdded: after.inventory.clues.filter(id => !before.inventory.clues.includes(id)),
    cluesRemoved: before.inventory.clues.filter(id => !after.inventory.clues.includes(id)),
    questChanges: after.quests.flatMap(q => {
      const old = before.quests.find(p => p.id === q.id);
      return old && old.status !== q.status ? [{ id: q.id, before: old.status, after: q.status }] : [];
    }) };
}
export { itemName };
