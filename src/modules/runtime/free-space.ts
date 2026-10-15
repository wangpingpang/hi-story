import type { RuntimeState } from './index';
import type { Point } from '../world/index';
import { requireValue } from '../../contracts/demo';

export const FREE_MOVEMENT_VERSION = 'free-movement/1';
export const WALK_SPEED = 3.2;
export const ACTOR_RADIUS = .21;
export const gridPoint = (p: Point): Point => ({x: Math.round(p.x), y: Math.round(p.y)});
export const gridKey = (p: Point): string => `${Math.round(p.x)},${Math.round(p.y)}`;
export const euclidean = (a: Point, b: Point): number => Math.hypot(a.x-b.x, a.y-b.y);

/** A navigation cell occupies its center +/- .5. Collision is authoritative. */
export function canStand(state: RuntimeState, p: Point, actorId=state.playerActorId,includeActors=true): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  const r=ACTOR_RADIUS;
  for (let y=Math.floor(p.y-r+.5); y<=Math.floor(p.y+r+.5); y++) {
    for (let x=Math.floor(p.x-r+.5); x<=Math.floor(p.x+r+.5); x++) {
      if (state.map.cells[y]?.[x]?.walkable) continue;
      const dx=Math.max(x-.5-p.x, 0, p.x-x-.5), dy=Math.max(y-.5-p.y, 0, p.y-y-.5);
      if (dx*dx+dy*dy < r*r-1e-9) return false;
    }
  }
  return !includeActors || !Object.values(state.actors).some(a=>a.actorId!==actorId && a.hp>0 && euclidean(a.position,p)<r*2-1e-8);
}

/** Substeps prevent tunnelling. Sliding never skips a blocked interval. */
export function sweepWalk(state: RuntimeState, delta: Point): Point {
  let p={...state.actors[state.playerActorId].position};
  const steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.y)/.07)), dx=delta.x/steps,dy=delta.y/steps;
  for(let i=0;i<steps;i++) {
    const q={x:p.x+dx,y:p.y+dy};
    if(canStand(state,q)){p=q;continue;}
    const qx={x:p.x+dx,y:p.y},qy={x:p.x,y:p.y+dy};
    if(canStand(state,qx))p=qx;
    else if(canStand(state,qy))p=qy;
  }
  return {x:Math.round(p.x*1e8)/1e8,y:Math.round(p.y*1e8)/1e8};
}

export function walkDelta(dx:number,dy:number,seconds:number):Point {
  requireValue([dx,dy,seconds].every(Number.isFinite)&&Math.abs(dx)<=1&&Math.abs(dy)<=1&&seconds>0&&seconds<=.12,
    'INVALID_MOVEMENT','移动方向须在 -1 到 1，时间须在 0 到 0.12 秒。');
  const length=Math.max(1,Math.hypot(dx,dy));
  return {x:dx/length*WALK_SPEED*seconds,y:dy/length*WALK_SPEED*seconds};
}

export function findAdventureRoute(state:RuntimeState,to:Point):Point[] {
  requireValue(Number.isInteger(to.x)&&Number.isInteger(to.y),'INVALID_TARGET','目的地必须是导航点。');
  const actual=state.actors[state.playerActorId].position,center=gridPoint(actual),key=(p:Point)=>`${p.x},${p.y}`;
  const start=[center,{x:center.x-1,y:center.y},{x:center.x+1,y:center.y},{x:center.x,y:center.y-1},{x:center.x,y:center.y+1}]
    .filter(p=>canStand(state,p)&&euclidean(sweepWalk(state,{x:p.x-actual.x,y:p.y-actual.y}),p)<1e-6)
    .sort((a,b)=>euclidean(a,actual)-euclidean(b,actual))[0];
  if(!start)return [];
  const queue=[start],previous=new Map<string,Point|null>([[key(start),null]]);
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];
    if(key(p)===key(to)) {
      const route:Point[]=[];let q:Point|null=p;
      while(q){route.push(q);q=previous.get(key(q))??null;}
      route.reverse();
      // Include the starting center only when actually needed; no snapping.
      if(euclidean(route[0],state.actors[state.playerActorId].position)<1e-7)route.shift();
      return route;
    }
    for(const q of [{x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1}]) {
      if(previous.has(key(q))||!state.map.cells[q.y]?.[q.x]?.walkable||!canStand(state,q))continue;
      previous.set(key(q),p);queue.push(q);
    }
  }
  return [];
}
