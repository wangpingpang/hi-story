import { freeze, type DeepReadonly } from '../../contracts';

export const ANIMATION_VERSION = 'character-animation/1' as const;
export const DIRECTIONS = ['S','SE','E','NE','N','NW','W','SW'] as const;
export type Direction = typeof DIRECTIONS[number];
const diagonal = Math.SQRT1_2;
export const DIRECTION_VECTORS = freeze({S:[0,1],SE:[diagonal,diagonal],E:[1,0],NE:[diagonal,-diagonal],N:[0,-1],NW:[-diagonal,-diagonal],W:[-1,0],SW:[-diagonal,diagonal]} as const);
export const WEAPONS = ['unarmed','dagger','sword','greatsword','axe','mace','spear','bow','crossbow','staff'] as const;
export type Weapon = typeof WEAPONS[number];
export const SPELLS = ['fire','frost','lightning','healing','ward','summon','arcane'] as const;
export type Spell = typeof SPELLS[number];
const clip = (label:string,duration:number,loop:boolean,priority:number) => ({label,duration,loop,priority});
export const ACTIONS = freeze({
  stand:clip('站立',1600,true,0), 'stand-relaxed':clip('放松站姿',1800,true,0),'stand-alert':clip('警戒站姿',1600,true,0),walk:clip('移动',800,true,0),
  talk:clip('对话手势',1600,true,10),wave:clip('招手',1000,false,15),point:clip('指向',1000,false,15),nod:clip('点头',700,false,15),'shake-head':clip('摇头',700,false,15),
  sit:clip('坐姿',1800,true,5),lean:clip('倚靠',1800,true,5),lie:clip('躺卧',2000,true,5),sleep:clip('睡觉',2200,true,5),
  'combat-ready':clip('战斗预备',1200,true,20),attack:clip('普通攻击',700,false,50),'heavy-attack':clip('重击',1100,false,50),cast:clip('施法',1200,false,50),
  'hit-unarmed':clip('徒手受击',500,false,80),'hit-weapon':clip('武器受击',650,false,80),'hit-spell':clip('法术受击',850,false,80),block:clip('格挡',650,false,60),dodge:clip('闪避',750,false,60),
  fall:clip('倒下',900,false,100),downed:clip('倒地未死亡',1800,true,100),dead:clip('死亡',2000,true,110),
});
export type Action = keyof typeof ACTIONS;
export interface VisualVitals { hp:number; maxHp:number; dead:boolean; inCombat:boolean }
export interface AnimationState {
  version:typeof ANIMATION_VERSION; action:Action; direction:Direction; weapon:Weapon; spell:Spell;
  startedAt:number; updatedAt:number; eventIds:string[];
}
export interface MotionEvent { id:string; action:Action; direction?:Direction; weapon?:Weapon; spell?:Spell }
export function validateVitals(v:DeepReadonly<VisualVitals>):void {
  if(!v || !Number.isFinite(v.hp)||!Number.isFinite(v.maxHp)||v.maxHp<=0||v.hp<0||v.hp>v.maxHp||typeof v.dead!=='boolean'||typeof v.inCombat!=='boolean'||(v.dead&&v.hp!==0))throw Error('生命显示参数无效');
}
export function validateTime(now:number,previous=0):void {if(!Number.isFinite(now)||now<previous)throw Error('动作时间须为单调递增的非负毫秒数');}
export function createAnimation(now=0):AnimationState {
  validateTime(now);return {version:ANIMATION_VERSION,action:'stand',direction:'S',weapon:'unarmed',spell:'arcane',startedAt:now,updatedAt:now,eventIds:[]};
}
function validateState(s:DeepReadonly<AnimationState>):void {
  if(!s||s.version!==ANIMATION_VERSION||!Object.hasOwn(ACTIONS,s.action)||!DIRECTIONS.includes(s.direction)||!WEAPONS.includes(s.weapon)||!SPELLS.includes(s.spell)||!Array.isArray(s.eventIds)||s.eventIds.length>64||new Set(s.eventIds).size!==s.eventIds.length||s.eventIds.some(id=>typeof id!=='string'||!id.trim()||id.length>128))throw Error('动作状态无效');
  validateTime(s.startedAt);validateTime(s.updatedAt,s.startedAt);
}
export function advanceAnimation(state:DeepReadonly<AnimationState>,now:number,vitals:DeepReadonly<VisualVitals>):AnimationState {
  validateState(state);validateTime(now,state.updatedAt);validateVitals(vitals);
  const s=structuredClone(state) as AnimationState;s.updatedAt=now;
  const set=(action:Action,start=now)=>{s.action=action;s.startedAt=start;};
  if(vitals.dead){if(s.action!=='dead')set('dead');return s;}
  if(vitals.hp===0){
    if(s.action!=='fall'&&s.action!=='downed')set('fall');
    if(s.action==='fall'&&now-s.startedAt>=ACTIONS.fall.duration)set('downed',s.startedAt+ACTIONS.fall.duration);
    return s;
  }
  if(['fall','downed','dead'].includes(s.action))set(vitals.inCombat?'combat-ready':'stand');
  else if(!ACTIONS[s.action].loop&&now-s.startedAt>=ACTIONS[s.action].duration)set(vitals.inCombat?'combat-ready':'stand',s.startedAt+ACTIONS[s.action].duration);
  else if(s.action==='combat-ready'&&!vitals.inCombat)set('stand');
  return s;
}
export function requestAnimation(state:DeepReadonly<AnimationState>,event:MotionEvent,now:number,vitals:DeepReadonly<VisualVitals>):{state:AnimationState;accepted:boolean} {
  const s=advanceAnimation(state,now,vitals);
  if(!event||typeof event.id!=='string'||!event.id.trim()||event.id.length>128||!Object.hasOwn(ACTIONS,event.action)||(event.direction!==undefined&&!DIRECTIONS.includes(event.direction))||(event.weapon!==undefined&&!WEAPONS.includes(event.weapon))||(event.spell!==undefined&&!SPELLS.includes(event.spell)))throw Error('动作事件无效');
  if(s.eventIds.includes(event.id))return {state:s,accepted:false};
  s.eventIds=[...s.eventIds,event.id].slice(-64);
  if(vitals.hp===0||['fall','downed','dead'].includes(event.action))return {state:s,accepted:false};
  if(!ACTIONS[s.action].loop&&ACTIONS[event.action].priority<ACTIONS[s.action].priority)return {state:s,accepted:false};
  const sameWalk=s.action==='walk'&&event.action==='walk';
  s.action=event.action;if(!sameWalk)s.startedAt=now;
  if(event.direction)s.direction=event.direction;if(event.weapon)s.weapon=event.weapon;if(event.spell)s.spell=event.spell;
  return {state:s,accepted:true};
}
export function animationProgress(state:DeepReadonly<AnimationState>,now:number):number {
  validateState(state);validateTime(now,state.updatedAt);const elapsed=now-state.startedAt,d=ACTIONS[state.action];
  return d.loop?(elapsed%d.duration)/d.duration:Math.min(1,elapsed/d.duration);
}
