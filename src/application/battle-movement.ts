import type {DeepReadonly} from '../contracts';
import type {AdventureSnapshot} from './adventure-application';
import {COMBAT_MOVEMENT_VERSION,type CombatMovementFeedback} from '../modules/runtime';

type Point={x:number;y:number};
type Direction='N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW';
const facing=(a:Point,b:Point):Direction=>{const x=b.x-a.x,y=b.y-a.y;return (['E','SE','S','SW','W','NW','N','NE'] as const)[(Math.round(Math.atan2((x+y)*.5,x-y)/(Math.PI/4))+8)%8];};
/** Interpolates only committed route evidence. No dispatch, rules, RNG or save writes. */
export class BattleMovementPlayback {
 private started=0;private duration=0;private step=150;
 private tracks:{actorId:string;path:readonly Point[];offset:number;duration:number}[]=[];
 private initial=new Map<string,Point>();
 begin(before:DeepReadonly<AdventureSnapshot>,after:DeepReadonly<AdventureSnapshot>,feedback:DeepReadonly<CombatMovementFeedback>|undefined,now:number,reduced=false):boolean {
  this.clear();const old=before.runtime.encounter,battle=after.runtime.encounter;
  if(!feedback?.moves.length||feedback.version!==COMBAT_MOVEMENT_VERSION||before.runId!==after.runId||old?.id!==battle?.id||feedback.encounterId!==battle?.id||battle?.status!=='active')return false;
  this.step=reduced?85:150;this.started=now;
  for(const p of old!.participants)this.initial.set(p.actorId,{...p.position});
  for(const move of feedback.moves){
   const previous=this.tracks.filter(t=>t.actorId===move.actorId).at(-1)?.path.at(-1)??this.initial.get(move.actorId);
   if(!previous||move.path.length<2||move.path.some((p,i)=>!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=9||p.y<0||p.y>=7||(i>0&&Math.abs(p.x-move.path[i-1].x)+Math.abs(p.y-move.path[i-1].y)!==1))||move.path[0].x!==previous.x||move.path[0].y!==previous.y){this.clear();return false;}
   const duration=(move.path.length-1)*this.step;this.tracks.push({actorId:move.actorId,path:move.path.map(p=>({...p})),offset:this.duration,duration});this.duration+=duration;
  }
  for(const track of this.tracks){const last=this.tracks.filter(t=>t.actorId===track.actorId).at(-1)!.path.at(-1)!,target=battle.participants.find(p=>p.actorId===track.actorId)?.position;if(!target||target.x!==last.x||target.y!==last.y){this.clear();return false;}}
  return this.duration>0;
 }
 playing(now:number){return this.duration>0&&now-this.started<this.duration;}
 sample(actorId:string,now:number):{position:Point;running:boolean;direction?:Direction;elapsedMs:number}|undefined {
  const initial=this.initial.get(actorId);if(!initial)return;
  let position={...initial};const elapsed=Math.max(0,now-this.started);
  for(const track of this.tracks.filter(t=>t.actorId===actorId)){
   if(elapsed<track.offset)break;
   const local=elapsed-track.offset;if(local>=track.duration){position={...track.path.at(-1)!};continue;}
   const segment=Math.min(track.path.length-2,Math.floor(local/this.step)),a=track.path[segment],b=track.path[segment+1],t=(local-segment*this.step)/this.step;
   return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},running:true,direction:facing(a,b),elapsedMs:local};
  }
  return {position,running:false,elapsedMs:0};
 }
 clear(){this.tracks=[];this.initial.clear();this.duration=0;}
}
