import { inside } from './geometry';
import type { GeneratedMap, Point, Size } from './types';

/** Four-direction breadth-first search; no diagonal corner cutting. */
export function gridPath(bounds: Size, start: Point, goal: Point, canVisit: (point: Point) => boolean): Point[] | null {
  if (!inside(start, bounds) || !inside(goal, bounds) || !canVisit(start) || !canVisit(goal)) return null;
  const count = bounds.width * bounds.height, parents = new Int32Array(count).fill(-1), queue = new Int32Array(count);
  const index = (p: Point) => p.y * bounds.width + p.x;
  const startIndex = index(start), goalIndex = index(goal);
  let head = 0, tail = 1;
  queue[0] = startIndex; parents[startIndex] = startIndex;
  while (head < tail) {
    const current = queue[head++];
    if (current === goalIndex) {
      const path: Point[] = [];
      let cursor = current;
      while (true) {
        path.push({ x: cursor % bounds.width, y: Math.floor(cursor / bounds.width) });
        if (cursor === startIndex) return path.reverse();
        cursor = parents[cursor];
      }
    }
    const x = current % bounds.width, y = Math.floor(current / bounds.width);
    for (const point of [{ x: x + 1, y }, { x, y: y + 1 }, { x: x - 1, y }, { x, y: y - 1 }]) {
      if (!inside(point, bounds)) continue;
      const next = index(point);
      if (parents[next] !== -1 || !canVisit(point)) continue;
      parents[next] = current; queue[tail++] = next;
    }
  }
  return null;
}
export function findMapPath(map: GeneratedMap, from: Point, to: Point): Point[] | null {
  return gridPath(map.bounds, from, to, p => map.cells[p.y][p.x].walkable);
}
