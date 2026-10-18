import content from '../../../content/adventure/catalog.json';
import { generateCharacterWithParams, type GeneratedCharacter } from '../characters/index';
import type { MapGenerationRequest, GeneratedMap } from '../world/index';
import type { AdventureCondition, AdventureEffect } from '../../contracts/adventure';
import { seedHash, requireValue } from '../../contracts/demo';
import type { Skill, Archetype, VisualCell } from '../runtime/index';
export const ADVENTURE_CONTENT_VERSION='adventure-content/2';
export interface AdventureNPC {id:string;name:string;role:string;profile:GeneratedCharacter;alive:boolean;trust:number;attitude:'friendly'|'neutral'|'hostile';location:string;trait:string;monsterId?:string}
export interface AdventureStory {seed:string;plotId:string;goal:string;background:string;time:number;deadline:number;npcs:AdventureNPC[];ending:string;outcome?:'success'|'failed';log:{id:string;text:string}[];personality:Record<string,number>;planned:string[]}
export interface AdventureChoice {id:string;text:string;time:number;gold:number;items:Record<string,number>;check?:{skill:Skill;dc:number};success:AdventureEffect[];failure:AdventureEffect[]}
export interface AdventureEventTemplate {id:string;title:string;anchorId:string;when:AdventureCondition;choices:AdventureChoice[]}
export interface Followup {id:string;when:AdventureCondition;effects:AdventureEffect[]}
export interface AdventureCatalog {version:string;mainlines:{id:string;title:string;intro:string;requiredItem:string;sourceAnchor:string}[];events:AdventureEventTemplate[];social:{id:string;label:string;skill:Skill;dc:number;success:AdventureEffect[];failure:AdventureEffect[]}[];followups:Followup[];encounters:{id:string;label:string;archetype:Archetype}[]}
export const adventureCatalog=content as unknown as AdventureCatalog;
export function createAdventureStory(seed:string,background:string):AdventureStory {
 const plot=adventureCatalog.mainlines[seedHash(seed+':plot')%adventureCatalog.mainlines.length];
 const story:AdventureStory={seed,plotId:plot.id,goal:plot.title,background,time:0,deadline:40,npcs:[],ending:'',log:[{id:'opening',text:plot.intro+' 旅人可以寻找情报、探索支路，或尝试不同的交涉方式。'}],personality:{},planned:[]};
 const roles=['商道向导','营地医者','暮光守卫'];for(let i=0;i<3;i++)story.npcs.push(makeAdventureNPC(seed,`npc-${i}`,roles[i],['热心但谨慎','重视互助','警惕陌生人'][i]));return story;
}
export function makeAdventureNPC(seed:string,id:string,role=id==='echo'?'遗迹学者':'守塔侍从',trait='谨慎、重视承诺'):AdventureNPC {
 const profile=generateCharacterWithParams({seed:`adv-${seedHash(seed).toString(16)}:${id}`,occupation:role,background:`${role}在这片山谷中寻找自己的目标。`,personality:{traits:[trait]},preferences:{likes:['诚恳交谈','履行承诺'],dislikes:['欺骗','无端威胁']},motivation:id==='echo'?'弄清遗迹回声的来源':'守住自己的约定'});
 return {id,name:profile.name,role,profile,alive:true,trust:0,attitude:'neutral',location:id==='npc-0'?'home':id==='npc-1'?'camp':id==='npc-2'?'tower':'watch',trait};
}
export function changeAdventureTrust(story:AdventureStory,id:string,amount:number):AdventureStory {
 const next=structuredClone(story),npc=next.npcs.find(n=>n.id===id);requireValue(npc&&Number.isInteger(amount)&&Math.abs(amount)<=10,'INVALID_EFFECT','关系效果无效。');npc.trust=Math.max(-5,Math.min(5,npc.trust+amount));npc.attitude=npc.trust>=2?'friendly':npc.trust<=-2?'hostile':'neutral';return next;
}
export function adventureSpatialRequest(story:AdventureStory):MapGenerationRequest {
 const n=(key:string)=>seedHash(story.seed+':space:'+key);
 const regions=[{id:'home',x:2,y:2,label:'旅人村落'},{id:'camp',x:23,y:2,label:'商道营地'},{id:'shrine',x:46,y:2,label:'银月祭坛'},{id:'supply-region',x:2,y:29,label:'林间补给地'},{id:'watch-region',x:23,y:29,label:'支路遗迹'},{id:'tower',x:46,y:29,label:'暮光塔'}];
 const connections=[['north','home','camp'],['ridge','camp','shrine'],['east','shrine','tower'],['west','home','supply-region'],['southwest','supply-region','watch-region'],['south','watch-region','tower'],['shortcut','camp','watch-region']].map(([id,from,to])=>({id,from,to,width:3,passable:true}));
 const anchors=[{id:'spawn',regionId:'home',position:{x:6,y:8}},{id:'notes',regionId:'home',position:{x:7,y:8}},{id:'market',regionId:'camp',position:{x:27,y:8}},{id:'supply',regionId:'supply-region',position:{x:6,y:36}},{id:'shrine',regionId:'shrine',position:{x:52,y:8}},{id:'cache',regionId:'watch-region',position:{x:30,y:37}},{id:'watch',regionId:'watch-region',position:{x:27,y:35}},{id:'gate',regionId:'camp',position:{x:28,y:15}},{id:'reserve',regionId:'watch-region',position:{x:33,y:42}},{id:'goal',regionId:'tower',position:{x:56,y:40}}];
 const props=[['home','cottage',4,4,2,2],['home','apothecary',9,4,2,2],['home','well',11,10,1,1],['home','lamp',4,9,1,1],['home','oak',13,13,1,1],['camp','inn',25,4,2,2],['camp','smithy',31,4,2,2],['camp','market-stall',32,10,2,1],['camp','wagon',25,13,2,1],['camp','lamp',30,8,1,1],['shrine','column',49,5,1,1],['shrine','runestone',57,10,1,1],['shrine','dead-tree',48,15,1,1],['supply-region','fir',4,32,1,1],['supply-region','willow',12,33,1,1],['supply-region','moss-rock',11,40,1,1],['supply-region','reeds',4,42,1,1],['watch-region','arch',25,31,2,1],['watch-region','column',33,33,1,1],['watch-region','runestone',32,40,1,1],['tower','arch',48,32,2,1],['tower','fir',58,34,1,1],['tower','moss-rock',51,42,1,1]] as const;
 return {seed:`adv-map:${n('seed')}`,bounds:{width:64,height:50},layout:{strategyId:'connected_regions',params:{maxAttempts:32,regionGap:1}},regions:regions.map(r=>({id:r.id,position:{x:r.x,y:r.y},sizeRange:{width:[15,16],height:[18,18]},environmentRef:r.label})),connections,anchors,
 terrain:props.map(([regionId,terrainRef,x,y,width,height],i)=>({id:`scene-${i}`,regionId,terrainRef,shapeSpec:{shape:'rectangle' as const,size:{width,height}},position:{x,y},walkable:false,blocksSight:true})),
 placements:story.npcs.map((npc,i)=>({id:`placement-${npc.id}`,entityRef:npc.id,regionId:['home','camp','tower'][i],footprint:{width:1,height:1},placementRule:{nearAnchorId:['spawn','market','goal'][i],minDistance:2,maxDistance:4},blocksMovement:false,blocksSight:false})),constraints:{requiredPaths:anchors.filter(a=>a.id!=='spawn').map(a=>({fromAnchorId:'spawn',toAnchorId:a.id})),requiredPathsAvoidPlacements:true,minObjectSpacing:1,allowObjectOverlap:false}};
}
/** Story specifies scene themes and heights; rendering cannot change collision. */
export function adventureVisualPlan(map:GeneratedMap,seed:string):Record<string,VisualCell> {
 const levels:Record<string,number>={home:0,camp:1,shrine:3,'supply-region':0,'watch-region':1,tower:2},visual:Record<string,VisualCell>={};
 for(let y=0;y<map.bounds.height;y++)for(let x=0;x<map.bounds.width;x++){
  const cell=map.cells[y][x],n=seedHash(seed+':visual:'+x+','+y),region=cell.regionId;let height=region?levels[region]??0:0;
  if(!region&&cell.connectionIds.length){const c=map.connections.find(c=>c.id===cell.connectionIds[0])!;const index=c.cells.findIndex(p=>p.x===x&&p.y===y);height=(levels[c.from]??0)+((levels[c.to]??0)-(levels[c.from]??0))*Math.max(0,index)/(Math.max(1,c.cells.length-1));}
  visual[`${x},${y}`]={height,material:cell.walkable?(region==='shrine'||region==='tower'?'stone':cell.connectionIds.length?'earth':'grass'):'water',...(cell.terrainId?{prop:region==='shrine'||region==='watch-region'?'wall' as const:'tree' as const}:!cell.walkable&&n%5===0?{prop:'rock' as const}:{})};
 }return visual;
}
export function templateFor(id:string):AdventureEventTemplate {const event=adventureCatalog.events.find(e=>e.id===id);requireValue(event,'INVALID_CONTENT','事件模板不存在。');return structuredClone(event);}
export function socialTemplate(npc:AdventureNPC,id:string):AdventureEventTemplate {
 const social=adventureCatalog.social.find(s=>s.id===id);requireValue(social,'INVALID_CONTENT','人物行动不存在。');
 const replace=(effects:AdventureEffect[])=>JSON.parse(JSON.stringify(effects).replaceAll('{npc}',npc.id)) as AdventureEffect[];
 return {id:`social-${id}`,title:`${npc.name} · ${npc.role}`,anchorId:'',when:{kind:'alive',npcId:npc.id},choices:[{id,text:social.label,time:.25,gold:0,items:id==='medicine'?{herb:1}:{},check:{skill:social.skill,dc:social.dc},success:replace(social.success),failure:replace(social.failure)}]};
}
