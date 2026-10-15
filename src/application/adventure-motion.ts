import type {AdventureSnapshot} from './adventure-application';
import type {DeepReadonly} from '../contracts';
import {createAnimation,advanceAnimation,requestAnimation,animationProgress,resolveExpression,type AnimationState,type ExpressionSignals,type Action,type Direction,type Weapon,type Spell} from '../modules/characters';
type Snapshot=DeepReadonly<AdventureSnapshot>;
const facing=(from:{x:number;y:number},to:{x:number;y:number}):Direction=>{const x=to.x-from.x,y=to.y-from.y,angle=Math.atan2((x+y)*.5,x-y),directions:Direction[]=['E','SE','S','SW','W','NW','N','NE'];return directions[(Math.round(angle/(Math.PI/4))+8)%8];};
/** Visual clock and reactions only. Never writes world positions, HP or RNG. */
export class AdventureMotion {
 private previous?:Snapshot;
 private actors=new Map<string,{animation:AnimationState;signals:ExpressionSignals;movingUntil:number}>();
 private now=0;
 private dialogueId='';
 dialogue(npcId:string){this.dialogueId=npcId;}
 observe(s:Snapshot,now:number){
  this.now=Math.max(this.now,now);if(this.previous?.runId!==s.runId){this.actors.clear();this.previous=undefined;}
  for(const a of Object.values(s.runtime.actors)){
   let entry=this.actors.get(a.actorId);if(!entry){entry={animation:createAnimation(this.now),signals:{},movingUntil:0};this.actors.set(a.actorId,entry);}
   const old=this.previous?.runtime.actors[a.actorId],vitals={hp:a.hp,maxHp:a.maxHp,dead:false,inCombat:s.runtime.encounter?.status==='active'};
   entry.animation=advanceAnimation(entry.animation,this.now,vitals);
   const act=(action:Action,direction?:Direction,weapon?:Weapon,spell?:Spell)=>{entry!.animation=requestAnimation(entry!.animation,{id:`${s.revision}:${action}:${a.actorId}`,action,direction,weapon,spell},this.now,vitals).state;};
   const battle=s.runtime.encounter,prior=this.previous?.runtime.encounter;
   const active=battle?.status==='active',wasActive=prior?.status==='active';
   const p=(active?battle.participants.find(p=>p.actorId===a.actorId)?.position:undefined)??a.position;
   const q=active===wasActive?(wasActive?prior.participants.find(p=>p.actorId===a.actorId)?.position:old?.position):undefined;
   if(q&&Math.hypot(p.x-q.x,p.y-q.y)>.00001){
    act('walk',facing(q,p));entry.movingUntil=this.now+180;
   }
   if(this.previous){
    const roll=battle?.rolls?.filter(r=>r.sequence>(prior?.id===battle.id?(prior.rollSequence??0):0)).filter(r=>r.actorId===a.actorId&&(r.kind==='attack'||r.kind==='healing')||r.kind==='save'&&r.targetId===a.actorId).at(-1);
    if(roll){const targetId=roll.kind==='save'?roll.actorId:roll.targetId,target=active?battle?.participants.find(p=>p.actorId===targetId)?.position:targetId?s.runtime.actors[targetId]?.position:undefined,cast=roll.visual==='spell'||roll.kind==='save'||roll.kind==='healing';act(cast?'cast':roll.critical?'heavy-attack':'attack',target?facing(p,target):undefined,cast?'staff':roll.visual==='unarmed'?'unarmed':a.range>1?'bow':'sword',roll.kind==='healing'?'healing':'arcane');}
    if(!active&&a.profession&&old?.profession&&Object.entries(a.profession.resources).some(([k,n])=>n<(old.profession!.resources[k]??0))&&Object.values(s.runtime.actors).some(t=>t.hp>(this.previous!.runtime.actors[t.actorId]?.hp??t.hp)))act('cast',undefined,'staff','healing');
    if(old&&a.hp<old.hp){act('hit-weapon');entry.signals.hit={at:this.now};}
    const check=s.runtime.checks.at(-1);if(a.actorId===s.playerActorId&&check&&check.id!==this.previous.runtime.checks.at(-1)?.id)entry.signals.dice={at:this.now,value:check.mode==='disadvantage'?Math.min(...check.dice):Math.max(...check.dice),sides:20,success:check.success};
   }
  }
  this.previous=s;
 }
 frame(actorId:string,now:number,environment:ExpressionSignals['environment']='normal'){
  const s=this.previous,a=s?.runtime.actors[actorId],entry=this.actors.get(actorId);if(!s||!a||!entry)return;
  this.now=Math.max(this.now,now);const vitals={hp:a.hp,maxHp:a.maxHp,dead:false,inCombat:s.runtime.encounter?.status==='active'};
  entry.animation=advanceAnimation(entry.animation,this.now,vitals);
  const partner=s.story.npcs.find(n=>n.id===this.dialogueId),partnerActor=partner?Object.values(s.runtime.actors).find(a=>a.storyNpcId===partner.id):undefined,player=s.runtime.actors[s.playerActorId];
  const talking=!vitals.inCombat&&partnerActor&&Math.hypot(partnerActor.position.x-player.position.x,partnerActor.position.y-player.position.y)<=1.12&&(a.actorId===player.actorId||a.actorId===partnerActor.actorId);
  if(talking&&entry.animation.action==='stand')entry.animation=requestAnimation(entry.animation,{id:`talk:${this.now}`,action:'talk'},this.now,vitals).state;
  if(!talking&&entry.animation.action==='talk')entry.animation=requestAnimation(entry.animation,{id:`quiet:${this.now}`,action:'stand'},this.now,vitals).state;
  if(entry.animation.action==='walk'&&this.now>=entry.movingUntil)entry.animation=requestAnimation(entry.animation,{id:`idle:${this.now}`,action:vitals.inCombat?'combat-ready':'stand'},this.now,vitals).state;
  if(vitals.inCombat&&entry.animation.action==='stand')entry.animation=requestAnimation(entry.animation,{id:`ready:${this.now}`,action:'combat-ready'},this.now,vitals).state;
  const expression=resolveExpression({...entry.signals,environment,dialogue:talking?partner?.attitude==='hostile'?'hostile':partner?.attitude==='friendly'?'friendly':'neutral':'neutral'},vitals,entry.animation.action,this.now);
  return {appearance:a.profile.appearance,gender:a.profile.gender,action:entry.animation.action,direction:entry.animation.direction,weapon:entry.animation.weapon,spell:entry.animation.spell,progress:animationProgress(entry.animation,this.now),expression:expression.expression};
 }
}
