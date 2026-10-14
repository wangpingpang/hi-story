/** Quantities and clue ownership. No story or browser dependency. */
export interface Holdings {
  items: Record<string, number>;
  clues: string[];
}
export function validateItemId(id: string) {
  if (typeof id !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(id) || ["constructor", "prototype", "__proto__"].includes(id))
    throw Error("物品或线索编号不合法");
}
export function quantity(s: Holdings, id: string): number {
  validateItemId(id);
  return Object.hasOwn(s.items, id) ? s.items[id] : 0;
}
export function setQuantity(s: Holdings, id: string, amount: number): Holdings {
  validateItemId(id);
  if (!Number.isSafeInteger(amount) || amount < 0) throw Error("物品数量必须是非负安全整数，物资不足或数量溢出");
  return { items: { ...s.items, [id]: amount }, clues: [...s.clues] };
}
export function adjustQuantity(s: Holdings, id: string, delta: number): Holdings {
  if (!Number.isSafeInteger(delta)) throw Error("物品增减量必须是安全整数");
  return setQuantity(s, id, quantity(s, id) + delta);
}
export function setClue(s: Holdings, id: string, known: boolean): Holdings {
  validateItemId(id);
  if (typeof known !== "boolean") throw Error("线索状态必须是布尔值");
  return { items: { ...s.items }, clues: known ? [...new Set([...s.clues, id])] : s.clues.filter(c => c !== id) };
}
export function validateHoldings(s: Holdings) {
  for (const [id, amount] of Object.entries(s.items)) setQuantity(s, id, amount);
  for (const id of s.clues) validateItemId(id);
  if (new Set(s.clues).size !== s.clues.length) throw Error("线索记录重复");
}
export const createHoldings = (): Holdings => ({ items: { gold: 12, supplies: 0, notes: 1 }, clues: [] });
export const itemName = (id: string) => ({ gold: "金币", supplies: "任务物资", notes: "既存笔记", rope: "绳索" }[id] ?? id);
