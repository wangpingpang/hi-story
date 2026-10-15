import { freeze, type DeepReadonly } from '../contracts';
import * as characters from '../modules/characters';
export { ACTIONS, DIRECTIONS, DIRECTION_VECTORS, WEAPONS, SPELLS, EXPRESSIONS, ENVIRONMENTS, ACTOR_STATUSES, DIALOGUE_TONES, ANIMATION_VERSION, APPEARANCE_SLOTS, appearanceCatalogFor } from '../modules/characters';
export type { Action, Direction, Weapon, Spell, Expression, ExpressionSignals, ExpressionResult, VisualVitals, Appearance, AppearanceSlot, AppearancePart, Gender, AnimationState } from '../modules/characters';

// Visual adapter: real health, death and combat results remain owned by the runner.
export class CharacterMotionStudio {
  #appearance:characters.Appearance;
  #gender:characters.Gender;
  #animation=characters.createAnimation();
  #vitals:characters.VisualVitals={hp:100,maxHp:100,dead:false,inCombat:false};
  #signals:characters.ExpressionSignals={environment:'normal',status:'normal',dialogue:'neutral'};
  #now=0;
  #position={x:0,y:0};
  #sequence=0;
  constructor(seed='hi-story:motion:001',options?:{appearance?:DeepReadonly<characters.Appearance>;gender?:characters.Gender}) {
    this.#appearance=options?.appearance?structuredClone(options.appearance) as characters.Appearance:characters.generateAppearance(seed,'appearance/3');
    characters.validateAppearance(this.#appearance);this.#gender=options?.gender??'female';
    if(!['male','female'].includes(this.#gender))throw Error('身体类型无效');
  }
  query(){return freeze({appearance:structuredClone(this.#appearance),gender:this.#gender,animation:structuredClone(this.#animation),vitals:{...this.#vitals},signals:structuredClone(this.#signals),now:this.#now,progress:characters.animationProgress(this.#animation,this.#now),position:{...this.#position},expression:characters.resolveExpression(this.#signals,this.#vitals,this.#animation.action,this.#now)});}
  tick(now:number):void {
    const before=this.#animation,after=characters.advanceAnimation(before,now,this.#vitals);
    if(before.action==='walk'&&after.action==='walk'){
      // Bound only the local preview stage. World collision and navigation are external.
      const dt=Math.min(250,now-this.#now)/1000,[x,y]=characters.DIRECTION_VECTORS[after.direction];
      this.#position.x=Math.max(-100,Math.min(100,this.#position.x+x*60*dt));
      this.#position.y=Math.max(-35,Math.min(35,this.#position.y+y*60*dt));
    }
    this.#now=now;this.#animation=after;
  }
  act(action:characters.Action,options:{direction?:characters.Direction;weapon?:characters.Weapon;spell?:characters.Spell;eventId?:string}={}):boolean {
    const result=characters.requestAnimation(this.#animation,{id:options.eventId??`preview:${++this.#sequence}`,action,direction:options.direction,weapon:options.weapon,spell:options.spell},this.#now,this.#vitals);
    this.#animation=result.state;return result.accepted;
  }
  setVitals(patch:Partial<characters.VisualVitals>):void {
    const next={...this.#vitals,...patch};characters.validateVitals(next);
    const animation=characters.advanceAnimation(this.#animation,this.#now,next);
    this.#vitals=next;this.#animation=animation;
  }
  setSignals(patch:Partial<characters.ExpressionSignals>):void {
    const next={...this.#signals,...structuredClone(patch)};characters.validateExpressionSignals(next,this.#now);this.#signals=next;
  }
  receiveHit(kind:'unarmed'|'weapon'|'spell',eventId?:string):boolean {
    if(!['unarmed','weapon','spell'].includes(kind))throw Error('受击类型无效');
    const accepted=this.act(`hit-${kind}`,{eventId});if(accepted)this.setSignals({hit:{at:this.#now}});return accepted;
  }
  roll(value:number,success:boolean,sides=20):void {this.setSignals({dice:{value,sides,success,at:this.#now}});}
  setPart(slot:characters.AppearanceSlot,part:characters.AppearancePart):void {this.#appearance=characters.setAppearancePart(this.#appearance,slot,part);}
  setGender(gender:characters.Gender):void {if(!['male','female'].includes(gender))throw Error('身体类型无效');this.#gender=gender;}
  randomize(seed:string):void {const next=characters.generateAppearance(seed,'appearance/3');this.#appearance=next;}
  upgradeAppearance():void {this.#appearance={...this.#appearance,version:'appearance/3'};characters.validateAppearance(this.#appearance);}
  restore():void {this.#vitals={hp:100,maxHp:100,dead:false,inCombat:false};this.#signals={environment:'normal',status:'normal',dialogue:'neutral'};this.#position={x:0,y:0};this.#animation=characters.createAnimation(this.#now);}
}
export type MotionView=ReturnType<CharacterMotionStudio['query']>;
