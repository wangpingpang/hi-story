import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {environmentFor} from '../src/presentation/environment';
import {sceneryRects,scenerySprite,sceneryDefs} from '../src/presentation/scenery';
import {createAdventureApplication} from '../src/application';
import {equipmentGallery} from '../src/presentation/equipment-art';
it('天气可复现，覆盖昼夜与四种预览，不改动领域状态',async()=>{
 const app=createAdventureApplication();await app.initialize({seed:'weather-qa'});const before=app.exportSave();
 expect(environmentFor('weather-qa',0)).toEqual(environmentFor('weather-qa',0));
 for(const weather of ['sun','mist','rain','snow'] as const)expect(environmentFor('qa',8,weather)).toMatchObject({weather,light:'night'});
 expect(environmentFor('qa',16,'sun').light).toBe('day');expect(app.exportSave()).toBe(before);app.dispose();
});
it('八种场景切片在实际图集内且只读装配',()=>{
 expect(Object.keys(sceneryRects)).toHaveLength(8);
 for(const [kind,[x,y,w,h]] of Object.entries(sceneryRects)){expect(x+w).toBeLessThanOrEqual(1774);expect(y+h).toBeLessThanOrEqual(887);expect(w*h).toBeGreaterThan(0);expect(scenerySprite(kind as keyof typeof sceneryRects,20,30,100)).toContain('pointer-events="none"');}
 expect(sceneryDefs()).toContain('ground-water');
 expect(scenerySprite('tower',0,0,100,120,true)).not.toContain('pointer-events="none"');
 expect(scenerySprite('fir',0,0,100)).toContain('preserveAspectRatio="none"');
});
it('12职业可从应用公共接口开局，已实现能力可查询，兼容模式可恢复',async()=>{
 const app=createAdventureApplication();await app.initialize({seed:'class-ui'});const original=app.exportSave();
 expect(app.queryProfessions().classes).toHaveLength(12);
 for(const c of app.queryProfessions().classes){expect((await app.restart({professions:app.professionSetup(c.id)})).ok).toBe(true);const s=app.query().snapshot!;expect(Object.values(s.runtime.actors).every(a=>Boolean(a.profession))).toBe(true);expect(s.runtime.actors[s.playerActorId].profession!.build.classes[0].classId).toBe(c.id);expect(app.queryProfessionSkills().every(s=>Boolean(s.execution))).toBe(true);}
 expect((await app.restart({professions:null})).ok).toBe(true);expect(app.query().snapshot!.runtime.professionVersion).toBeUndefined();expect((await app.restore(original)).ok).toBe(true);app.dispose();
});
it('只使用公开装备目录，不打包内部动作制作规格',()=>{
 const manifest=JSON.parse(readFileSync('content/equipment/catalog.json','utf8'));expect(manifest.items).toHaveLength(102);expect(manifest.version).toBe('profession-equipment/1');
 const renderer=readFileSync('src/presentation/equipment-art.ts','utf8');expect(renderer).toContain('不授予物品');
 expect(equipmentGallery('wizard')).toContain('clip-path="url(#equipment-');
});
