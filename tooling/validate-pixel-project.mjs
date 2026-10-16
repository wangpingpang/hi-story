// Independent Aseprite parser + byte-for-byte comparison against the live browser renderer.
// Install the optional checker outside the game, then pass ASE_PARSER_PATH to its Aseprite.js.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const root = fileURLToPath(new URL('..', import.meta.url)), require = createRequire(import.meta.url);
const Aseprite = require(process.env.ASE_PARSER_PATH || 'ase-parser');
const directory = resolve(root, 'docs/examples/character-pixel-v1');
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
for (const item of manifest.assets) assert.equal(createHash('sha256').update(await readFile(resolve(directory, item.file))).digest('hex'), item.sha256, item.file);
const source = JSON.parse(await readFile(resolve(root, 'public/assets/characters/pixel-v1/manifest.json'), 'utf8'));
assert.deepEqual(source, JSON.parse(await readFile(resolve(root, 'src/presentation/pixel-character/materials.json'), 'utf8')));
assert.equal(createHash('sha256').update(await readFile(resolve(root, 'public/assets/characters/pixel-v1', source.file))).digest('hex'), source.sha256);
const bytes = await readFile(resolve(directory, 'traveler.aseprite')), ase = new Aseprite(bytes, 'traveler.aseprite'); ase.parse();
assert.equal(bytes.readUInt32LE(0), bytes.length); assert.equal(ase.numFrames, 80); assert.equal(ase.width, 96); assert.equal(ase.height, 96); assert.equal(ase.layers.length, 29);
assert.equal(ase.tags.length, manifest.tags.length);
for (let i = 0; i < ase.tags.length; i++) for (const key of ['name', 'from', 'to']) assert.equal(ase.tags[i][key], manifest.tags[i][key]);
const hashes = ase.frames.map(frame => {
  const flat = Buffer.alloc(96 * 96 * 4), cels = [...frame.cels].sort((a, b) => a.layerIndex + a.zIndex - b.layerIndex - b.zIndex || a.zIndex - b.zIndex);
  for (const cel of cels) {
    assert.equal(cel.opacity, 255); assert.equal(cel.rawCelData.length, cel.w * cel.h * 4);
    for (let y = 0; y < cel.h; y++) for (let x = 0; x < cel.w; x++) {
      const source = (y * cel.w + x) * 4, a = cel.rawCelData[source + 3]; assert.ok(a === 0 || a === 255);
      if (!a) continue; const dx = cel.xpos + x, dy = cel.ypos + y; assert.ok(dx >= 0 && dy >= 0 && dx < 96 && dy < 96);
      cel.rawCelData.copy(flat, (dy * 96 + dx) * 4, source, source + 4);
    }
  }
  return createHash('sha256').update(flat).digest('hex');
});
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } }); let browser;
try {
  await server.listen(); browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/character-pixel.html`);
  const actor = JSON.parse(await readFile(resolve(directory, 'character.json'), 'utf8'));
  const actual = await page.evaluate(async ({ actor, tags }) => {
    const api = await import('/src/application/character-visuals.ts'), adapter = await import('/src/presentation/character-visuals.ts'), art = await import('/src/presentation/pixel-character/renderer.ts'), clips = await import('/src/presentation/pixel-character/clips.ts');
    await adapter.loadCharacterVisuals(); const results = [];
    for (const tag of tags) { const separator = tag.name.lastIndexOf('-'), action = tag.name.slice(0, separator), direction = tag.name.slice(separator + 1); const clip = clips.pixelClip(action); let elapsed = 0;
      for (const frame of clip.frames) {
        const pose = { action, direction, progress: (elapsed + frame.durationMs / 2) / clip.durationMs, weapon: action === 'attack' ? 'dagger' : 'unarmed', expression: action === 'attack' ? 'focused' : action === 'talk' ? 'happy' : 'neutral' };
        const rendered = art.renderPixelCharacter(api.createCharacterVisualFrame(actor, pose));
        const rgba = rendered.native.getContext('2d').getImageData(0, 0, 96, 96).data;
        const hash = await crypto.subtle.digest('SHA-256', rgba); results.push({ hash: Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, '0')).join(''), duration: frame.durationMs });
        rendered.canvas.width = rendered.native.width = 0; elapsed += frame.durationMs;
      }
    }
    return results;
  }, { actor, tags: manifest.tags });
  assert.equal(actual.length, hashes.length);
  for (let i = 0; i < hashes.length; i++) { assert.equal(actual[i].hash, hashes[i], `RGBA frame ${i}`); assert.equal(actual[i].duration, ase.frames[i].frameDuration, `timing frame ${i}`); }
  const result = { parser: 'ase-parser/0.0.19', frames: hashes.length, layers: ase.layers.length, tags: ase.tags.length, pixelIdenticalFrames: actual.length, frameTiming: 'passed', linkedCels: ase.frames.flatMap(f => f.cels).filter(c => c.celType === 1).length };
  await writeFile(resolve(root, 'docs/evidence/character-pixel-v1/aseprite-validation.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await server.close(); }
