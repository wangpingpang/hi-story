import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const base='public/assets/effects/pixelfx/';
const json=(name:string)=>JSON.parse(readFileSync(base+name,'utf8'));
const manifest=json('manifest.json'),verification=json('verification.json'),sources=json('sources.json');
const lock=JSON.parse(readFileSync('tooling/import-pixelfx-sources.json','utf8'));
const expected={fire:'fire/fire-ring',ice:'ice/snowflake-burst',lightning:'lightning/zap-hit',wind:'nature/tornado',arcane:'arcane/mana-burst',healing:'holy/heal-aoe'};
const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');

describe('PixelFX selected offline assets',()=>{
 it('pins the selected sources and publishes their license without upstream fonts or executable code',()=>{
  expect(manifest.version).toBe('pixelfx-combat-assets/1');
  expect(manifest.source.commit).toBe('5294518ce7c72e48b6100a744596e0acf57f2826');
  expect(sources.commit).toBe(manifest.source.commit);
  expect(verification.sourceCommit).toBe(manifest.source.commit);
  expect(sources.files.map(({path,gitBlobSha1}:{path:string;gitBlobSha1:string})=>({path,gitBlobSha1}))).toEqual(lock.files);
  expect(sources.files.some(({path}:{path:string})=>path.startsWith('gallery/'))).toBe(false);
  const license=readFileSync(base+'LICENSE'),notice=readFileSync(base+'NOTICE.md');
  expect(sha(license)).toBe(sources.files.find(({path}:{path:string})=>path==='LICENSE').sha256);
  expect(sha(notice)).toBe(sources.files.find(({path}:{path:string})=>path==='NOTICE.md').sha256);
  expect(license.toString()).toContain('MIT License');
  expect(notice.toString()).toContain('not covered by this repository');
  expect(readdirSync(base).every(path=>! /\.(js|mjs|ttf|woff2?)$/.test(path))).toBe(true);
  expect(Object.keys(manifest.effects).sort()).toEqual(Object.keys(expected).sort());
 });
 for(const [kind,id] of Object.entries(expected))it(`${kind}: complete native frame sequence, exact asset hash and valid preview/pivot`,()=>{
  const asset=manifest.effects[kind],evidence=verification.effects[kind];
  expect(asset.source.id).toBe(id);
  expect(asset.source.actorRendered).toBe(false);
  expect(asset.url).toBe(`assets/effects/pixelfx/${kind}.webp`);
  const bytes=readFileSync('public/'+asset.url);
  expect(bytes.subarray(0,4).toString()).toBe('RIFF');
  expect(bytes.subarray(8,12).toString()).toBe('WEBP');
  expect(bytes.subarray(12,16).toString()).toBe('VP8L'); // lossless bitstream
  const bits=bytes.readUInt32LE(21);
  expect((bits&0x3fff)+1).toBe(asset.width);
  expect(((bits>>>14)&0x3fff)+1).toBe(asset.height);
  expect(sha(bytes)).toBe(asset.sha256);
  expect(bytes.length).toBe(asset.bytes);
  expect(asset.sha256).toBe(evidence.sha256);
  expect(evidence.pixelRoundTrip).toBe(true);
  const n=Math.round(asset.source.durationSeconds*asset.source.fps)+(asset.source.loop?0:1);
  expect(asset.frames).toHaveLength(n);
  expect(evidence.frames).toHaveLength(n);
  expect(evidence.frameCount).toBe(n);
  const [,,fw,fh]=asset.frames[0].rect;
  expect(asset.pivot[0]).toBeGreaterThanOrEqual(0);expect(asset.pivot[0]).toBeLessThanOrEqual(fw);
  expect(asset.pivot[1]).toBeGreaterThanOrEqual(0);expect(asset.pivot[1]).toBeLessThanOrEqual(fh);
  expect(asset.anchor).toBe(kind==='lightning'?'body':'ground');
  expect(asset.displayHeight).toBeGreaterThan(0);
  expect(asset.frames.reduce((sum:number,f:{durationMs:number})=>sum+f.durationMs,0)).toBeCloseTo(asset.durationMs,5);
  const rectangles=new Set();
  for(const [i,frame] of asset.frames.entries()){
   const [x,y,w,h]=frame.rect;
   expect(w).toBe(fw);expect(h).toBe(fh);
   expect(x%w).toBe(0);expect(y%h).toBe(0);
   expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);
   expect(x+w).toBeLessThanOrEqual(asset.width);expect(y+h).toBeLessThanOrEqual(asset.height);
   expect(frame.durationMs).toBeCloseTo(1000/asset.source.fps,5);
   expect(evidence.frames[i].rgbaSha256).toMatch(/^[a-f0-9]{64}$/);
   rectangles.add(`${x},${y}`);
  }
  expect(rectangles.size).toBe(n);
  expect(evidence.frames[asset.previewFrame].visiblePixels).toBeGreaterThan(0);
  expect(asset.source.sha256).toBe(sources.files.find(({path}:{path:string})=>path===`src/fx/${id}.js`).sha256);
 });
});
