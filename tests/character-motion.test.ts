import { describe,it,expect } from 'vitest';
import { ACTIONS,DIRECTIONS,DIRECTION_VECTORS,APPEARANCE_SLOTS,appearanceCatalogFor,generateAppearance,generateCharacterWithParams,createAnimation,requestAnimation,advanceAnimation,animationProgress,resolveExpression } from '../src/modules/characters';
import { CharacterMotionStudio } from '../src/application/character-motion';
import { sampleRigPose,WEAPON_POSES,SPELL_POSES,mirrorRigPose } from '../src/presentation/motion-clips';
const alive={hp:100,maxHp:100,dead:false,inCombat:false};
describe('versioned appearance expansion',()=>{
  it('doubles all seven V2 catalogs without changing old catalogs',()=>{
    for(const slot of APPEARANCE_SLOTS){const a=appearanceCatalogFor('appearance/2')[slot].styles,b=appearanceCatalogFor('appearance/3')[slot].styles;expect(b).toHaveLength(a.length*2);expect(b.slice(0,a.length)).toEqual(a);expect(new Set(b.map(s=>s.id)).size).toBe(b.length);}
    expect(generateAppearance('same','appearance/2')).toEqual(generateAppearance('same','appearance/2'));
  });
  it('makes every expanded style reachable by seeded generation',()=>{
    const seen=Object.fromEntries(APPEARANCE_SLOTS.map(s=>[s,new Set<string>()]));
    for(let i=0;i<2000;i++){const c=generateCharacterWithParams({seed:`motion:${i}`,appearanceVersion:'appearance/3'});for(const slot of APPEARANCE_SLOTS)seen[slot].add(c.appearance.parts[slot].styleId);}
    for(const slot of APPEARANCE_SLOTS)expect([...seen[slot]].sort()).toEqual(appearanceCatalogFor('appearance/3')[slot].styles.map(s=>s.id).sort());
  });
  it('preserves story personality, preferences and old defaults',()=>{
    const c=generateCharacterWithParams({seed:'story-input',personality:{traits:['谨慎'],parameters:{courage:.4}},preferences:{likes:['读书']},appearanceVersion:'appearance/3'});
    expect(c.personality.parameters).toEqual({courage:.4});expect(c.preferences?.likes).toEqual(['读书']);expect(generateCharacterWithParams({seed:'old'}).appearance.version).toBe('appearance/2');
  });
});
describe('animation lifecycle',()=>{
  it('normalizes eight direction movement vectors',()=>{expect(DIRECTIONS).toHaveLength(8);for(const vector of Object.values(DIRECTION_VECTORS))expect(Math.hypot(...vector)).toBeCloseTo(1);});
  it('keeps walking phase while changing direction',()=>{let s=requestAnimation(createAnimation(),{id:'walk',action:'walk'},0,alive).state;s=requestAnimation(s,{id:'turn',action:'walk',direction:'E'},200,alive).state;expect(s.startedAt).toBe(0);expect(animationProgress(s,200)).toBe(.25);});
  it('rejects duplicate hits and lower-priority interruptions',()=>{let r=requestAnimation(createAnimation(),{id:'hit',action:'hit-weapon'},0,alive);expect(r.accepted).toBe(true);r=requestAnimation(r.state,{id:'walk',action:'walk'},100,alive);expect(r.accepted).toBe(false);r=requestAnimation(r.state,{id:'hit',action:'hit-weapon'},200,alive);expect(r.accepted).toBe(false);expect(r.state.startedAt).toBe(0);expect(advanceAnimation(r.state,650,alive).action).toBe('stand');});
  it('allows hit to interrupt an attack and returns to combat idle',()=>{let s=requestAnimation(createAnimation(),{id:'attack',action:'attack'},0,{...alive,inCombat:true}).state;s=requestAnimation(s,{id:'hit',action:'hit-spell'},200,{...alive,inCombat:true}).state;expect(s.action).toBe('hit-spell');expect(advanceAnimation(s,1050,{...alive,inCombat:true}).action).toBe('combat-ready');});
  it('falls at zero HP and remains downed until explicit death or recovery',()=>{const zero={...alive,hp:0};let s=advanceAnimation(createAnimation(),50,zero);expect(s.action).toBe('fall');s=advanceAnimation(s,950,zero);expect(s.action).toBe('downed');expect(requestAnimation(s,{id:'attack',action:'attack'},950,zero).accepted).toBe(false);expect(advanceAnimation(s,10000,zero).action).toBe('downed');expect(advanceAnimation(s,10000,{...zero,dead:true}).action).toBe('dead');expect(advanceAnimation(s,10000,alive).action).toBe('stand');});
  it('validates times, vital ranges and incompatible death flags',()=>{expect(()=>advanceAnimation(createAnimation(),-1,alive)).toThrow();expect(()=>advanceAnimation(createAnimation(),0,{...alive,dead:true})).toThrow();expect(()=>requestAnimation(createAnimation(),{id:'x',action:'walk',direction:'invalid' as never},0,alive)).toThrow();expect(()=>advanceAnimation(createAnimation(),0,{...alive,hp:NaN})).toThrow();});
  it('bounds event deduplication memory',()=>{let s=createAnimation();for(let i=0;i<100;i++)s=requestAnimation(s,{id:`event:${i}`,action:'stand'},i,alive).state;expect(s.eventIds).toHaveLength(64);});
  it('provides finite distinct weapon and spell trajectories',()=>{const weapon=new Set(Object.keys(WEAPON_POSES).map(w=>JSON.stringify(sampleRigPose('attack',.5,w as never))));const spell=new Set(Object.keys(SPELL_POSES).map(s=>JSON.stringify(sampleRigPose('cast',.5,'unarmed',s as never))));expect(weapon.size).toBe(10);expect(spell.size).toBe(7);for(const a of Object.keys(ACTIONS))for(let p=0;p<=1;p+=.125)expect(Object.values(sampleRigPose(a as never,p)).every(Number.isFinite)).toBe(true);const pose=sampleRigPose('attack',.3);expect(mirrorRigPose(mirrorRigPose(pose))).toEqual(pose);});
});
describe('reactive expression arbitration',()=>{
  it('expires dice emotions and restores environment at the exact boundary',()=>{const signals={environment:'dark' as const,dice:{value:20,sides:20,success:true,at:100}};expect(resolveExpression(signals,alive,'stand',1899).expression).toBe('elated');expect(resolveExpression(signals,alive,'stand',1900).expression).toBe('fear');});
  it('applies life, sleep, hit, condition, dice, combat and dialogue priorities',()=>{const signals={manual:'happy' as const,status:'poisoned' as const,dice:{value:20,sides:20,success:true,at:0},hit:{at:0}};expect(resolveExpression(signals,{...alive,hp:0},'downed',0).priority).toBe(95);expect(resolveExpression(signals,alive,'sleep',0).expression).toBe('asleep');expect(resolveExpression(signals,alive,'stand',0).source).toBe('hit');expect(resolveExpression(signals,alive,'stand',1000).expression).toBe('sick');expect(resolveExpression({}, {...alive,hp:25},'stand',0).source).toBe('life');expect(resolveExpression({}, {...alive,inCombat:true},'stand',0).expression).toBe('focused');expect(resolveExpression({dialogue:'hostile'},alive,'talk',0).expression).toBe('angry');});
  it('validates dice and future events',()=>{expect(()=>resolveExpression({dice:{value:21,sides:20,success:true,at:0}},alive,'stand',0)).toThrow();expect(()=>resolveExpression({hit:{at:1}},alive,'stand',0)).toThrow();});
});
describe('motion application adapter',()=>{
  it('imports appearance exactly, upgrades explicitly, and isolates snapshots',()=>{const old=generateAppearance('import','appearance/2'),s=new CharacterMotionStudio('ignored',{appearance:old,gender:'male'});expect(s.query().appearance).toEqual(old);s.upgradeAppearance();expect(s.query().appearance.parts).toEqual(old.parts);expect(s.query().appearance.version).toBe('appearance/3');expect(Object.isFrozen(s.query().animation.eventIds)).toBe(true);});
  it('keeps invalid updates atomic and handles hit duplicates without extending emotion',()=>{const s=new CharacterMotionStudio();s.receiveHit('weapon','same');s.tick(500);expect(s.receiveHit('weapon','same')).toBe(false);expect(s.query().signals.hit?.at).toBe(0);const before=s.query();expect(()=>s.setVitals({hp:101})).toThrow();expect(s.query()).toEqual(before);expect(()=>s.setSignals({dice:{value:99,sides:20,success:true,at:500}})).toThrow();expect(s.query()).toEqual(before);});
  it('moves continuously at the same diagonal speed and stops when downed',()=>{const s=new CharacterMotionStudio();s.act('walk',{direction:'SE'});s.tick(200);expect(Math.hypot(s.query().position.x,s.query().position.y)).toBeCloseTo(12);s.setVitals({hp:0});const before=s.query().position;s.tick(1100);expect(s.query().animation.action).toBe('downed');expect(s.query().position).toEqual(before);s.restore();expect(s.query().vitals.hp).toBe(100);});
});
