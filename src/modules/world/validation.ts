import { MapGenerationError } from './errors';
import type { MapGenerationRequest } from './types';

function invalid(path: string, message: string): never { throw new MapGenerationError('INVALID_REQUEST', `${path}：${message}`, path); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, '需要对象');
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) invalid(path, '需要 1—128 个字符的非空字符串');
}
function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) invalid(path, `需要 ${min}—${max} 的整数`);
  return value as number;
}
function flag(value: unknown, path: string, required = false): void {
  if ((required || value !== undefined) && typeof value !== 'boolean') invalid(path, '需要布尔值');
}
function size(value: unknown, path: string, maxWidth: number, maxHeight: number): void {
  const s = object(value, path);
  integer(s.width, `${path}.width`, 1, maxWidth);
  integer(s.height, `${path}.height`, 1, maxHeight);
}
function position(value: unknown, path: string, width: number, height: number): void {
  if (value === undefined) return;
  const p = object(value, path);
  integer(p.x, `${path}.x`, 0, width - 1);
  integer(p.y, `${path}.y`, 0, height - 1);
}
function shape(value: unknown, path: string, required = false): void {
  if ((required || value !== undefined) && value !== 'rectangle' && value !== 'ellipse') invalid(path, '支持 rectangle、ellipse');
}
function list(value: unknown, path: string, max: number, required = false): Record<string, unknown>[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > max || (required && !value.length)) invalid(path, `需要${required ? '非空' : ''}数组，最多 ${max} 项`);
  const ids = new Set<string>();
  return value.map((item, index) => {
    const pathAt = `${path}[${index}]`, record = object(item, pathAt);
    text(record.id, `${pathAt}.id`);
    if (ids.has(record.id as string)) invalid(`${pathAt}.id`, '编号重复');
    ids.add(record.id as string);
    return record;
  });
}

/** Runtime validation also applies to requests loaded from JSON. It never changes the input. */
export function validateRequest(input: unknown): MapGenerationRequest {
  const r = object(input, 'request');
  if (r.schemaVersion !== undefined && r.schemaVersion !== 1) invalid('schemaVersion', '仅支持版本 1');
  if (typeof r.seed === 'number') {
    if (!Number.isSafeInteger(r.seed)) invalid('seed', '数字种子需要安全整数');
  } else text(r.seed, 'seed');
  const bounds = object(r.bounds, 'bounds');
  const width = integer(bounds.width, 'bounds.width', 1, 256), height = integer(bounds.height, 'bounds.height', 1, 256);
  const layout = object(r.layout, 'layout');
  text(layout.strategyId, 'layout.strategyId');
  const params = layout.params === undefined ? {} : object(layout.params, 'layout.params');
  if (params.maxAttempts !== undefined) integer(params.maxAttempts, 'layout.params.maxAttempts', 1, 32);
  if (params.regionGap !== undefined) integer(params.regionGap, 'layout.params.regionGap', 0, 16);
  const regions = list(r.regions, 'regions', 64, true);
  const regionIds = new Set(regions.map(region => region.id));
  function regionRef(value: unknown, path: string): void { if (!regionIds.has(value)) invalid(path, '引用的区域不存在'); }
  regions.forEach((region, i) => {
    const p = `regions[${i}]`, ranges = object(region.sizeRange, `${p}.sizeRange`);
    for (const [axis, bound] of [['width', width], ['height', height]] as const) {
      const range = ranges[axis];
      if (!Array.isArray(range) || range.length !== 2) invalid(`${p}.sizeRange.${axis}`, '需要 [最小值, 最大值]');
      integer(range[0], `${p}.sizeRange.${axis}[0]`, 1, bound);
      integer(range[1], `${p}.sizeRange.${axis}[1]`, range[0], bound);
      if (region.position) {
        const pos = object(region.position, `${p}.position`);
        const offset = pos[axis === 'width' ? 'x' : 'y'];
        if (typeof offset === 'number' && offset + range[0] > bound) invalid(`${p}.position`, '最小区域大小也超出地图边界');
      }
    }
    position(region.position, `${p}.position`, width, height);
    shape(region.shape, `${p}.shape`);
    if (region.environmentRef !== undefined) text(region.environmentRef, `${p}.environmentRef`);
    flag(region.walkable, `${p}.walkable`); flag(region.blocksSight, `${p}.blocksSight`);
  });
  list(r.connections, 'connections', 128).forEach((c, i) => {
    const p = `connections[${i}]`;
    regionRef(c.from, `${p}.from`); regionRef(c.to, `${p}.to`);
    if (c.from === c.to) invalid(p, '连接需要两个不同区域');
    integer(c.width, `${p}.width`, 1, Math.min(16, width, height));
    flag(c.passable, `${p}.passable`, true); flag(c.blocksSight, `${p}.blocksSight`);
  });
  const anchors = list(r.anchors, 'anchors', 256), anchorIds = new Set(anchors.map(anchor => anchor.id));
  anchors.forEach((a, i) => { regionRef(a.regionId, `anchors[${i}].regionId`); position(a.position, `anchors[${i}].position`, width, height); });
  list(r.terrain, 'terrain', 128).forEach((t, i) => {
    const p = `terrain[${i}]`, spec = object(t.shapeSpec, `${p}.shapeSpec`);
    regionRef(t.regionId, `${p}.regionId`); text(t.terrainRef, `${p}.terrainRef`);
    shape(spec.shape, `${p}.shapeSpec.shape`, true); size(spec.size, `${p}.shapeSpec.size`, width, height);
    position(t.position, `${p}.position`, width, height);
    flag(t.walkable, `${p}.walkable`, true); flag(t.blocksSight, `${p}.blocksSight`, true);
  });
  list(r.placements, 'placements', 256).forEach((item, i) => {
    const p = `placements[${i}]`;
    regionRef(item.regionId, `${p}.regionId`); text(item.entityRef, `${p}.entityRef`);
    size(item.footprint, `${p}.footprint`, width, height); position(item.position, `${p}.position`, width, height);
    flag(item.blocksMovement, `${p}.blocksMovement`, true); flag(item.blocksSight, `${p}.blocksSight`, true);
    if (item.placementRule !== undefined) {
      const rule = object(item.placementRule, `${p}.placementRule`);
      if (!anchorIds.has(rule.nearAnchorId)) invalid(`${p}.placementRule.nearAnchorId`, '引用的关键点不存在');
      const min = rule.minDistance === undefined ? 0 : integer(rule.minDistance, `${p}.placementRule.minDistance`, 0, width + height);
      if (rule.maxDistance !== undefined) integer(rule.maxDistance, `${p}.placementRule.maxDistance`, min, width + height);
    }
  });
  if (r.constraints !== undefined) {
    const c = object(r.constraints, 'constraints');
    if (c.minObjectSpacing !== undefined) integer(c.minObjectSpacing, 'constraints.minObjectSpacing', 0, 16);
    flag(c.allowObjectOverlap, 'constraints.allowObjectOverlap');
    flag(c.requiredPathsAvoidPlacements, 'constraints.requiredPathsAvoidPlacements');
    if (c.requiredPaths !== undefined) {
      if (!Array.isArray(c.requiredPaths) || c.requiredPaths.length > 256) invalid('constraints.requiredPaths', '需要数组，最多 256 项');
      c.requiredPaths.forEach((value, i) => {
        const path = object(value, `constraints.requiredPaths[${i}]`);
        for (const key of ['fromAnchorId', 'toAnchorId']) if (!anchorIds.has(path[key])) invalid(`constraints.requiredPaths[${i}].${key}`, '引用的关键点不存在');
      });
    }
  }
  // Clone only the public request; untrusted strategy code receives a separate clone later.
  try { return structuredClone(input) as MapGenerationRequest; }
  catch { return invalid('request', '需要可以复制的数据，不支持函数等值'); }
}
