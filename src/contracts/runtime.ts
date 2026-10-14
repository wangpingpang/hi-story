export class RuntimeError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
export function requireRuntime(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new RuntimeError(code, message);
}
export function runtimeId(value: unknown, field = '编号'): asserts value is string {
  requireRuntime(typeof value === 'string' && value.trim() && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value), 'INVALID_INPUT', `${field}无效`);
}
export function runtimeInteger(value: unknown, min: number, max: number, field: string): asserts value is number {
  requireRuntime(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max, 'INVALID_INPUT', `${field}须为 ${min}–${max} 的整数`);
}
export interface GridPoint { x: number; y: number }
export const gridKey = (p: GridPoint) => `${p.x},${p.y}`;
export const gridDistance = (a: GridPoint, b: GridPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function validateGridPoint(p: GridPoint): void {
  requireRuntime(p && typeof p === 'object', 'INVALID_INPUT', '坐标无效');
  runtimeInteger(p.x, 0, 255, 'x'); runtimeInteger(p.y, 0, 255, 'y');
}
