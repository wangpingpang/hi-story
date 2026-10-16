import { describe, it, expect } from 'vitest';
import { generateCharacterWithParams, ACTIONS } from '../src/modules/characters';
import { createCharacterVisualFrame, validateCharacterVisualFrame } from '../src/modules/character-visuals';
import { pixelClip, pixelFrameAt } from '../src/presentation/pixel-character/clips';
import { pixelSupport } from '../src/presentation/pixel-character/materials';

const actor = (control: 'npc' | 'player' = 'npc') => generateCharacterWithParams({
  seed: `interface:${control}`, control, gender: 'female', appearanceVersion: 'appearance/3',
  appearanceParts: { hair: { styleId: 'crop' }, face: { styleId: 'oval' }, top: { styleId: 'shirt' }, pants: { styleId: 'straight' }, shoes: { styleId: 'ankle' }, accessory: { styleId: 'satchel' } },
});
describe('universal character visual protocol', () => {
  it('accepts generated NPCs, players and a minimal runner projection without requiring their classes', () => {
    for (const control of ['npc', 'player'] as const) {
      const source = actor(control), before = structuredClone(source);
      const frame = createCharacterVisualFrame(source, { action: 'walk', direction: 'NW', progress: .4 });
      expect(source).toEqual(before); expect(frame.actor.actorId).toBe(source.actorId);
      expect(Object.keys(frame.actor).sort()).toEqual(['actorId', 'appearance', 'gender']);
      expect(pixelSupport(frame)).toBeUndefined();
      validateCharacterVisualFrame(JSON.parse(JSON.stringify(frame)));
    }
    const source = actor();
    expect(createCharacterVisualFrame({ actorId: 'runner:creature-42', gender: source.gender, appearance: source.appearance }).actor.actorId).toBe('runner:creature-42');
    const inline = createCharacterVisualFrame({ actorId: 'profession:player-1', gender: source.gender, appearance: source.appearance, control: 'player', profession: 'ranger', inventory: ['bow'] });
    expect(Object.keys(inline.actor).sort()).toEqual(['actorId', 'appearance', 'gender']);
  });
  it('takes an immutable independent snapshot, leaving identity and gameplay fields with the caller', () => {
    const source = actor(), frame = createCharacterVisualFrame(source);
    const before = frame.actor.appearance.parts.top.color;
    source.appearance.parts.top.color = before === '#ad6650' ? '#587b72' : '#ad6650';
    expect(frame.actor.appearance.parts.top.color).toBe(before);
    expect(() => { (frame.actor.appearance.parts.top as { color: string }).color = '#ad6650'; }).toThrow();
    expect(JSON.stringify(frame)).not.toContain('personality'); expect(JSON.stringify(frame)).not.toContain('motivation');
  });
  it('rejects invalid display requests before any renderer touches them', () => {
    const source = actor();
    for (const pose of [{ progress: NaN }, { progress: -1 }, { progress: 1.01 }, { direction: 'north' }, { weapon: 'missing' }, { action: 'teleport' }]) expect(() => createCharacterVisualFrame(source, pose as never)).toThrow();
    expect(() => createCharacterVisualFrame({ ...source, actorId: '' })).toThrow();
    expect(() => validateCharacterVisualFrame({ ...createCharacterVisualFrame(source), version: 'character-visual/2' } as never)).toThrow('协议版本');
  });
  it('reports unsupported artwork explicitly instead of changing actor appearance', () => {
    const source = actor(); source.appearance.parts.hair.styleId = 'long';
    expect(pixelSupport(createCharacterVisualFrame(source))).toContain('hair/long');
    source.gender = 'male'; expect(pixelSupport(createCharacterVisualFrame(source))).toContain('女性身体');
  });
  it('projects visual pose fields without copying runner position, health or event bookkeeping', () => {
    const frame = createCharacterVisualFrame(actor(), { action: 'walk', progress: .2, hp: 30, position: { x: 42, y: 50 }, eventIds: ['attack:1'] } as never);
    expect(Object.keys(frame.pose).sort()).toEqual(['action', 'direction', 'expression', 'progress', 'spell', 'weapon']);
  });
});
describe('authored pixel animation timing', () => {
  it('keeps the runner action duration/loop contract for every existing action', () => {
    for (const action of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) {
      const clip = pixelClip(action);
      expect(clip.durationMs).toBe(ACTIONS[action].duration); expect(clip.loop).toBe(ACTIONS[action].loop);
      expect(clip.frames.reduce((sum, f) => sum + f.durationMs, 0)).toBe(clip.durationMs);
      expect(clip.frames.every(f => Number.isInteger(f.durationMs) && f.durationMs > 0)).toBe(true);
      expect(pixelFrameAt(action, 1).index).toBe(clip.loop ? 0 : clip.frames.length - 1);
    }
  });
  it('has a fast attack strike, readable anticipation and recovery, and correct interval boundaries', () => {
    const clip = pixelClip('attack');
    expect(clip.frames[2].durationMs).toBeLessThan(clip.frames[1].durationMs);
    expect(clip.frames.at(-1)!.durationMs).toBeGreaterThan(clip.frames[2].durationMs);
    const boundary = clip.frames[0].durationMs / clip.durationMs;
    expect(pixelFrameAt('attack', boundary - .00001).index).toBe(0);
    expect(pixelFrameAt('attack', boundary).index).toBe(1);
    expect(() => pixelFrameAt('walk', NaN)).toThrow();
  });
});
