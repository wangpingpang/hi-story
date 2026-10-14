import { describe, expect, it } from 'vitest';
import { createWorld, entity, hasLineOfSight, moveEntity, placeEntity, type RuntimeMapInput } from '../src/modules/world/index';
import { assertInteraction, createExploration, exploreMove } from '../src/modules/exploration/index';
const map = (): RuntimeMapInput => ({ id: 'test', width: 6, height: 5, spawn: { x: 0, y: 2 },
  blocked: [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
  locations: [{ id: 'camp', cells: [{ x: 0, y: 3 }, { x: 1, y: 3 }] }] });
const world = () => placeEntity(createWorld(map()), 'player', { x: 0, y: 2 });
describe('world space and fog', () => {
  it('takes a defensive copy of input map and accepts explicit transparent collision cells', () => {
    const input = map(); const w = createWorld(input); input.blocked.length = 0;
    expect(w.map.blocked).toHaveLength(3);
    expect(hasLineOfSight(w, { x: 1, y: 2 }, { x: 3, y: 2 })).toBe(false);
    const transparent = createWorld({ ...map(), opaque: [] });
    expect(hasLineOfSight(transparent, { x: 1, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });
  it.each([
    { width: 0 }, { width: 257 }, { spawn: { x: 2, y: 2 } }, { blocked: [{ x: 6, y: 0 }] },
    { blocked: [{ x: 2, y: 2 }, { x: 2, y: 2 }] },
    { locations: [{ id: 'bad', cells: [{ x: 2, y: 1 }] }] },
    { locations: [{ id: 'dup', cells: [{ x: 1, y: 1 }] }, { id: 'dup', cells: [{ x: 1, y: 0 }] }] },
  ])('rejects invalid map %j', patch => expect(() => createWorld({ ...map(), ...patch })).toThrow());
  it('rejects teleport, diagonal, same cell, wall, entity collision and bounds without mutation', () => {
    let w = world(); w = placeEntity(w, 'npc', { x: 0, y: 1 }); const before = structuredClone(w);
    for (const target of [{ x: 1, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 1 }, { x: 4, y: 2 }, { x: -1, y: 2 }]) expect(() => moveEntity(w, 'player', target)).toThrow();
    w = moveEntity(w, 'player', { x: 1, y: 2 });
    expect(() => moveEntity(w, 'player', { x: 2, y: 2 })).toThrow();
    expect(entity(before, 'player').position).toEqual({ x: 0, y: 2 });
    expect(entity(w, 'player').position).toEqual({ x: 1, y: 2 });
  });
  it('supports arbitrary and prototype-shaped entity IDs, rejects duplicates', () => {
    const w = placeEntity(world(), '__proto__', { x: 1, y: 1 });
    expect(entity(w, '__proto__').id).toBe('__proto__');
    expect(() => placeEntity(w, '__proto__', { x: 4, y: 4 })).toThrow();
  });
  it('fog reveals the wall face but hides behind it and retains explored cells', () => {
    const w = world(); const e = createExploration(w, 'player', 4);
    expect(e.visible).toContain('2,2'); expect(e.visible).not.toContain('3,2');
    const moved = exploreMove(w, e, { x: 0, y: 3 });
    expect(moved.exploration.explored).toEqual(expect.arrayContaining(e.explored));
    expect(e.currentLocations).toEqual([]);
  });
  it('no diagonal corner peeking; line of sight is symmetric for walkable endpoints', () => {
    const w = createWorld({ id: 'corners', width: 3, height: 3, spawn: { x: 0, y: 0 }, blocked: [{ x: 1, y: 0 }], locations: [] });
    expect(hasLineOfSight(w, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    const points = Array.from({ length: 9 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3) })).filter(p => !(p.x === 1 && p.y === 0));
    for (const a of points) for (const b of points) expect(hasLineOfSight(w, a, b)).toBe(hasLineOfSight(w, b, a));
  });
  it('leaving a cell out of sight preserves its explored record without treating it as currently visible', () => {
    let w = placeEntity(createWorld({ id: 'open', width: 5, height: 1, spawn: { x: 0, y: 0 }, blocked: [], locations: [] }), 'player', { x: 0, y: 0 });
    let e = createExploration(w, 'player', 1);
    for (const x of [1, 2, 3]) { const moved = exploreMove(w, e, { x, y: 0 }); w = moved.world; e = moved.exploration; }
    expect(e.visible).not.toContain('0,0'); expect(e.explored).toContain('0,0'); expect(e.visible).toContain('4,0');
  });
  it('emits enter once within a multi-cell location, then emits on reentry', () => {
    const w = world(), e = createExploration(w, 'player');
    const first = exploreMove(w, e, { x: 0, y: 3 }); expect(first.signals.map(s => s.locationId)).toEqual(['camp']);
    const inside = exploreMove(first.world, first.exploration, { x: 1, y: 3 }); expect(inside.signals).toEqual([]);
    const outside = exploreMove(inside.world, inside.exploration, { x: 1, y: 4 }); expect(outside.signals).toEqual([]);
    expect(exploreMove(outside.world, outside.exploration, { x: 1, y: 3 }).signals).toHaveLength(1);
  });
  it('interaction needs a nearby currently visible target and rejects self', () => {
    let w = placeEntity(world(), 'near', { x: 1, y: 2 }); w = placeEntity(w, 'far', { x: 4, y: 2 });
    const e = createExploration(w, 'player');
    expect(() => assertInteraction(w, e, 'near')).not.toThrow();
    expect(() => assertInteraction(w, e, 'far')).toThrow();
    expect(() => assertInteraction(w, e, 'far', 8)).toThrow();
    expect(() => assertInteraction(w, e, 'player')).toThrow();
  });
});
