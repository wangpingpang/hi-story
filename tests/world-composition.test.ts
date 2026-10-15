import {it,expect,beforeAll} from 'vitest';
import {createAdventureApplication,type AdventureSnapshot} from '../src/application';
import {composeWorld,groundMaterial,landmarkStyle,occludesPlayer} from '../src/presentation/world-composition';
let snapshot:AdventureSnapshot;
beforeAll(async()=>{const app=createAdventureApplication();expect(await app.initialize({seed:'v040-visual'})).toMatchObject({ok:true});snapshot=structuredClone(app.query().snapshot!) as AdventureSnapshot;app.dispose();});
it('景物复现且不修改本局事实，大型装饰仅在不可通行地块',()=>{
 const before=structuredClone(snapshot),props=composeWorld(snapshot);expect(props.length).toBeGreaterThan(300);expect(composeWorld(snapshot)).toEqual(props);
 for(const p of props.filter(p=>p.solid))expect(snapshot.runtime.map.cells[Math.round(p.y)][Math.round(p.x)].walkable).toBe(false);
 expect(snapshot).toEqual(before);
});
it('建筑占地仍绘制所在地区地表，不把碰撞块误画为水洞',()=>{
 const home=snapshot.runtime.map.terrain.find(t=>t.terrainRef==='cottage')!;expect(groundMaterial(snapshot,home.position.x,home.position.y)).toBe('meadow');expect(groundMaterial(snapshot,0,0)).toBe('forest-floor');
});
it('出生点道具与旅人身体错开，路牌命中尺寸跟随画面',()=>{const fire=landmarkStyle('spawn'),sign=landmarkStyle('notes');expect(fire.dx+fire.width/2).toBeLessThan(-14);expect(sign.height).toBeLessThan(60);});
it('前景遮挡只在人物身躯重叠时淡出',()=>{const p={x:100,y:200,width:100,height:160};expect(occludesPlayer(p,{x:100,y:150})).toBe(true);expect(occludesPlayer(p,{x:100,y:205})).toBe(false);expect(occludesPlayer(p,{x:180,y:150})).toBe(false);});
