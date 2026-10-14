import catalog from '../../../content/story/spatial-layouts.json';
import type { AnchorRequest, MapGenerationRequest, Point, RegionRequest, TerrainRequest } from '../world/index';
import type { World } from './model';
import { requireValue, seedHash } from '../../contracts/demo';

export const STORY_SPATIAL_VERSION = 'story-spatial/2' as const;
type Range = [number, number];
interface RegionTemplate extends Omit<RegionRequest, 'position' | 'environmentRef'> {
  label: string; positionRange: { x: Range; y: Range };
}
interface AnchorTemplate extends AnchorRequest { positionCandidates?: Point[] }
interface SpatialLayout {
  id: string; label: string; tags: string[];
  regions: RegionTemplate[]; anchors: AnchorTemplate[]; npcRegionIds: string[];
  connections: { id: string; from: string; to: string; width: number; requiresAccess?: boolean }[];
  terrain: TerrainRequest[];
}
export interface StorySpatialCatalog {
  schemaVersion: 1; contentVersion: string; bounds: { width: number; height: number };
  layouts: SpatialLayout[];
}
export interface StorySpatialPlan {
  version: typeof STORY_SPATIAL_VERSION;
  catalogVersion: string; layoutId: string; label: string;
  request: MapGenerationRequest; npcLocations: Record<string, string>;
}
function fail(condition: unknown, message: string): asserts condition {
  requireValue(condition, 'INVALID_SPATIAL_CATALOG', message);
}
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 64;
const isRange = (v: unknown): v is Range => Array.isArray(v) && v.length === 2
  && v.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 256) && v[0] <= v[1];
const isPoint = (v: unknown): v is Point => isObject(v) && Number.isSafeInteger(v.x)
  && Number.isSafeInteger(v.y) && (v.x as number) >= 0 && (v.y as number) >= 0;

/** Content catalog validation; geometry and full request validation remain with the map module. */
export function parseStorySpatialCatalog(input: unknown): StorySpatialCatalog {
  fail(isObject(input), '空间目录必须为对象。');
  fail(input.schemaVersion === 1 && isText(input.contentVersion), '空间目录版本无效。');
  fail(isObject(input.bounds) && Number.isInteger(input.bounds.width) && Number.isInteger(input.bounds.height)
    && (input.bounds.width as number) >= 1 && (input.bounds.width as number) <= 256
    && (input.bounds.height as number) >= 1 && (input.bounds.height as number) <= 256, '空间目录边界无效。');
  fail(Array.isArray(input.layouts) && input.layouts.length > 0 && input.layouts.length <= 32, '需要1至32个空间布局。');
  const ids = new Set<string>();
  for (const layout of input.layouts) {
    fail(isObject(layout) && isText(layout.id) && isText(layout.label) && !ids.has(layout.id), '布局编号或名称无效、重复。');
    ids.add(layout.id);
    fail(Array.isArray(layout.tags) && layout.tags.every(isText), '布局标签无效。');
    fail(Array.isArray(layout.regions) && layout.regions.length > 0 && layout.regions.length <= 64, '布局区域无效。');
    const regions = new Set<string>();
    for (const r of layout.regions) {
      fail(isObject(r) && isText(r.id) && isText(r.label) && !regions.has(r.id), '区域编号或名称无效、重复。');
      regions.add(r.id);
      fail(isObject(r.positionRange) && isRange(r.positionRange.x) && isRange(r.positionRange.y)
        && isObject(r.sizeRange) && isRange(r.sizeRange.width) && isRange(r.sizeRange.height)
        && r.sizeRange.width[0] > 0 && r.sizeRange.height[0] > 0, '区域位置或尺寸范围无效。');
    }
    fail(Array.isArray(layout.anchors) && layout.anchors.length > 0 && layout.anchors.length <= 256, '布局锚点无效。');
    const anchors = new Set<string>();
    for (const a of layout.anchors) {
      fail(isObject(a) && isText(a.id) && !anchors.has(a.id) && regions.has(a.regionId as string), '锚点编号或区域引用无效。');
      anchors.add(a.id);
      fail(a.position === undefined || isPoint(a.position), '固定锚点坐标无效。');
      if (a.positionCandidates !== undefined) fail(a.position === undefined && Array.isArray(a.positionCandidates)
        && a.positionCandidates.length > 0 && a.positionCandidates.every(isPoint), '锚点候选坐标无效。');
    }
    for (const id of ['spawn', 'notes', 'market', 'supply', 'goal']) fail(anchors.has(id), `缺少Demo所需锚点：${id}`);
    fail(Array.isArray(layout.npcRegionIds) && layout.npcRegionIds.length > 0
      && layout.npcRegionIds.every(id => regions.has(id as string)
        && (layout.anchors as Record<string, unknown>[]).some(a => a.regionId === id)), 'NPC区域必须有交互锚点。');
    fail(Array.isArray(layout.connections) && layout.connections.length <= 128, '布局连接无效。');
    for (const c of layout.connections) fail(isObject(c) && isText(c.id) && regions.has(c.from as string)
      && regions.has(c.to as string) && Number.isInteger(c.width)
      && (c.requiresAccess === undefined || typeof c.requiresAccess === 'boolean'), '连接参数或区域引用无效。');
    fail(Array.isArray(layout.terrain) && layout.terrain.length <= 128, '布局地貌无效。');
  }
  return structuredClone(input) as unknown as StorySpatialCatalog;
}

/** Independent namespaces avoid consuming the story and combat random streams. */
export function createStorySpatialPlan(world: World, input: unknown = catalog): StorySpatialPlan {
  const data = parseStorySpatialCatalog(input);
  const number = (namespace: string) => seedHash(`${STORY_SPATIAL_VERSION}:${data.contentVersion}:${world.seed}:${namespace}`);
  const pick = (range: Range, namespace: string) => range[0] + number(namespace) % (range[1] - range[0] + 1);
  const weighted = data.layouts.map(layout => ({ layout, weight: 1 + layout.tags.filter(t => world.mapRequest.tags.includes(t)).length }));
  let ticket = number('layout') % weighted.reduce((sum, item) => sum + item.weight, 0);
  const layout = weighted.find(item => (ticket -= item.weight) < 0)!.layout;
  const regions = layout.regions.map(r => ({
    id: r.id, shape: r.shape, sizeRange: structuredClone(r.sizeRange),
    position: { x: pick(r.positionRange.x, `region:${r.id}:x`), y: pick(r.positionRange.y, `region:${r.id}:y`) },
    environmentRef: r.id === 'home' ? world.location : `${world.location}·${r.label}`,
    walkable: r.walkable, blocksSight: r.blocksSight,
  }));
  const anchors = layout.anchors.map(a => ({ id: a.id, regionId: a.regionId,
    ...(a.position ? { position: { ...a.position } } : a.positionCandidates
      ? { position: { ...a.positionCandidates[number(`anchor:${a.id}`) % a.positionCandidates.length] } } : {}),
  }));
  const npcLocations: Record<string, string> = {};
  const placements = world.npcs.map((npc, i) => {
    const regionId = layout.npcRegionIds[i % layout.npcRegionIds.length];
    const near = anchors.find(a => a.regionId === regionId && a.id === 'spawn') ?? anchors.find(a => a.regionId === regionId)!;
    npcLocations[npc.id] = regions.find(r => r.id === regionId)!.environmentRef;
    return { id: `placement-${npc.id}`, entityRef: npc.id, regionId, footprint: { width: 1, height: 1 },
      placementRule: { nearAnchorId: near.id, minDistance: regionId === 'home' ? 3 : 1, maxDistance: 7 },
      blocksMovement: false, blocksSight: false };
  });
  return {
    version: STORY_SPATIAL_VERSION, catalogVersion: data.contentVersion, layoutId: layout.id, label: layout.label, npcLocations,
    request: {
      schemaVersion: 1, seed: `${STORY_SPATIAL_VERSION}:${data.contentVersion}:${seedHash(world.seed).toString(16)}`,
      bounds: { ...data.bounds }, layout: { strategyId: 'connected_regions', params: { regionGap: 1, maxAttempts: 32 } },
      regions, anchors, terrain: structuredClone(layout.terrain), placements,
      connections: layout.connections.map(c => ({ id: c.id, from: c.from, to: c.to, width: c.width, passable: !c.requiresAccess || world.accessible })),
      constraints: { requiredPaths: anchors.filter(a => a.id !== 'spawn').map(a => ({ fromAnchorId: 'spawn', toAnchorId: a.id })),
        minObjectSpacing: 1, allowObjectOverlap: false, requiredPathsAvoidPlacements: true },
    },
  };
}
export function createStoryMapRequest(world: World): MapGenerationRequest { return createStorySpatialPlan(world).request; }
