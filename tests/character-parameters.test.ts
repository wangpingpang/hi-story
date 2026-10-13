import { describe,it,expect } from 'vitest';
import { generateCharacter,generateCharacterWithParams,validateGeneratedCharacter,generateAppearance,appearanceCatalogFor,APPEARANCE_SLOTS,generatedCharacterSnapshot } from '../src/modules/characters';
import { artRegion,ART_SIZE } from '../src/presentation/character-art-layout';
import { CharacterStudio } from '../src/application/character-studio';

describe('story-supplied character parameters',()=>{
  it('retains identity, traits, numeric personality, preferences and visual overrides',()=>{
    const params={seed:'story:npc:1',name:'艾琳',gender:'female' as const,age:32,occupation:'游商',expertise:'谈判',background:'曾经营货摊。',personality:{traits:['谨慎','重视承诺'],parameters:{caution:.8,trust:.35}},preferences:{likes:['热汤'],dislikes:['欺骗']},motivation:'把货物送到边城。',appearanceParts:{top:{styleId:'wrap'},pants:{styleId:'long-skirt'},body:{styleId:'balanced',color:'#dfb18c'}}};
    const before=structuredClone(params),model=generateCharacterWithParams(params);
    expect(model).toMatchObject({name:'艾琳',gender:'female',age:32,identity:{occupationId:'custom',occupation:'游商',expertise:'谈判',background:'曾经营货摊。',backgroundSource:'provided'},personality:{source:'story-input',traits:params.personality.traits,parameters:params.personality.parameters},preferences:{source:'provided',likes:['热汤'],dislikes:['欺骗']},motivation:params.motivation,appearance:{version:'appearance/2',parts:{top:{styleId:'wrap'},pants:{styleId:'long-skirt'}}}});
    expect(params).toEqual(before);expect(generateCharacterWithParams(params)).toEqual(model);validateGeneratedCharacter(model);
    params.personality.traits.push('后加性格');params.personality.parameters.trust=1;params.preferences.likes.push('后加喜好');
    expect(model.personality.traits).toHaveLength(2);expect(model.personality.parameters?.trust).toBe(.35);expect(model.preferences?.likes).toEqual(['热汤']);
    const view=generatedCharacterSnapshot(model);expect(()=>{(view.preferences!.likes as string[]).push('改写');}).toThrow();
  });
  it('fills unspecified fields and preserves explicit empty preferences without inventing history',()=>{
    const a=generateCharacterWithParams({seed:'unknown',occupation:'流亡骑士',personality:{parameters:{curiosity:.6}},preferences:{likes:[]}});
    expect(a.identity.background).toContain('过往经历尚待补全');expect(a.identity.expertise).toBe('尚无专长记录');
    expect(a.personality).toMatchObject({source:'story-input',traits:[],parameters:{curiosity:.6}});expect(a.preferences).toMatchObject({likes:[],dislikes:[]});
    expect(a.name.length).toBeGreaterThan(0);expect(Object.keys(a.appearance.parts)).toHaveLength(7);
  });
  it('rejects contradictory preferences, duplicate traits, unsupported fields and invalid weights',()=>{
    const cases=[{preferences:{likes:['热汤'],dislikes:[' 热汤 ']}},{preferences:{likes:null}},{preferences:{dislikes:null}},{personality:{traits:['谨慎',' 谨慎 ']}},{personality:{parameters:{trust:1.1}}},{personality:{parameters:{trust:NaN}}},{personality:{parameters:{trust:-.1}}},{personality:{parameters:{trust:'高'}}},{preferences:[]},{preferences:true},{personality:[]},{occupation:'游商',occupationId:'scribe'},{appearanceParts:{top:{styleId:'wrap',unknown:true}}},{appearanceParts:{unknown:{styleId:'coat'}}}];
    for(const params of cases)expect(()=>generateCharacterWithParams({seed:'invalid',...params} as never)).toThrow();
  });
  it('keeps player personality pending evidence and honors explicit player preferences',()=>{
    expect(()=>generateCharacterWithParams({seed:'player',control:'player',personality:{parameters:{trust:.9}}})).toThrow('选择证据');
    const model=generateCharacter('player',{control:'player'});expect(model.personality.traits).toEqual([]);expect(model.preferences?.likes).toEqual([]);expect(model.preferences?.dislikes).toEqual([]);
    expect(generateCharacterWithParams({seed:'player',control:'player',preferences:{likes:['旧书']}}).preferences?.likes).toEqual(['旧书']);
  });
  it('continues to validate old serialized records without preferences',()=>{
    const model=generateCharacter('legacy');delete model.preferences;validateGeneratedCharacter(JSON.parse(JSON.stringify(model)));
  });
});

describe('versioned appearance and material registration',()=>{
  it('appearance/2 covers wrap and both skirt styles without changing version 1',()=>{
    const found=new Set<string>();
    for(let i=0;i<1000;i++){const model=generateAppearance(`new:${i}`,'appearance/2');found.add(model.parts.top.styleId);found.add(model.parts.pants.styleId);}
    for(const style of ['wrap','skirt','long-skirt'])expect(found.has(style)).toBe(true);
    expect(appearanceCatalogFor('appearance/1').top.styles.some(s=>s.id==='wrap')).toBe(false);
    expect(generateCharacterWithParams({seed:'default',appearanceVersion:undefined}).appearance.version).toBe('appearance/2');
    expect(()=>generateCharacter('v1',{appearanceParts:{pants:{styleId:'long-skirt'}}})).toThrow();
  });
  it('every gender and part has a bounded source region and a valid target',()=>{
    const catalog=appearanceCatalogFor('appearance/2');
    for(const gender of ['male','female'] as const)for(const slot of APPEARANCE_SLOTS)for(const style of catalog[slot].styles){
      const region=artRegion(slot,style.id,gender);if(!region){expect([slot,style.id]).toEqual(['accessory','none']);continue;}
      const [x,y,w,h]=region.crop,[sx,sy,sw,sh]=region.target,[width,height]=region.sheet==='common'?[1161,1354]:[1536,1024];
      expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);expect(x+w).toBeLessThanOrEqual(width);expect(y+h).toBeLessThanOrEqual(height);
      expect(sx).toBeGreaterThanOrEqual(0);expect(sy).toBeGreaterThanOrEqual(0);expect(sx+sw).toBeLessThanOrEqual(ART_SIZE.width);expect(sy+sh).toBeLessThanOrEqual(ART_SIZE.height);
    }
  });
  it('studio switches gender without changing a locked appearance or accepting invalid rig values',()=>{
    const studio=new CharacterStudio('rig');studio.lock('body',true);const before=studio.query();studio.setGender('female');expect(studio.query().model).toEqual(before.model);expect(studio.query().gender).toBe('female');
    expect(()=>studio.setGender('unknown' as never)).toThrow();expect(studio.query().gender).toBe('female');
  });
});
