import { gridDistance, gridKey, requireRuntime, runtimeInteger } from '../../contracts';
import { entity, hasLineOfSight, locationsAt, moveEntity, type GridPoint, type WorldRuntime } from '../world/index';
export interface ExplorationRuntime {
  actorId: string;
  visionRadius: number;
  visible: string[];
  explored: string[];
  currentLocations: string[];
}
export interface EnterLocation { kind: 'location.entered'; actorId: string; locationId: string }
export function refreshExploration(world: WorldRuntime, previous: ExplorationRuntime): ExplorationRuntime {
  const position = entity(world, previous.actorId).position;
  const visible: string[] = [];
  for (let y = Math.max(0, position.y - previous.visionRadius); y <= Math.min(world.map.height - 1, position.y + previous.visionRadius); y++) {
    for (let x = Math.max(0, position.x - previous.visionRadius); x <= Math.min(world.map.width - 1, position.x + previous.visionRadius); x++) {
      if ((x - position.x) ** 2 + (y - position.y) ** 2 <= previous.visionRadius ** 2 && hasLineOfSight(world, position, { x, y })) visible.push(`${x},${y}`);
    }
  }
  return { ...structuredClone(previous), visible, explored: [...new Set([...previous.explored, ...visible])], currentLocations: locationsAt(world, position) };
}
export function createExploration(world: WorldRuntime, actorId: string, visionRadius = 4): ExplorationRuntime {
  runtimeInteger(visionRadius, 0, 32, '视野半径');
  return refreshExploration(world, { actorId, visionRadius, visible: [], explored: [], currentLocations: [] });
}
export function exploreMove(world: WorldRuntime, exploration: ExplorationRuntime, destination: GridPoint) {
  const nextWorld = moveEntity(world, exploration.actorId, destination);
  const nextExploration = refreshExploration(nextWorld, exploration);
  const signals: EnterLocation[] = nextExploration.currentLocations.filter(id => !exploration.currentLocations.includes(id))
    .map(locationId => ({ kind: 'location.entered', actorId: exploration.actorId, locationId }));
  return { world: nextWorld, exploration: nextExploration, signals };
}
export function assertInteraction(world: WorldRuntime, exploration: ExplorationRuntime, targetId: string, range = 1): void {
  runtimeInteger(range, 0, 32, '交互距离');
  const actor = entity(world, exploration.actorId), target = entity(world, targetId);
  requireRuntime(actor.id !== target.id, 'INVALID_TARGET', '不能与自己交互');
  requireRuntime(gridDistance(actor.position, target.position) <= range, 'OUT_OF_RANGE', '对象超出交互距离');
  requireRuntime(exploration.visible.includes(gridKey(target.position)) && hasLineOfSight(world, actor.position, target.position), 'NOT_VISIBLE', '交互对象当前不可见');
}
