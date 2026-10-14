import { gridKey, gridDistance, requireRuntime, runtimeId, runtimeInteger, validateGridPoint, type GridPoint } from '../../contracts';
export type { GridPoint } from '../../contracts';

/** Spatial input only. Story meaning and generation belong to upstream modules. */
export interface RuntimeMapInput {
  id: string;
  width: number;
  height: number;
  blocked: GridPoint[];
  opaque?: GridPoint[];
  spawn: GridPoint;
  locations: { id: string; cells: GridPoint[] }[];
}
export interface WorldRuntime {
  map: RuntimeMapInput;
  entities: { id: string; position: GridPoint; solid: boolean }[];
}
export function inBounds(world: WorldRuntime, p: GridPoint): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < world.map.width && p.y < world.map.height;
}
export function isBlocked(world: WorldRuntime, p: GridPoint): boolean {
  return !inBounds(world, p) || world.map.blocked.some(q => gridKey(q) === gridKey(p));
}
export function createWorld(input: RuntimeMapInput): WorldRuntime {
  runtimeId(input.id, '地图编号'); runtimeInteger(input.width, 1, 256, '地图宽度'); runtimeInteger(input.height, 1, 256, '地图高度');
  requireRuntime(Array.isArray(input.blocked) && Array.isArray(input.locations), 'INVALID_INPUT', '地图碰撞和地点须为数组');
  const world: WorldRuntime = { map: structuredClone(input), entities: [] };
  for (const cells of [input.blocked, input.opaque ?? []]) {
    requireRuntime(Array.isArray(cells), 'INVALID_INPUT', '遮挡须为坐标数组');
    cells.forEach(p => { validateGridPoint(p); requireRuntime(inBounds(world, p), 'OUT_OF_BOUNDS', '地图坐标越界'); });
    requireRuntime(new Set(cells.map(gridKey)).size === cells.length, 'INVALID_INPUT', '地图坐标重复');
  }
  validateGridPoint(input.spawn); requireRuntime(!isBlocked(world, input.spawn), 'BLOCKED', '出生点不可通行');
  const ids = new Set<string>();
  for (const location of input.locations) {
    runtimeId(location.id, '地点编号'); requireRuntime(!ids.has(location.id), 'DUPLICATE_ID', '地点编号重复'); ids.add(location.id);
    requireRuntime(Array.isArray(location.cells) && location.cells.length > 0, 'INVALID_INPUT', '地点须有至少一个格子');
    requireRuntime(new Set(location.cells.map(gridKey)).size === location.cells.length, 'INVALID_INPUT', '地点格子重复');
    location.cells.forEach(p => { validateGridPoint(p); requireRuntime(!isBlocked(world, p), 'BLOCKED', '地点格子不可通行'); });
  }
  return world;
}
export function entity(world: WorldRuntime, id: string) {
  const found = world.entities.find(e => e.id === id);
  requireRuntime(found, 'INVALID_TARGET', '空间实体不存在'); return found;
}
export function canOccupy(world: WorldRuntime, p: GridPoint, exceptId?: string): boolean {
  return !isBlocked(world, p) && !world.entities.some(e => e.solid && e.id !== exceptId && gridKey(e.position) === gridKey(p));
}
export function placeEntity(world: WorldRuntime, id: string, position: GridPoint, solid = true): WorldRuntime {
  runtimeId(id); validateGridPoint(position); requireRuntime(typeof solid === 'boolean', 'INVALID_INPUT', '碰撞标记无效');
  requireRuntime(!world.entities.some(e => e.id === id), 'DUPLICATE_ID', '空间实体编号重复');
  requireRuntime(!isBlocked(world, position) && (!solid || canOccupy(world, position)), 'BLOCKED', '落位格子被阻挡');
  const next = structuredClone(world); next.entities.push({ id, position: structuredClone(position), solid }); return next;
}
export function moveEntity(world: WorldRuntime, id: string, destination: GridPoint): WorldRuntime {
  validateGridPoint(destination); const actor = entity(world, id);
  requireRuntime(gridDistance(actor.position, destination) === 1, 'INVALID_MOVE', '每次移动须为上下左右相邻一格');
  requireRuntime(canOccupy(world, destination, id), 'BLOCKED', '移动位置被阻挡或越界');
  const next = structuredClone(world); entity(next, id).position = structuredClone(destination); return next;
}
export function setEntitySolid(world: WorldRuntime, id: string, solid: boolean): WorldRuntime {
  const current = entity(world, id); requireRuntime(typeof solid === 'boolean', 'INVALID_INPUT', '碰撞标记无效');
  requireRuntime(!solid || canOccupy(world, current.position, id), 'BLOCKED', '无法恢复实体碰撞');
  const next = structuredClone(world); entity(next, id).solid = solid; return next;
}
export function locationsAt(world: WorldRuntime, p: GridPoint): string[] {
  return world.map.locations.filter(l => l.cells.some(c => gridKey(c) === gridKey(p))).map(l => l.id);
}
/** Supercover ray: walls are visible, cells behind them are hidden; no diagonal corner peeking. */
export function hasLineOfSight(world: WorldRuntime, from: GridPoint, to: GridPoint): boolean {
  if (!inBounds(world, from) || !inBounds(world, to)) return false;
  const opaque = new Set((world.map.opaque ?? world.map.blocked).map(gridKey));
  const hidden = (x: number, y: number) => opaque.has(`${x},${y}`);
  const dx = to.x - from.x, dy = to.y - from.y, nx = Math.abs(dx), ny = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy); let x = from.x, y = from.y, ix = 0, iy = 0;
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      if (hidden(x + sx, y) || hidden(x, y + sy)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (decision < 0) { x += sx; ix++; } else { y += sy; iy++; }
    if (x === to.x && y === to.y) return true;
    if (hidden(x, y)) return false;
  }
  return true;
}
