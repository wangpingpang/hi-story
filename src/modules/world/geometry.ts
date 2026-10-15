import type { Point, Shape, Size } from './types';

export function randomStream(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {
    let value = state += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export const pointKey = (p: Point): string => `${p.x},${p.y}`;
export const inside = (p: Point, bounds: Size): boolean => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < bounds.width && p.y < bounds.height;
export const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function raster(position: Point, size: Size, shape: Shape = 'rectangle'): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
    const ellipse = ((x + 0.5 - size.width / 2) / (size.width / 2)) ** 2
      + ((y + 0.5 - size.height / 2) / (size.height / 2)) ** 2;
    if (shape === 'rectangle' || ellipse <= 1) points.push({ x: position.x + x, y: position.y + y });
  }
  return points;
}
export function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function separated(a: { position: Point; size: Size }, b: { position: Point; size: Size }, gap: number): boolean {
  return a.position.x + a.size.width + gap <= b.position.x
    || b.position.x + b.size.width + gap <= a.position.x
    || a.position.y + a.size.height + gap <= b.position.y
    || b.position.y + b.size.height + gap <= a.position.y;
}
