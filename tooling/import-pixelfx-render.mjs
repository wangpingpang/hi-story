// Offline PixelFX renderer. Only the locked reviewed source tree is imported.
// Unlike upstream spriteSheet's canvas.paste, copy straight RGBA without multiplying
// RGB by alpha a second time. The game renderer will composite exactly once.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw Error('Usage: node tooling/import-pixelfx-render.mjs <source cache> <output cache>');
const source = resolve(sourceArg), out = resolve(outputArg);
const lock = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'import-pixelfx-sources.json'), 'utf8'));
for (const entry of lock.files) {
  const bytes = readFileSync(join(source, entry.path));
  const actual = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if (actual !== entry.gitBlobSha1) throw Error(`Unreviewed source: ${entry.path}`);
}
const {loadEffect, renderFrames} = await import(pathToFileURL(join(source, 'tools/lib/fxlib.mjs')).href);
const selections = {fire:'fire/fire-ring',ice:'ice/snowflake-burst',lightning:'lightning/zap-hit',wind:'nature/tornado',arcane:'arcane/mana-burst',healing:'holy/heal-aoe'};
mkdirSync(out, {recursive:true});
for (const [kind, id] of Object.entries(selections)) {
  const fx = await loadEffect(id);
  const rendered = renderFrames(fx, {actor:false,bg:'none'});
  writeFileSync(join(out, `${kind}.rgba`), Buffer.concat(rendered.frames.map(frame => Buffer.from(frame.clear))));
  writeFileSync(join(out, `${kind}.json`), JSON.stringify({id,width:rendered.w,height:rendered.h,frameCount:rendered.n,fps:rendered.fps,pivot:fx.meta.origin,duration:fx.meta.duration,loop:fx.meta.loop,options:fx.meta.options}, null, 2)+'\n');
}
