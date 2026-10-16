import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(root, 'docs/examples/character-pixel-v1');
const evidence = resolve(root, 'docs/evidence/character-pixel-v1');
const temporary = await mkdtemp(resolve(tmpdir(), 'character-pixel-export-'));
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
let browser;
const unbase64 = data => Buffer.from(data.split(',')[1], 'base64');
try {
  await server.listen(); await mkdir(out, { recursive: true }); await mkdir(evidence, { recursive: true });
  const actor = JSON.parse(await readFile(resolve(out, 'character.json'), 'utf8'));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(url + '/character-pixel.html');
  await page.getByRole('status').filter({ hasText: '精修样板' }).waitFor();
  await page.evaluate(async actor => {
    window.__pixel = await import('/src/presentation/pixel-character/renderer.ts');
    window.__clips = await import('/src/presentation/pixel-character/clips.ts');
    window.__visual = await import('/src/application/character-visuals.ts');
    window.__adapter = await import('/src/presentation/character-visuals.ts');
    await window.__adapter.loadCharacterVisuals(); window.__actor = actor;
  }, actor);
  const frameRecords = [], tags = [];
  const sequences = [{ action: 'stand', direction: 'SE' }, ...['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'].map(direction => ({ action: 'walk', direction })), { action: 'talk', direction: 'SE' }, { action: 'attack', direction: 'SE', weapon: 'dagger' }];
  for (const sequence of sequences) {
    const clip = await page.evaluate(action => window.__clips.pixelClip(action), sequence.action);
    const from = frameRecords.length; let elapsed = 0;
    for (const key of clip.frames) {
      const progress = Math.min(1, (elapsed + key.durationMs / 2) / clip.durationMs);
      const result = await page.evaluate(({ sequence, progress }) => {
        const f = window.__visual.createCharacterVisualFrame(window.__actor, { ...sequence, progress, expression: sequence.action === 'attack' ? 'focused' : sequence.action === 'talk' ? 'happy' : 'neutral' });
        const rendered = window.__pixel.renderPixelCharacter(f, { captureLayers: true });
        const result = { image: rendered.native.toDataURL(), layers: rendered.layers.map(l => ({ name: l.name, slot: l.slot, image: l.canvas.toDataURL() })) };
        rendered.canvas.width = rendered.native.width = 0; rendered.layers.forEach(l => { l.canvas.width = 0; }); return result;
      }, { sequence, progress });
      const index = frameRecords.length, file = `frame-${index}.png`;
      await writeFile(resolve(temporary, file), unbase64(result.image));
      const layers = [];
      for (let i = 0; i < result.layers.length; i++) {
        const layer = result.layers[i], file = `layer-${index}-${i}.png`;
        await writeFile(resolve(temporary, file), unbase64(layer.image)); layers.push({ name: layer.name, slot: layer.slot, file });
      }
      frameRecords.push({ file, layers, durationMs: key.durationMs, ...sequence, progress }); elapsed += key.durationMs;
    }
    tags.push({ name: `${sequence.action}-${sequence.direction}`, from, to: frameRecords.length - 1, loop: clip.loop, durationMs: clip.durationMs });
  }
  await writeFile(resolve(temporary, 'layers.json'), JSON.stringify({ frames: frameRecords, tags }));
  const aseprite = JSON.parse(execFileSync('python3', [resolve(root, 'tooling/encode-pixel-project.py'), temporary, out]).toString());
  const sheets = await page.evaluate(() => {
    const render = (pose, renderer = 'pixel-v1', parts = {}) => {
      const actor = structuredClone(window.__actor); for (const [slot, id] of Object.entries(parts)) actor.appearance.parts[slot].styleId = id;
      return window.__adapter.renderCharacterVisualFrame(window.__visual.createCharacterVisualFrame(actor, pose), { renderer }).canvas;
    };
    const create = (columns, rows, title) => { const c = document.createElement('canvas'); c.width = columns * 288; c.height = rows * 316 + 56; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#eee8dc'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#315247'; ctx.font = '20px "Noto Sans CJK SC",sans-serif'; ctx.fillText(title, 20, 35); return { c, ctx }; };
    const tile = (sheet, image, column, row, label) => { const x = column * 288, y = 56 + row * 316; sheet.ctx.fillStyle = '#faf6ec'; sheet.ctx.fillRect(x + 4, y + 4, 280, 308); sheet.ctx.drawImage(image, x, y, 288, 288); image.width = 0; sheet.ctx.fillStyle = '#315247'; sheet.ctx.textAlign = 'center'; sheet.ctx.font = '14px "Noto Sans CJK SC",sans-serif'; sheet.ctx.fillText(label, x + 144, y + 302); sheet.ctx.textAlign = 'left'; };
    const preview = create(3, 2, '人物动作精修样板 · 同一套七部件');
    const poses = [{ action: 'stand', direction: 'S', label: '站立' }, { action: 'walk', direction: 'SE', label: '行走' }, { action: 'talk', direction: 'S', expression: 'happy', label: '对话' }, { action: 'sit', direction: 'SE', label: '坐下' }, { action: 'attack', direction: 'SE', weapon: 'dagger', expression: 'focused', label: '匕首攻击' }, { action: 'cast', direction: 'SE', spell: 'healing', expression: 'focused', label: '治疗施法' }];
    poses.forEach((pose, i) => tile(preview, render({ ...pose, progress: .4 }), i % 3, Math.floor(i / 3), pose.label));
    const directions = create(4, 2, '八方向 · 共用骨骼与服装连接点');
    ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'].forEach((direction, i) => tile(directions, render({ action: 'walk', direction, progress: .3 }), i % 4, Math.floor(i / 4), direction));
    const bodies = create(4, 2, '八种身材 · 衣物随肩腰髋与四肢适配');
    ['slim', 'balanced', 'broad', 'stocky', 'tall', 'compact', 'muscular', 'heavy'].forEach((body, i) => tile(bodies, render({ action: 'stand', direction: 'SE', progress: .3 }, 'pixel-v1', { body }), i % 4, Math.floor(i / 4), body));
    const comparison = create(3, 2, '同参数对比 · 上：原版 / 下：精修样板');
    ['stand', 'walk', 'attack'].forEach((action, i) => { for (const [row, renderer] of ['rig-v2', 'pixel-v1'].entries()) tile(comparison, render({ action, direction: 'SE', weapon: 'dagger', progress: .4 }, renderer), i, row, action); });
    const walk = document.createElement('canvas'); walk.width = walk.height = 768; const wctx = walk.getContext('2d'); wctx.imageSmoothingEnabled = false;
    for (const [row, direction] of ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'].entries()) for (let f = 0; f < 8; f++) { const frame = window.__pixel.renderPixelCharacter(window.__visual.createCharacterVisualFrame(window.__actor, { action: 'walk', direction, progress: (f + .5) / 8 })); wctx.drawImage(frame.native, f * 96, row * 96); frame.canvas.width = frame.native.width = 0; }
    return { 'preview.png': preview.c.toDataURL(), 'directions.png': directions.c.toDataURL(), 'body-fits.png': bodies.c.toDataURL(), 'comparison.png': comparison.c.toDataURL(), 'walk.png': walk.toDataURL() };
  });
  for (const [name, data] of Object.entries(sheets)) await writeFile(resolve(out, name), unbase64(data));
  // Native-pixel connectivity check. Props/effects are omitted from this silhouette measure.
  const cases = [];
  const api = await server.ssrLoadModule('/src/modules/characters/index.ts');
  for (const body of api.appearanceCatalogFor('appearance/3').body.styles) for (const direction of api.DIRECTIONS) for (const action of Object.keys(api.ACTIONS)) for (const progress of action === 'walk' ? [0, .125, .25, .375, .5, .625, .75, .875] : [0, .5, 1]) cases.push({ body: body.id, direction, action, progress });
  const failures = []; let edgeFrames = 0, disconnectedFrames = 0;
  for (let at = 0; at < cases.length; at += 64) {
    const batch = await page.evaluate(cases => cases.map(test => {
      const actor = structuredClone(window.__actor); actor.appearance.parts.body.styleId = test.body; actor.appearance.parts.accessory.styleId = 'none';
      const frame = window.__pixel.renderPixelCharacter(window.__visual.createCharacterVisualFrame(actor, { ...test, weapon: 'greatsword', spell: 'summon' }), { effects: false });
      const pixels = frame.native.getContext('2d').getImageData(0, 0, 96, 96).data, seen = new Uint8Array(9216), queue = new Int32Array(9216), sizes = []; let edge = false;
      for (let p = 0; p < 9216; p++) { if (!pixels[p * 4 + 3]) continue; const x = p % 96, y = Math.floor(p / 96); if (!x || !y || x === 95 || y === 95) edge = true; if (seen[p]) continue; let head = 0, tail = 1; queue[0] = p; seen[p] = 1; while (head < tail) { const q = queue[head++], x = q % 96, y = Math.floor(q / 96); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= 96 || ny >= 96) continue; const next = ny * 96 + nx; if (!seen[next] && pixels[next * 4 + 3]) { seen[next] = 1; queue[tail++] = next; } } } if (tail >= 3) sizes.push(tail); }
      frame.canvas.width = frame.native.width = 0; return { ...test, components: sizes.sort((a, b) => b - a), edge };
    }), cases.slice(at, at + 64));
    for (const test of batch) { if (test.edge) edgeFrames++; if (test.components.length > 1) disconnectedFrames++; if (test.edge || test.components.length > 1) failures.push(test); }
  }
  const audit = { frames: cases.length, bodyStyles: 8, directions: 8, actions: 25, minimumComponentPixels: 3, disconnectedFrames, edgeFrames, failures };
  await writeFile(resolve(evidence, 'fit-audit.json'), JSON.stringify(audit, null, 2) + '\n');
  const manifest = { version: 'character-pixel-examples/1', artVersion: 'character-pixel-art/1', protocol: 'character-visual/1', frame: { width: 96, height: 96, anchor: { x: 48, y: 82 } }, outputFrame: { width: 384, height: 384, anchor: { x: 192, y: 329 } }, tags, aseprite, audit: { ...audit, failures: failures.slice(0, 10) }, assets: [] };
  for (const file of ['preview.png', 'directions.png', 'body-fits.png', 'comparison.png', 'walk.png', 'stand.gif', 'walk.gif', 'talk.gif', 'attack.gif', 'traveler.aseprite']) { const data = await readFile(resolve(out, file)); manifest.assets.push({ file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }); }
  await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.screenshot({ path: resolve(evidence, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 }); await page.screenshot({ path: resolve(evidence, 'narrow.png'), fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(JSON.stringify({ aseprite, fitAudit: { ...audit, failures: failures.slice(0, 5) }, out }, null, 2));
  if (edgeFrames || disconnectedFrames) throw Error('像素样板贴合检查未通过');
} finally { await browser?.close(); await server.close(); await rm(temporary, { recursive: true, force: true }); }
