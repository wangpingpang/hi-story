import type {AdventureSnapshot} from '../application';
import type {DeepReadonly} from '../contracts';
import type {WorldAsset} from './world-assets';
export type SceneSnapshot=DeepReadonly<AdventureSnapshot>;
export interface ScenicProp {asset:WorldAsset;x:number;y:number;width:number;height:number;solid:boolean}
const noise=(x:number,y:number)=>{let n=Math.imul(x+71,374761393)^Math.imul(y+137,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
/** Deterministic dressing: large props only occupy blocked cells. */
export function composeWorld(s:SceneSnapshot):ScenicProp[]{
 const result:ScenicProp[]=[],map=s.runtime.map;
 for(let y=0;y<map.bounds.height;y++)for(let x=0;x<map.bounds.width;x++){
  const cell=map.cells[y][x],n=noise(x,y);
  if(!cell.walkable&&!cell.terrainId&&!cell.regionId){
   const edge=[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>map.cells[y+dy]?.[x+dx]?.walkable);
   if(n%100<(edge?55:38))result.push({asset:n%5===0?'oak':'fir',x:x+(n%13-6)/25,y:y+(n%17-8)/30,width:edge?135:175,height:edge?175:230,solid:true});
   else if(n%7===0)result.push({asset:'bush',x,y,width:65,height:48,solid:true});
  }else if(cell.walkable&&cell.regionId&&!cell.connectionIds.length&&n%13===0){
   result.push({asset:n%3===0?'wildflowers':'fern',x:x+.24,y:y+.18,width:24+n%12,height:18+n%8,solid:false});
  }
 }
 return result;
}
export function groundMaterial(s:SceneSnapshot,x:number,y:number):WorldAsset{
 const cell=s.runtime.map.cells[y][x],v=s.runtime.visual[`${x},${y}`];
 if(!cell.regionId&&!cell.connectionIds.length)return 'forest-floor';
 if(cell.connectionIds.length)return 'wet-earth';
 if(cell.regionId==='shrine'||cell.regionId==='tower')return 'moss-stone';
 if(cell.regionId==='watch-region')return 'leaves';
 return v.material==='stone'?'moss-stone':'meadow';
}
export function landmarkStyle(id:string){
 if(id==='spawn')return {dx:-39,dy:-2,width:47,height:43};
 if(id==='notes')return {dx:25,dy:-4,width:35,height:45};
 if(id==='goal')return {dx:0,dy:0,width:155,height:190};
 return {dx:0,dy:0,width:78,height:86};
}
export function occludesPlayer(prop:{x:number;y:number;width:number;height:number},player:{x:number;y:number}):boolean{
 return player.x>prop.x-prop.width*.43&&player.x<prop.x+prop.width*.43&&player.y>prop.y-prop.height-10&&player.y<prop.y-12;
}
