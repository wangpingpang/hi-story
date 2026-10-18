import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MONSTER_ENCOUNTERS} from '../src/modules/story-planning';
import {resolveClipFrame,normalizedSpriteGeometry,type ModelManifest} from '../src/presentation/external-character-models';

it('两只魔物实际导入128组八向动作，图集哈希/帧界限/施法和跑步完整',()=>{
 let clips=0,frames=0;
 for(const m of MONSTER_ENCOUNTERS){const model=JSON.parse(readFileSync(`public/assets/monsters/molibaike/${m.modelId}/manifest.json`,'utf8')) as ModelManifest;expect(model.characterId).toBe(m.modelId);expect(model.availableClips).toBe(64);const atlases=new Map(model.atlases.map(a=>[a.id,a]));for(const a of model.atlases)expect(createHash('sha256').update(readFileSync(`public/${a.url}`)).digest('hex')).toBe(a.sha256);
  for(const action of [0,1,3,5,6,8,9,10])for(let direction=0;direction<8;direction++){
   const c=model.clips[`${action}:${direction}`],a=atlases.get(c.atlasId)!;expect(c.durationMs).toBe(c.frames.reduce((sum,f)=>sum+f.durationMs,0));expect(resolveClipFrame(model,action,direction,20).fallback).toBe(false);clips++;
   for(const f of c.frames){const [x,y,w,h]=f.rect;expect(x+w).toBeLessThanOrEqual(a.width);expect(y+h).toBeLessThanOrEqual(a.height);expect(f.durationMs).toBeGreaterThan(0);const g=normalizedSpriteGeometry(f,model.standHeight!);expect(g.target[0]+g.target[2]).toBeLessThanOrEqual(g.width);expect(g.target[1]+g.target[3]).toBeLessThanOrEqual(g.height);frames++;}
  }
 }
 expect(clips).toBe(128);expect(frames).toBe(752);
});
it('五套实际特效图集与CC0来源、原包哈希、帧清单匹配',()=>{
 const m=JSON.parse(readFileSync('public/assets/effects/spells/manifest.json','utf8'));expect(Object.keys(m.effects).sort()).toEqual(['arcane','fire','ice','lightning','wind']);let frames=0;
 for(const a of Object.values(m.effects) as any[]){expect(m.sources[a.source].license).toBe('CC0-1.0');expect(m.sources[a.source].sha256).toMatch(/^[a-f0-9]{64}$/);expect(createHash('sha256').update(readFileSync(`public/${a.url}`)).digest('hex')).toBe(a.sha256);for(const f of a.frames){expect(f.rect[0]+f.rect[2]).toBeLessThanOrEqual(a.width);expect(f.rect[1]+f.rect[3]).toBeLessThanOrEqual(a.height);frames++;}}
 expect(frames).toBeGreaterThanOrEqual(29);
});
