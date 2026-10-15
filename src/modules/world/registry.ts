import { MapGenerationError, impossible } from './errors';
import { separated, shuffled } from './geometry';
import type { MapLayoutStrategy, Point, RegionPlacement } from './types';

/** Strategies choose geometry only. Story references are carried through by the core. */
export class MapStrategyRegistry {
  private readonly strategies = new Map<string, MapLayoutStrategy>();
  register(id: string, strategy: MapLayoutStrategy): this {
    if (!id.trim() || typeof strategy !== 'function') throw new Error('布局策略需要有效编号和函数');
    if (this.strategies.has(id)) throw new Error(`布局策略已注册：${id}`);
    this.strategies.set(id, strategy);
    return this;
  }
  unregister(id: string): boolean { return this.strategies.delete(id); }
  resolve(id: string): MapLayoutStrategy {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new MapGenerationError('UNKNOWN_STRATEGY', `未注册布局策略：${id}`, 'layout.strategyId');
    return strategy;
  }
}

export const connectedRegionsStrategy: MapLayoutStrategy = ({ request, randomFor }) => {
  const placed: RegionPlacement[] = [];
  const gap = Number(request.layout.params?.regionGap ?? 1);
  // Fixed regions reserve their space before randomly positioned regions.
  const specs = [...request.regions].sort((a, b) => Number(Boolean(b.position)) - Number(Boolean(a.position)));
  for (const spec of specs) {
    const random = randomFor(`region:${spec.id}`);
    const pick = (range: [number, number]) => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
    const size = { width: pick(spec.sizeRange.width), height: pick(spec.sizeRange.height) };
    let candidates: Point[];
    if (spec.position) candidates = [spec.position];
    else {
      candidates = [];
      for (let y = 0; y <= request.bounds.height - size.height; y++)
        for (let x = 0; x <= request.bounds.width - size.width; x++) candidates.push({ x, y });
      candidates = shuffled(candidates, random);
    }
    const position = candidates.find(p => placed.every(other => separated({ position: p, size }, other, gap)));
    if (!position) impossible(`区域 ${spec.id} 无法满足边界、大小与区域间距`);
    placed.push({ id: spec.id, position: { ...position }, size });
  }
  return request.regions.map(spec => placed.find(region => region.id === spec.id)!);
};

export function createMapStrategyRegistry(): MapStrategyRegistry {
  return new MapStrategyRegistry().register('connected_regions', connectedRegionsStrategy);
}
