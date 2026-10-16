import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const sample = JSON.parse(readFileSync(new URL('../../docs/examples/character-pixel-v1/character.json', import.meta.url), 'utf8'));

async function exported(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出显示参数', exact: true }).click()]);
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}
test('player and NPC share visual input, responsive preview and exact JSON roundtrip', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/character-pixel.html'); await expect(page.locator('[data-renderer]')).toHaveAttribute('data-renderer', 'pixel-v1');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const npc = await exported(page);
  await page.getByLabel('角色归属', { exact: true }).selectOption('player'); const player = await exported(page);
  expect(player.version).toBe('character-visual/1'); expect(player.actor.actorId).toBe('pixel-sample:player');
  expect(player.actor.appearance).toEqual(npc.actor.appearance); expect(player.pose).toEqual(npc.pose);
  expect(Object.keys(player.actor).sort()).toEqual(['actorId', 'appearance', 'gender']);
  await page.getByLabel('导入人物 JSON', { exact: true }).setInputFiles({ name: 'actor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(npc)) });
  await expect.poll(async () => (await exported(page)).actor.actorId).toBe(npc.actor.actorId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});
test('unsupported appearance explicitly falls back, strict mode rejects, and layers share the full-body anchor', async ({ page }) => {
  await page.goto('/character-pixel.html'); await expect(page.locator('[data-renderer]')).toHaveAttribute('data-renderer', 'pixel-v1');
  await page.getByLabel('发型', { exact: true }).selectOption('long'); await expect(page.locator('[data-renderer]')).toHaveAttribute('data-renderer', 'rig-v2');
  const result = await page.evaluate(async actor => {
    const apiPath = '/src/application/character-visuals.ts', artPath = '/src/presentation/character-visuals.ts';
    const api = await import(apiPath); const art = await import(artPath); await art.loadCharacterVisuals();
    actor.appearance.parts.body.styleId = 'tall';
    const before = JSON.stringify(actor), request = api.createCharacterVisualFrame(actor as never, { action: 'wave', direction: 'SE', progress: .4 });
    const full = art.renderCharacterVisualFrame(request), top = art.renderCharacterVisualFrame(request, { layers: ['top'], effects: false });
    const all = full.canvas.getContext('2d')!.getImageData(0, 0, 384, 384).data, shirt = top.canvas.getContext('2d')!.getImageData(0, 0, 384, 384).data;
    let outside = 0, occupied = 0; for (let p = 3; p < shirt.length; p += 4) if (shirt[p]) { occupied++; if (!all[p]) outside++; }
    full.canvas.width = top.canvas.width = 0; const unchanged = before === JSON.stringify(actor);
    actor.appearance.parts.hair.styleId = 'long'; const unsupported = api.createCharacterVisualFrame(actor as never);
    const fallback = art.renderCharacterVisualFrame(unsupported); fallback.canvas.width = 0;
    let error = ''; try { art.renderCharacterVisualFrame(unsupported, { renderer: 'pixel-v1' }); } catch (e) { error = String(e); }
    return { occupied, outside, unchanged, backend: fallback.renderer, reason: fallback.fallbackReason, error };
  }, structuredClone(sample));
  expect(result.occupied).toBeGreaterThan(0); expect(result.outside).toBe(0); expect(result.unchanged).toBe(true);
  expect(result.backend).toBe('rig-v2'); expect(result.reason).toContain('hair/long'); expect(result.error).toContain('不支持');
});
test('all actions render, pose exports keep the same shape and invalid imports do not replace the actor', async ({ page }) => {
  await page.goto('/character-pixel.html'); await expect(page.locator('[data-renderer]')).toHaveAttribute('data-renderer', 'pixel-v1'); await page.getByRole('button', { name: '暂停', exact: true }).click();
  const before = await exported(page);
  await page.getByLabel('导入人物 JSON', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...before, actor: { ...before.actor, gender: 'other' } })) });
  await expect(page.getByRole('alert')).not.toBeEmpty(); expect((await exported(page)).actor).toEqual(before.actor);
  for (const action of ['walk', 'talk', 'wave', 'sit', 'sleep', 'attack', 'heavy-attack', 'cast', 'fall', 'downed', 'dead', 'block', 'dodge']) {
    await page.getByLabel('动作', { exact: true }).selectOption(action); await expect(page.locator('[data-renderer]')).toHaveAttribute('data-renderer', 'pixel-v1');
    await expect(page.locator('[data-action]')).toHaveAttribute('data-action', action);
  }
  expect((await exported(page)).pose.action).toBe('dodge');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出 PNG', exact: true }).click()]);
  const bytes = await readFile((await download.path())!); expect(bytes.readUInt32BE(16)).toBe(384); expect(bytes.readUInt32BE(20)).toBe(384);
});
test('twelve expressions and seven spell effects remain visibly distinct in the new renderer', async ({ page }) => {
  await page.goto('/character-pixel.html'); await expect(page.locator('[data-renderer]')).toHaveAttribute('data-renderer', 'pixel-v1');
  const result = await page.evaluate(async actor => {
    const apiPath = '/src/application/character-visuals.ts', artPath = '/src/presentation/character-visuals.ts', domainPath = '/src/application/character-motion.ts';
    const api = await import(apiPath), art = await import(artPath), domain = await import(domainPath);
    const signatures = (poses: unknown[]) => poses.map(pose => { const result = art.renderCharacterVisualFrame(api.createCharacterVisualFrame(actor, pose)); const value = result.canvas.toDataURL(); result.canvas.width = 0; return value; });
    return { expressions: new Set(signatures(Object.keys(domain.EXPRESSIONS).map(expression => ({ action: 'stand', direction: 'S', expression })))).size, spells: new Set(signatures(domain.SPELLS.map((spell: string) => ({ action: 'cast', direction: 'SE', spell, progress: .5, expression: 'focused' })))).size };
  }, structuredClone(sample));
  expect(result.expressions).toBe(12); expect(result.spells).toBe(7);
});
