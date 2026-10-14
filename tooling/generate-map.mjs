import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { renderMapSvg } from './render-map.mjs';

async function save(path, content) { const absolute = resolve(path); await mkdir(dirname(absolute), { recursive: true }); await writeFile(absolute, content, 'utf8'); }
async function main() {
  const options = {}, args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!['--request', '--output', '--svg'].includes(key) || !value || value.startsWith('--') || options[key])
      throw new Error('用法：npm run maps:generate -- --request <参数.json> [--output <结果.json>] [--svg <校验图.svg>]');
    options[key] = value;
  }
  const inputPath = options['--request'] ?? fileURLToPath(new URL('../content/maps/example-request.json', import.meta.url));
  const request = JSON.parse(await readFile(inputPath, 'utf8'));
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { generateMap } = await server.ssrLoadModule('/src/modules/world/index.ts');
    const result = generateMap(request), json = JSON.stringify(result, null, 2) + '\n';
    if (options['--output']) await save(options['--output'], json);
    else process.stdout.write(json);
    if (!result.ok) { process.exitCode = 1; if (options['--output']) process.stderr.write(result.error.message + '\n'); return; }
    if (options['--svg']) await save(options['--svg'], renderMapSvg(result.map));
    if (options['--output']) process.stdout.write(JSON.stringify({ output: options['--output'], svg: options['--svg'] ?? null, ...result.map.summary }) + '\n');
  } finally { await server.close(); }
}
main().catch(error => { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n'); process.exitCode = 1; });
