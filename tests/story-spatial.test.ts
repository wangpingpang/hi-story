import { describe, expect, it } from 'vitest';
import catalog from '../content/story/spatial-layouts.json';
import { initializeStory, createStorySpatialPlan, createStoryMapRequest, parseStorySpatialCatalog } from '../src/modules/story-planning';
import { generateMap, type MapGenerationRequest } from '../src/modules/world';
import { generateCharacterWithParams } from '../src/modules/characters';
import { createRuntime, validateRuntimeAccess } from '../src/modules/runtime';
import { createGameApplication, type DemoCommand } from '../src/application';

describe('声明式随机空间与实例边界', () => {
  it('240个种子覆盖四种布局，改变地点与NPC落点，保留固定起终点与实际通路', () => {
    const layouts=new Set<string>(),markets=new Set<string>(),npcPositions=new Set<string>();
    for(let i=0;i<240;i++){
      const world=initializeStory(`spatial-${i}`),before=structuredClone(world),plan=createStorySpatialPlan(world);
      const result=generateMap(plan.request);expect(result,JSON.stringify(result)).toMatchObject({ok:true});
      if(!result.ok)throw Error(result.error.message);
      const player=generateCharacterWithParams({seed:`spatial-player-${i}`,control:'player'});
      const runtime=createRuntime(result.map,player,world.npcs);
      expect(()=>validateRuntimeAccess(runtime,result.map.anchors.map(a=>a.id))).not.toThrow();
      expect(result.map.anchors.find(a=>a.id==='spawn')!.position).toEqual({x:3,y:3});
      expect(result.map.anchors.find(a=>a.id==='goal')!.position).toEqual({x:28,y:16});
      expect(result.map.placements.every(p=>!result.map.anchors.some(a=>a.position.x===p.position.x&&a.position.y===p.position.y))).toBe(true);
      layouts.add(plan.layoutId);markets.add(JSON.stringify(result.map.anchors.find(a=>a.id==='market')!.position));
      npcPositions.add(JSON.stringify(result.map.placements.map(p=>p.position)));
      expect(world).toEqual(before);
      if(i%24===0)expect(generateMap(createStoryMapRequest(world))).toEqual(result);
    }
    expect(layouts.size).toBe(4);expect(markets.size).toBeGreaterThan(65);expect(npcPositions.size).toBeGreaterThan(200);
  });
  it('目录可注入并独立复制；非法版本、编号、区域引用和坐标范围被拒绝', () => {
    const input=structuredClone(catalog),world=initializeStory('catalog');
    input.layouts=[input.layouts[2]];
    const plan=createStorySpatialPlan(world,input);expect(plan.layoutId).toBe('east-pass');
    plan.request.regions[0].sizeRange.width[0]=100;expect(input.layouts[0].regions[0].sizeRange.width[0]).toBe(9);
    for(const edit of [
      (v:typeof catalog)=>{v.schemaVersion=9;},
      (v:typeof catalog)=>{v.layouts.push(v.layouts[0]);},
      (v:typeof catalog)=>{v.layouts[0].npcRegionIds=['missing'];},
      (v:typeof catalog)=>{v.layouts[0].regions[0].positionRange.x=[4,2];},
    ]){const bad=structuredClone(catalog);edit(bad);expect(()=>parseStorySpatialCatalog(bad)).toThrow();}
  });
  it('空间随机流不读取或消耗故事rng；封闭通路不会被空间生成擅自打开', () => {
    const world=initializeStory('closed-road'),first=createStorySpatialPlan(world);
    const changed=structuredClone(world);changed.rng=123;expect(createStorySpatialPlan(changed)).toEqual(first);
    changed.accessible=false;const closed=createStorySpatialPlan(changed);
    expect(closed.request.connections!.find(c=>c.id==='supply-goal')!.passable).toBe(false);
    expect(generateMap(closed.request)).toMatchObject({ok:false,error:{code:'UNSATISFIABLE'}});
  });
  it('NPC语义地点与实际区域一致；选择后地图和人物身份稳定，同种子重开可复现', async () => {
    const app=createGameApplication();expect(await app.initialize({seed:'stable-space'})).toMatchObject({ok:true});
    const initial=structuredClone(app.query().snapshot!);
    expect(initial.schemaVersion).toBe(2);expect(initial.versions).toMatchObject({contracts:'demo-contract/2',map:'bounded-map/2',story:'story-adapter/2'});
    for(const npc of initial.story.npcs){
      const actor=Object.values(initial.runtime.actors).find(a=>a.storyNpcId===npc.id)!;
      const region=initial.runtime.map.cells[actor.position.y][actor.position.x].regionId;
      expect(npc.location).toBe(initial.runtime.map.regions.find(r=>r.id===region)!.environmentRef);
    }
    const event=app.query().events.find(e=>e.optionId==='notes')!;
    const c:DemoCommand={commandId:'stable-read',runId:initial.runId,actorId:initial.playerActorId,expectedRevision:initial.revision,type:'event.choose',payload:{optionId:event.optionId,eventInstanceId:event.eventInstanceId}};
    expect(await app.dispatch(c)).toMatchObject({ok:true});
    expect(app.query().snapshot!.runtime.map).toEqual(initial.runtime.map);
    expect(app.query().snapshot!.runtime.actors).toEqual(initial.runtime.actors);
    expect(app.query().snapshot!.spatial).toEqual(initial.spatial);
    expect(await app.restart()).toMatchObject({ok:true});expect(app.query().snapshot!.runtime).toEqual(initial.runtime);
    expect(app.query().snapshot!.runId).not.toBe(initial.runId);
  });
  it('非静态阻挡对象也不能截断受保护路径，旧请求保持原来的静态碰撞语义', () => {
    const request:MapGenerationRequest={seed:'reserved',bounds:{width:3,height:5},layout:{strategyId:'connected_regions'},
      regions:[{id:'hall',position:{x:1,y:0},sizeRange:{width:[1,1],height:[5,5]}}],
      anchors:[{id:'spawn',regionId:'hall',position:{x:1,y:0}},{id:'goal',regionId:'hall',position:{x:1,y:4}}],
      placements:[{id:'npc',entityRef:'npc-0',regionId:'hall',position:{x:1,y:2},footprint:{width:1,height:1},blocksMovement:false,blocksSight:false}],
      constraints:{requiredPaths:[{fromAnchorId:'spawn',toAnchorId:'goal'}],requiredPathsAvoidPlacements:true}};
    expect(generateMap(request)).toMatchObject({ok:false,error:{code:'UNSATISFIABLE'}});
    request.constraints!.requiredPathsAvoidPlacements=false;
    const generated=generateMap(request);expect(generated.ok).toBe(true);if(!generated.ok)throw Error('expected map');
    expect(generated.map.cells[2][1].walkable).toBe(true);
    const world=initializeStory('reserved'),player=generateCharacterWithParams({seed:'reserved-player',control:'player'});
    const runtime=createRuntime(generated.map,player,[world.npcs[0]]);
    expect(()=>validateRuntimeAccess(runtime,['goal'])).toThrow('不可达');
    (request.constraints as unknown as Record<string,unknown>).requiredPathsAvoidPlacements='true';
    expect(generateMap(request)).toMatchObject({ok:false,error:{code:'INVALID_REQUEST'}});
  });
  it('装配后的落点冲突使重开失败，旧局地图、人物、事实与回执全部保留',async()=>{
    let corrupt=false;
    const app=createGameApplication({createMap:request=>{
      const result=generateMap(request);
      if(corrupt&&result.ok)result.map.placements[0].position={...result.map.anchors.find(a=>a.id==='spawn')!.position};
      return result;
    }});
    expect(await app.initialize({seed:'assembly-rollback'})).toMatchObject({ok:true});
    const before=app.query();corrupt=true;
    expect(await app.restart({seed:'invalid-assembly'})).toMatchObject({ok:false,error:{code:'INVALID_BINDING'}});
    expect(app.query()).toEqual(before);
  });
});
