import type { MapGenerationRequest } from '../world/index';
import type { World } from './model';
import { seedHash } from '../../contracts/demo';
// Story-owned meaning and explicit geometry; map generation does not invent content.
export function createStoryMapRequest(world: World): MapGenerationRequest {
  return {
    schemaVersion:1, seed:`map-${seedHash(world.seed).toString(16)}`,
    bounds:{width:32,height:20},layout:{strategyId:'connected_regions',params:{regionGap:1,maxAttempts:16}},
    regions:[
      {id:'home',sizeRange:{width:[10,10],height:[12,12]},position:{x:1,y:1},environmentRef:world.location},
      {id:'supply-area',sizeRange:{width:[6,7],height:[7,8]},position:{x:14,y:2},environmentRef:`${world.location}:补给地`},
      {id:'goal-area',sizeRange:{width:[8,8],height:[8,8]},position:{x:23,y:11},environmentRef:`目标:${world.goal}`},
    ],
    connections:[{id:'home-supply',from:'home',to:'supply-area',width:1,passable:true},{id:'supply-goal',from:'supply-area',to:'goal-area',width:1,passable:world.accessible}],
    anchors:[{id:'spawn',regionId:'home',position:{x:3,y:3}},{id:'notes',regionId:'home',position:{x:4,y:3}},{id:'market',regionId:'home',position:{x:8,y:4}},{id:'supply',regionId:'supply-area',position:{x:16,y:5}},{id:'goal',regionId:'goal-area',position:{x:28,y:16}}],
    placements:world.npcs.map((npc,i)=>({id:`placement-${npc.id}`,entityRef:npc.id,regionId:'home',footprint:{width:1,height:1},position:{x:5+i*2,y:6+i},blocksMovement:false,blocksSight:false})),
    constraints:{requiredPaths:[{fromAnchorId:'spawn',toAnchorId:'supply'},{fromAnchorId:'spawn',toAnchorId:'goal'}],minObjectSpacing:0,allowObjectOverlap:false},
  };
}
