/** Event identity and settlement only; effects are applied by the application. */
export interface EventBinding {
  packId: string;
  definitionId: string;
  repeat: "once" | "repeatable";
  locationId: string;
  npcId?: string;
  questIds: string[];
  optionId: string;
}
export interface Settlement {
  commandId: string;
  optionId: string;
  revision: number;
  itemChanges: { id: string; before: number; after: number }[];
  cluesAdded: string[];
  cluesRemoved: string[];
  questChanges: { id: string; before: string; after: string }[];
}
export interface EventInstance {
  id: string;
  key: string;
  runId: string;
  occurrence: number;
  binding: Omit<EventBinding, "optionId">;
  optionIds: string[];
  status: "ready" | "inactive" | "waiting" | "settled";
  settlement?: Settlement;
}
function keyFor(b: EventBinding) {
  return JSON.stringify([b.packId, b.definitionId, b.locationId, b.npcId ?? null]);
}
export function assembleEvents(runId: string, previous: EventInstance[], bindings: EventBinding[]): EventInstance[] {
  const next = structuredClone(previous);
  for (const e of next) if (e.status === "ready") { e.status = "inactive"; e.optionIds = []; }
  for (const b of bindings) {
    if (!runId || !b.packId || !b.definitionId || !b.locationId || !b.optionId || !["once", "repeatable"].includes(b.repeat)) throw Error("事件绑定缺少有效编号");
    const key = keyFor(b);
    const matches = next.filter(e => e.runId === runId && e.key === key);
    if (matches.some(e => e.binding.repeat !== b.repeat)) throw Error("同一事件的重复策略不能在本局改变");
    let current = matches.at(-1);
    if (current?.status === "settled" && b.repeat === "once") continue;
    if (!current || current.status === "settled") {
      const occurrence = matches.length;
      const { optionId: _optionId, ...binding } = b;
      current = { id: JSON.stringify([runId, key, occurrence]), key, runId, occurrence,
        binding: structuredClone(binding), optionIds: [], status: "ready" };
      next.push(current);
    }
    if (current.status === "waiting") continue;
    current.status = "ready";
    if (!current.optionIds.includes(b.optionId)) current.optionIds.push(b.optionId);
  }
  return next;
}
export function requireEvent(events: EventInstance[], runId: string, eventId: string, optionId: string): EventInstance {
  const event = events.find(e => e.id === eventId && e.runId === runId);
  if (!event || event.status !== "ready" || !event.optionIds.includes(optionId)) throw Error("事件不可触发、已失效或已结算");
  return structuredClone(event);
}
export function waitForEvent(events: EventInstance[], id: string): EventInstance[] {
  return events.map(e => e.id === id ? { ...structuredClone(e), status: "waiting" } : structuredClone(e));
}
export function settleEvent(events: EventInstance[], id: string, settlement: Settlement): EventInstance[] {
  const event = events.find(e => e.id === id);
  if (!event || !["ready", "waiting"].includes(event.status) || !event.optionIds.includes(settlement.optionId)) throw Error("事件已结算或选项不属于该事件");
  return events.map(e => e.id === id ? { ...structuredClone(e), status: "settled", settlement: structuredClone(settlement) } : structuredClone(e));
}
