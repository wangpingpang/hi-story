import { describe, expect, it } from 'vitest';
import sample from '../content/maps/example-request.json';
import { createMapStrategyRegistry, findMapPath, generateMap, type GeneratedMap, type MapGenerationRequest } from '../src/modules/world';

const request = (): MapGenerationRequest => structuredClone(sample) as unknown as MapGenerationRequest;
function generated(input: MapGenerationRequest): GeneratedMap {
  const result = generateMap(input);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.map;
}
function oneRegion(): MapGenerationRequest {
  return { seed: 'one', bounds: { width: 12, height: 10 }, layout: { strategyId: 'connected_regions', params: { maxAttempts: 2 } },
    regions: [{ id: 'room', position: { x: 1, y: 1 }, sizeRange: { width: [10, 10], height: [8, 8] } }],
    anchors: [{ id: 'a', regionId: 'room', position: { x: 2, y: 4 } }, { id: 'b', regionId: 'room', position: { x: 9, y: 4 } }],
    constraints: { requiredPaths: [{ fromAnchorId: 'a', toAnchorId: 'b' }] } };
}

describe('参数驱动的有界地图', () => {
  it('复现完整结果，不改变故事输入，保留故事引用和固定位置', () => {
    const input = request(), original = structuredClone(input), map = generated(input);
    expect(generateMap(input)).toEqual(generateMap(input)); expect(input).toEqual(original);
    expect(map.regions.map(r => r.environmentRef)).toEqual(input.regions.map(r => r.environmentRef));
    expect(map.terrain[0].terrainRef).toBe(input.terrain![0].terrainRef);
    expect(map.placements.map(p => p.entityRef)).toEqual(input.placements!.map(p => p.entityRef));
    expect(map.anchors[0].position).toEqual({ x: 4, y: 6 });
    expect(map.placements.find(p => p.id === 'chest')!.position).toEqual({ x: 33, y: 21 });
  });
  it('所有格子、区域、通道、地貌、对象均在边界内；关键路线四方向可达', () => {
    const map = generated(request());
    expect(map.cells.length).toBe(28); expect(map.cells.every(row => row.length === 40)).toBe(true);
    for (const item of [...map.connections, ...map.terrain]) for (const p of item.cells) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThan(40);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThan(28);
    }
    const path = findMapPath(map, map.anchors[0].position, map.anchors[2].position)!;
    expect(path.length).toBeGreaterThan(1);
    path.forEach((p, i) => { expect(map.cells[p.y][p.x].walkable).toBe(true); if (i) expect(Math.abs(p.x - path[i - 1].x) + Math.abs(p.y - path[i - 1].y)).toBe(1); });
    expect(findMapPath(map, { x: -1, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(findMapPath(map, { x: 1.5, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });
  it('不自行增加故事未指定的对象、地貌或连接', () => {
    const input = oneRegion(); delete input.anchors; delete input.constraints;
    const map = generated(input);
    expect(map.terrain).toEqual([]); expect(map.placements).toEqual([]); expect(map.connections).toEqual([]); expect(map.anchors).toEqual([]);
  });
  it('放置距离、占地和碰撞属性来自故事参数', () => {
    const map = generated(request()), guard = map.placements.find(p => p.id === 'guard')!, gate = map.anchors.find(a => a.id === 'village_gate')!;
    const d = Math.abs(guard.position.x - gate.position.x) + Math.abs(guard.position.y - gate.position.y);
    expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(3);
    expect(map.cells[guard.position.y][guard.position.x].walkable).toBe(false);
    for (const p of map.terrain[0].cells) { expect(map.cells[p.y][p.x].walkable).toBe(false); expect(map.cells[p.y][p.x].blocksSight).toBe(false); }
  });
  it('封闭连接按输入保留，无法满足必达要求时返回失败，不擅自开放', () => {
    const input = request(); input.connections![1].passable = false;
    const blocked = generateMap(input);
    expect(blocked.ok).toBe(false); if (!blocked.ok) expect(blocked.error.code).toBe('UNSATISFIABLE');
    input.constraints!.requiredPaths = [];
    const map = generated(input);
    expect(map.connections[1].passable).toBe(false);
    expect(findMapPath(map, map.anchors[0].position, map.anchors[2].position)).toBeNull();
  });
  it('拒绝会切断必达路径的固定对象与地貌，且不修改输入', () => {
    const input = oneRegion();
    input.placements = [{ id: 'wall', entityRef: 'story:wall', regionId: 'room', position: { x: 6, y: 1 }, footprint: { width: 1, height: 8 }, blocksMovement: true, blocksSight: true }];
    const before = structuredClone(input), result = generateMap(input);
    expect(result.ok).toBe(false); expect(input).toEqual(before);
    input.placements = []; input.terrain = [{ id: 'river', regionId: 'room', terrainRef: 'story:river', position: { x: 6, y: 1 }, shapeSpec: { shape: 'rectangle', size: { width: 1, height: 8 } }, walkable: false, blocksSight: false }];
    expect(generateMap(input).ok).toBe(false);
  });
  it('对象重叠策略明确，重叠阻挡不会被后续候选检查清除', () => {
    const input = oneRegion();
    input.placements = ['first', 'second'].map(id => ({ id, entityRef: `story:${id}`, regionId: 'room', position: { x: 5, y: 2 }, footprint: { width: 1, height: 1 }, blocksMovement: true, blocksSight: false }));
    expect(generateMap(input).ok).toBe(false);
    input.constraints!.allowObjectOverlap = true;
    const map = generated(input);
    expect(map.cells[2][5].placementIds).toEqual(['first', 'second']); expect(map.cells[2][5].walkable).toBe(false);
  });
  it('失败重试有上限，并报告无法放入区域的对象', () => {
    const input = oneRegion();
    input.placements = [{ id: 'huge', entityRef: 'story:huge', regionId: 'room', footprint: { width: 12, height: 10 }, blocksMovement: false, blocksSight: false }];
    const result = generateMap(input);
    expect(result.ok).toBe(false); if (!result.ok) { expect(result.error.code).toBe('UNSATISFIABLE'); expect(result.error.attempts).toBe(2); expect(result.error.message).toContain('huge'); }
  });
  it.each([
    ['非法边界', (r: MapGenerationRequest) => { r.bounds.width = -1; }],
    ['重复编号', (r: MapGenerationRequest) => { r.regions.push(structuredClone(r.regions[0])); }],
    ['错误区域引用', (r: MapGenerationRequest) => { r.anchors![0].regionId = 'missing'; }],
    ['错误关键点引用', (r: MapGenerationRequest) => { r.constraints!.requiredPaths![0].toAnchorId = 'missing'; }],
    ['非法距离', (r: MapGenerationRequest) => { r.placements![0].placementRule!.minDistance = 10; }],
    ['越界固定位置', (r: MapGenerationRequest) => { r.regions[0].position!.x = 39; }],
    ['不支持形状', (r: MapGenerationRequest) => { r.regions[0].shape = 'polygon' as never; }],
  ])('%s 在生成前返回 INVALID_REQUEST', (_, change) => {
    const input = request(); change(input); const result = generateMap(input);
    expect(result.ok).toBe(false); if (!result.ok) { expect(result.error.code).toBe('INVALID_REQUEST'); expect(result.error.path).toBeTruthy(); }
  });
  it('未知策略、故障策略和违反固定位置的策略返回不同错误', () => {
    const input = oneRegion(); input.layout.strategyId = 'custom';
    expect(generateMap(input)).toMatchObject({ ok: false, error: { code: 'UNKNOWN_STRATEGY' } });
    const broken = createMapStrategyRegistry().register('custom', () => { throw new Error('boom'); });
    expect(generateMap(input, broken)).toMatchObject({ ok: false, error: { code: 'STRATEGY_ERROR' } });
    const wrong = createMapStrategyRegistry().register('custom', () => [{ id: 'room', position: { x: 0, y: 0 }, size: { width: 10, height: 8 } }]);
    expect(generateMap(input, wrong)).toMatchObject({ ok: false, error: { code: 'STRATEGY_ERROR' } });
  });
  it('热插拔布局策略通过公共接口使用，策略不能修改故事原始请求', () => {
    const input = oneRegion(); input.layout.strategyId = 'fixed_story_layout'; const before = structuredClone(input);
    const registry = createMapStrategyRegistry().register('fixed_story_layout', context => {
      const placements = context.request.regions.map(r => ({ id: r.id, position: r.position!, size: { width: r.sizeRange.width[0], height: r.sizeRange.height[0] } }));
      context.request.seed = 'changed-inside-plugin'; return placements;
    });
    expect(generateMap(input, registry).ok).toBe(true); expect(input).toEqual(before);
    expect(registry.unregister('fixed_story_layout')).toBe(true);
    expect(generateMap(input, registry)).toMatchObject({ ok: false, error: { code: 'UNKNOWN_STRATEGY' } });
  });
  it('120个种子产生不同空间布局，全部满足边界与可达性', () => {
    const variants = new Set<string>();
    for (let index = 0; index < 120; index++) {
      const input: MapGenerationRequest = { seed: `layout:${index}`, bounds: { width: 32, height: 24 }, layout: { strategyId: 'connected_regions' },
        regions: ['a', 'b'].map(id => ({ id, sizeRange: { width: [6, 8], height: [6, 8] } })),
        connections: [{ id: 'road', from: 'a', to: 'b', width: 2, passable: true }],
        anchors: [{ id: 'start', regionId: 'a' }, { id: 'end', regionId: 'b' }],
        constraints: { requiredPaths: [{ fromAnchorId: 'start', toAnchorId: 'end' }] } };
      const map = generated(input); variants.add(JSON.stringify(map.regions));
      expect(findMapPath(map, map.anchors[0].position, map.anchors[1].position)).not.toBeNull();
      for (const r of map.regions) { expect(r.position.x + r.size.width).toBeLessThanOrEqual(32); expect(r.position.y + r.size.height).toBeLessThanOrEqual(24); }
    }
    expect(variants.size).toBeGreaterThan(110);
  });
  it('空请求等 JSON 输入返回结构化错误', () => {
    for (const input of [null, {}, [], { seed: NaN }]) expect(generateMap(input)).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  });
});
