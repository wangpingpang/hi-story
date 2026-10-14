export class GameError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function requireValue(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new GameError(code, message);
}
export function seedHash(seed: string): number {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function record(value: unknown, keys: string[]): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_COMMAND', '操作参数必须是对象。');
  requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'INVALID_COMMAND', '操作参数格式无效。');
  requireValue(Object.keys(value).every(k => keys.includes(k)), 'INVALID_COMMAND', '操作包含未知参数。');
  return value as Record<string, unknown>;
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { requireValue(Number.isFinite(value), 'INVALID_COMMAND', '操作数值必须有限。'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  requireValue(typeof value === 'object' && value !== null, 'INVALID_COMMAND', '操作包含不可序列化参数。');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string,unknown>)[k])).join(',') + '}';
}
