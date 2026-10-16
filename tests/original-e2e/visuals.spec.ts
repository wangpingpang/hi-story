import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const actors = JSON.parse(readFileSync(new URL('../../docs/examples/assembled/characters.json', import.meta.url), 'utf8')).characters;

test('original atlas actor retains the exact same artwork from portrait to standing animation', async ({ page }) => {
  await page.goto('/?view=character-motion#character=' + encodeURIComponent(JSON.stringify({ appearance: actors[0].appearance, gender: actors[0].gender })));
  const result = await page.evaluate(async actors => {
    const path = '/src/presentation/character-art.ts', motionPath = '/src/presentation/character-motion-art.ts', apiPath = '/src/application/character-visuals.ts', adapterPath = '/src/presentation/character-visuals.ts';
    const art = await import(path), motion = await import(motionPath), api = await import(apiPath), adapter = await import(adapterPath); await art.loadCharacterArt('appearance/1');
    const crop = (c: HTMLCanvasElement) => { const ctx = c.getContext('2d')!, d = ctx.getImageData(0, 0, c.width, c.height).data; let left = c.width, top = c.height, right = -1, bottom = -1; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); } return [...ctx.getImageData(left, top, right - left + 1, bottom - top + 1).data]; };
    return actors.map((actor: typeof actors[number]) => {
      const before = JSON.stringify(actor), portrait = art.assembleCharacterCanvas(actor.appearance, actor.gender), frame = motion.renderCharacterMotionFrame(actor.appearance, actor.gender, { effects: false });
      const same = JSON.stringify(crop(portrait)) === JSON.stringify(crop(frame));
      const request = api.createCharacterVisualFrame({ ...actor, control: 'player', hp: 30, position: { x: 5, y: 7 } }, { action: 'walk', progress: .25 });
      const shown = adapter.renderCharacterVisualFrame(request, { effects: false });
      return { materialFamily: shown.materialFamily, renderer: shown.renderer, same, unchanged: before === JSON.stringify(actor), appearance: request.actor.appearance, original: actor.appearance, fields: Object.keys(request.actor).sort(), size: [shown.canvas.width, shown.canvas.height], anchor: shown.frame.anchor };
    });
  }, actors);
  for (const item of result) { expect(item.renderer).toBe('rig-v2'); expect(item.materialFamily).toBe('original-atlas'); expect(item.same).toBe(true); expect(item.unchanged).toBe(true); expect(item.appearance).toEqual(item.original); expect(item.fields).toEqual(['actorId', 'appearance', 'gender']); expect(item.size).toEqual([384, 384]); expect(item.anchor).toEqual({ x: 192, y: 329 }); }
});

test('original sprites keep distinct expressions and spells and shared layer registration', async ({ page }) => {
  await page.goto('/?view=character-motion');
  const result = await page.evaluate(async actor => {
    const path = '/src/presentation/character-motion-art.ts', domainPath = '/src/application/character-motion.ts'; const art = await import(path), domain = await import(domainPath); await art.loadDirectionalMaterials();
    const signatures = (poses: object[]) => poses.map(p => { const c = art.renderCharacterMotionFrame(actor.appearance, actor.gender, p); const sig = c.toDataURL(); c.width = 0; return sig; });
    const full = art.renderCharacterMotionFrame(actor.appearance, actor.gender, { action: 'wave', progress: .4, effects: false }), layer = art.renderCharacterMotionFrame(actor.appearance, actor.gender, { action: 'wave', progress: .4, effects: false, layers: ['top'] });
    const a = full.getContext('2d')!.getImageData(0, 0, 384, 384).data, b = layer.getContext('2d')!.getImageData(0, 0, 384, 384).data; let outside = 0, count = 0; for (let i = 3; i < b.length; i += 4) if (b[i]) { count++; if (!a[i]) outside++; }
    return { expressions: new Set(signatures(Object.keys(domain.EXPRESSIONS).map(expression => ({ expression })))).size, spells: new Set(signatures(domain.SPELLS.map((spell: string) => ({ action: 'cast', progress: .4, spell })))).size, outside, count };
  }, actors[0]);
  expect(result.expressions).toBe(12); expect(result.spells).toBe(7); expect(result.outside).toBe(0); expect(result.count).toBeGreaterThan(500);
});


test('default policy keeps the original art family and the pixel pilot requires explicit selection', async ({ page }) => {
  await page.goto('/?view=character-motion');
  const result = await page.evaluate(async actor => {
    const apiPath='/src/application/character-visuals.ts', artPath='/src/presentation/character-visuals.ts';
    const api=await import(apiPath), art=await import(artPath);await art.loadCharacterVisuals();
    const frame=api.createCharacterVisualFrame(actor);
    return { normal:art.characterVisualCapability(frame), pilot:art.characterVisualCapability(frame,'pixel-auto') };
  }, JSON.parse(readFileSync(new URL('../../docs/examples/character-pixel-v1/character.json', import.meta.url),'utf8')));
  expect(result.normal.renderer).toBe('rig-v2');expect(result.normal.materialFamily).toBe('directional-atlas');expect(result.pilot.renderer).toBe('pixel-v1');
});
