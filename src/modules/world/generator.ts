import { MapGenerationError, impossible } from './errors';
import { distance, inside, pointKey, randomStream, raster, separated, shuffled } from './geometry';
import { gridPath } from './pathfinding';
import { createMapStrategyRegistry, type MapStrategyRegistry } from './registry';
import { validateRequest } from './validation';
import type { GeneratedMap, MapGenerationRequest, MapGenerationResult, Point, RegionPlacement, Size } from './types';

export const MAP_GENERATOR_VERSION = 'bounded-map/2' as const;

function checkLayout(raw: RegionPlacement[], request: MapGenerationRequest): RegionPlacement[] {
  const fail = (message: string): never => { throw new MapGenerationError('STRATEGY_ERROR', message); };
  if (!Array.isArray(raw) || raw.length !== request.regions.length) fail('布局策略必须返回全部且仅有请求中的区域');
  const ids = new Set<string>(), result: RegionPlacement[] = [];
  for (const region of raw) {
    const spec = request.regions.find(item => item.id === region?.id);
    if (!spec || ids.has(region.id)) fail('布局策略返回未知或重复区域');
    ids.add(region.id);
    if (!region.position || !region.size || !inside(region.position, request.bounds)) fail(`布局策略返回无效位置：${region.id}`);
    for (const axis of ['width', 'height'] as const) {
      const value = region.size[axis], range = spec!.sizeRange[axis];
      if (!Number.isInteger(value) || value < range[0] || value > range[1]) fail(`布局策略未满足区域大小：${region.id}`);
    }
    if (region.position.x + region.size.width > request.bounds.width || region.position.y + region.size.height > request.bounds.height)
      impossible(`区域 ${region.id} 超出地图边界`);
    if (spec!.position && pointKey(spec!.position) !== pointKey(region.position)) fail(`布局策略修改了固定位置：${region.id}`);
    const copy = { id: region.id, position: { ...region.position }, size: { ...region.size } };
    if (result.some(other => !separated(copy, other, Number(request.layout.params?.regionGap ?? 1))))
      impossible(`区域 ${region.id} 与其他区域重叠或间距不足`);
    result.push(copy);
  }
  return request.regions.map(spec => result.find(region => region.id === spec.id)!);
}

function buildMap(request: MapGenerationRequest, layout: RegionPlacement[], randomFor: (namespace: string) => () => number): GeneratedMap {
  const cells = Array.from({ length: request.bounds.height }, () => Array.from({ length: request.bounds.width }, () => ({
    regionId: null as string | null, connectionIds: [] as string[], terrainId: null as string | null,
    placementIds: [] as string[], walkable: false, blocksSight: true,
  })));
  const regions = layout.map(region => {
    const spec = request.regions.find(item => item.id === region.id)!;
    for (const p of raster(region.position, region.size, spec.shape)) {
      const cell = cells[p.y][p.x];
      cell.regionId = region.id; cell.walkable = spec.walkable ?? true; cell.blocksSight = spec.blocksSight ?? false;
    }
    return { ...region, shape: spec.shape ?? 'rectangle', ...(spec.environmentRef === undefined ? {} : { environmentRef: spec.environmentRef }) };
  });
  const getRegion = (id: string) => regions.find(region => region.id === id)!;
  const requiredPaths = request.constraints?.requiredPaths ?? [];
  const anchors: GeneratedMap['anchors'] = [], terrain: GeneratedMap['terrain'] = [], placements: GeneratedMap['placements'] = [];
  const connections: GeneratedMap['connections'] = [];
  for (const spec of request.connections ?? []) {
    const low = -Math.floor((spec.width - 1) / 2);
    const brush = (p: Point) => raster({ x: p.x + low, y: p.y + low }, { width: spec.width, height: spec.width });
    const allowed = (p: Point) => brush(p).every(q => {
      if (!inside(q, request.bounds)) return false;
      const cell = cells[q.y][q.x];
      return cell.regionId === spec.from || cell.regionId === spec.to || (cell.regionId === null && cell.connectionIds.length === 0);
    });
    const endpoint = (id: string) => {
      const region = getRegion(id), center = { x: region.position.x + Math.floor(region.size.width / 2), y: region.position.y + Math.floor(region.size.height / 2) };
      const p = raster(region.position, region.size, region.shape).sort((a, b) => distance(a, center) - distance(b, center)).find(allowed);
      if (!p) impossible(`连接 ${spec.id} 的宽度无法容纳于区域 ${id}`);
      return p;
    };
    const route = gridPath(request.bounds, endpoint(spec.from), endpoint(spec.to), allowed);
    if (!route) impossible(`连接 ${spec.id} 无法在边界内避开其他区域和通道`);
    const unique = new Map<string, Point>();
    for (const p of route) for (const q of brush(p)) unique.set(pointKey(q), q);
    const points = [...unique.values()];
    if (!spec.passable && !points.some(p => cells[p.y][p.x].regionId === null)) impossible(`封闭连接 ${spec.id} 需要区域之间留出通道空间`);
    for (const p of points) {
      const cell = cells[p.y][p.x]; cell.connectionIds.push(spec.id);
      if (cell.regionId === null) { cell.walkable = spec.passable; cell.blocksSight = spec.blocksSight ?? !spec.passable; }
    }
    connections.push({ ...spec, cells: points });
  }
  const candidates = (regionId: string, size: Size, fixed: Point | undefined, namespace: string): Point[] => {
    if (fixed) return [{ ...fixed }];
    const region = getRegion(regionId), result: Point[] = [];
    for (let y = region.position.y; y <= region.position.y + region.size.height - size.height; y++)
      for (let x = region.position.x; x <= region.position.x + region.size.width - size.width; x++) result.push({ x, y });
    return shuffled(result, randomFor(namespace));
  };
  const inRegion = (points: Point[], regionId: string) => points.length > 0 && points.every(p => inside(p, request.bounds) && cells[p.y][p.x].regionId === regionId);
  const fixedFirst = <T extends { position?: Point }>(items: T[]) => [...items].sort((a, b) => Number(Boolean(b.position)) - Number(Boolean(a.position)));
  for (const spec of fixedFirst(request.terrain ?? [])) {
    const position = candidates(spec.regionId, spec.shapeSpec.size, spec.position, `terrain:${spec.id}`).find(p => {
      const points = raster(p, spec.shapeSpec.size, spec.shapeSpec.shape);
      return inRegion(points, spec.regionId) && points.every(q => cells[q.y][q.x].terrainId === null);
    });
    if (!position) impossible(`地貌 ${spec.id} 无法放入指定区域，或与其他地貌重叠`);
    const points = raster(position, spec.shapeSpec.size, spec.shapeSpec.shape);
    for (const p of points) { const cell = cells[p.y][p.x]; cell.terrainId = spec.id; cell.walkable = spec.walkable; cell.blocksSight = spec.blocksSight; }
    terrain.push({ ...spec, position, cells: points });
  }
  for (const spec of fixedFirst(request.anchors ?? [])) {
    const position = candidates(spec.regionId, { width: 1, height: 1 }, spec.position, `anchor:${spec.id}`).find(p =>
      inRegion([p], spec.regionId) && cells[p.y][p.x].walkable && !anchors.some(anchor => pointKey(anchor.position) === pointKey(p)));
    if (!position) impossible(`关键点 ${spec.id} 没有符合要求的可通行位置`);
    anchors.push({ ...spec, position });
  }
  function pathsSatisfied(): boolean {
    return requiredPaths.every(path => {
      const from = anchors.find(anchor => anchor.id === path.fromAnchorId)!.position;
      const to = anchors.find(anchor => anchor.id === path.toAnchorId)!.position;
      return gridPath(request.bounds, from, to, p => cells[p.y][p.x].walkable
        && (!request.constraints?.requiredPathsAvoidPlacements || cells[p.y][p.x].placementIds.length === 0)) !== null;
    });
  }
  if (!pathsSatisfied()) impossible('地貌与连接状态使必须可达的关键点无法连通');
  const baseWalkable = cells.map(row => row.map(cell => cell.walkable));
  for (const spec of fixedFirst(request.placements ?? [])) {
    const rule = spec.placementRule, near = rule ? anchors.find(anchor => anchor.id === rule.nearAnchorId)!.position : undefined;
    const position = candidates(spec.regionId, spec.footprint, spec.position, `object:${spec.id}`).find(p => {
      const points = raster(p, spec.footprint);
      if (!inRegion(points, spec.regionId) || !points.every(q => baseWalkable[q.y][q.x])) return false;
      if (near && (distance(p, near) < (rule!.minDistance ?? 0) || distance(p, near) > (rule!.maxDistance ?? Infinity))) return false;
      if (!request.constraints?.allowObjectOverlap && placements.some(other => !separated(
        { position: p, size: spec.footprint }, { position: other.position, size: other.footprint }, request.constraints?.minObjectSpacing ?? 0))) return false;
      if (!spec.blocksMovement && !request.constraints?.requiredPathsAvoidPlacements) return true;
      if (anchors.some(anchor => points.some(q => pointKey(q) === pointKey(anchor.position)))) return false;
      const previous = points.map(q => cells[q.y][q.x].walkable);
      for (const q of points) cells[q.y][q.x].walkable = false;
      const valid = pathsSatisfied();
      points.forEach((q, index) => { cells[q.y][q.x].walkable = previous[index]; });
      return valid;
    });
    if (!position) impossible(`对象 ${spec.id} 无法满足位置、占地、间距或关键通路要求`);
    for (const p of raster(position, spec.footprint)) {
      const cell = cells[p.y][p.x]; cell.placementIds.push(spec.id);
      cell.walkable = cell.walkable && !spec.blocksMovement; cell.blocksSight = cell.blocksSight || spec.blocksSight;
    }
    placements.push({ ...spec, position });
  }
  if (!pathsSatisfied()) impossible('对象放置后必须可达的关键点无法连通');
  return {
    generatorVersion: MAP_GENERATOR_VERSION, schemaVersion: 1, seed: request.seed, bounds: { ...request.bounds }, regions, connections,
    anchors: (request.anchors ?? []).map(spec => anchors.find(a => a.id === spec.id)!),
    terrain: (request.terrain ?? []).map(spec => terrain.find(t => t.id === spec.id)!),
    placements: (request.placements ?? []).map(spec => placements.find(p => p.id === spec.id)!), cells,
    summary: { walkableCells: cells.reduce((sum, row) => sum + row.filter(cell => cell.walkable).length, 0),
      regionCount: regions.length, connectionCount: connections.length, objectCount: placements.length },
  };
}

export function generateMap(input: unknown, registry: MapStrategyRegistry = createMapStrategyRegistry()): MapGenerationResult {
  let attempts = 0;
  try {
    const request = validateRequest(input), strategy = registry.resolve(request.layout.strategyId);
    const maxAttempts = Number(request.layout.params?.maxAttempts ?? 16);
    let lastError: MapGenerationError | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempts++;
      const randomFor = (namespace: string) => randomStream(JSON.stringify([MAP_GENERATOR_VERSION, request.seed, attempt, namespace]));
      try {
        let raw: RegionPlacement[];
        try { raw = strategy({ request: structuredClone(request), attempt, randomFor }); }
        catch (error) {
          if (error instanceof MapGenerationError) throw error;
          throw new MapGenerationError('STRATEGY_ERROR', `布局策略执行失败：${error instanceof Error ? error.message : String(error)}`);
        }
        return { ok: true, map: buildMap(request, checkLayout(raw, request), randomFor) };
      } catch (error) {
        if (!(error instanceof MapGenerationError) || error.code !== 'UNSATISFIABLE') throw error;
        lastError = error;
      }
    }
    throw lastError ?? new MapGenerationError('UNSATISFIABLE', '无法生成符合约束的地图');
  } catch (error) {
    const failure = error instanceof MapGenerationError ? error : new MapGenerationError('STRATEGY_ERROR', error instanceof Error ? error.message : String(error));
    return { ok: false, error: { code: failure.code, message: failure.message,
      ...(failure.path ? { path: failure.path } : {}), ...(attempts ? { attempts } : {}) } };
  }
}
