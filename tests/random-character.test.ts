import { describe,it,expect } from 'vitest';
import { generateCharacter,validateGeneratedCharacter,generatedCharacterSnapshot,generateAppearance,OCCUPATIONS,PROFILE_CATALOG,type CharacterGenerationOptions } from '../src/modules/characters';

describe('random-character/1',()=>{
  it('reproduces a complete profile and separates independent characters by seed',()=>{
    const model=generateCharacter('profile-001');
    expect(generateCharacter('profile-001')).toEqual(model);
    expect(generateCharacter('profile-002').actorId).not.toBe(model.actorId);
    expect(model).toMatchObject({version:'random-character/1',seed:'profile-001',control:'npc',personality:{source:'npc-initial'}});
    expect(model.personality.traits).toHaveLength(3);
    expect(Object.keys(model.appearance.parts)).toHaveLength(7);
  });
  it('1000 fixed seeds cover both sexes and all careers with coherent outfits',()=>{
    const genders=new Set(),careers=new Set(),ids=new Set();
    for(let index=0;index<1000;index++) {
      const model=generateCharacter(`profile-coverage:${index}`);validateGeneratedCharacter(model);
      expect(model.age).toBeGreaterThanOrEqual(18);expect(model.age).toBeLessThanOrEqual(70);
      const job=OCCUPATIONS[model.identity.occupationId];
      for(const slot of ['top','pants','shoes','accessory'] as const) expect([...job.wardrobe[slot]]).toContain(model.appearance.parts[slot].styleId);
      expect(job.histories.some(history=>model.identity.background.endsWith(history))).toBe(true);
      expect([...job.motivations]).toContain(model.motivation);
      expect(new Set(model.personality.traits).size).toBe(3);
      genders.add(model.gender);careers.add(model.identity.occupationId);ids.add(model.actorId);
    }
    expect(genders).toEqual(new Set(['male','female']));expect(careers.size).toBe(Object.keys(OCCUPATIONS).length);expect(ids.size).toBe(1000);
  });
  it('gender override changes the name pool without perturbing age, history or appearance',()=>{
    const male=generateCharacter('fixed',{gender:'male'}),female=generateCharacter('fixed',{gender:'female'});
    expect([...PROFILE_CATALOG.maleNames]).toContain(male.name.split('·')[0]);
    expect([...PROFILE_CATALOG.femaleNames]).toContain(female.name.split('·')[0]);
    expect(female.age).toBe(male.age);expect(female.identity).toEqual(male.identity);expect(female.appearance).toEqual(male.appearance);
  });
  it('honors custom identity while keeping player personality pending evidence',()=>{
    const options:CharacterGenerationOptions={control:'player',gender:'female',age:18,occupationId:'blacksmith',name:'自定义旅人',background:'我在边城长大，曾修好一座钟塔。'};
    const before=structuredClone(options),model=generateCharacter('player',options);
    expect(model).toMatchObject({control:'player',gender:'female',age:18,name:options.name,identity:{occupationId:'blacksmith',background:options.background,backgroundSource:'provided'},personality:{source:'choice-evidence',traits:[]}});
    expect(options).toEqual(before);expect(generateCharacter('elder',{age:70}).age).toBe(70);
    validateGeneratedCharacter(model);
  });
  it('rejects invalid seeds, options, ages, missing values and prototype-shaped careers',()=>{
    for(const seed of ['', ' ', 'x'.repeat(129)])expect(()=>generateCharacter(seed)).toThrow();
    expect(()=>generateCharacter('x'.repeat(128))).not.toThrow();
    for(const options of [null,[],{gender:'unknown'},{control:'enemy'},{age:17},{age:71},{age:20.5},{age:NaN},{name:' '},{background:'\u0000'},{background:'a'.repeat(601)},{occupationId:'__proto__'},{occupationId:'constructor'},{unknown:true}])expect(()=>generateCharacter('invalid',options as never)).toThrow();
  });
  it('rejects corrupted profile identity, demographics, traits and appearance',()=>{
    const changes=[
      (m:ReturnType<typeof generateCharacter>)=>{m.actorId='wrong';},
      (m:ReturnType<typeof generateCharacter>)=>{m.age=undefined as never;},
      (m:ReturnType<typeof generateCharacter>)=>{m.identity.occupation='错误职业';},
      (m:ReturnType<typeof generateCharacter>)=>{m.personality.traits=['谨慎','冲动','未知'];},
      (m:ReturnType<typeof generateCharacter>)=>{m.personality.traits=new Array(3);},
      (m:ReturnType<typeof generateCharacter>)=>{m.appearance.parts.hair.styleId='invalid';},
      (m:ReturnType<typeof generateCharacter>)=>{m.appearance.seed='another';},
      (m:ReturnType<typeof generateCharacter>)=>{m.version='random-character/999' as never;},
    ];
    for(const change of changes){const model=generateCharacter('valid');change(model);expect(()=>validateGeneratedCharacter(model)).toThrow();}
    const player=generateCharacter('player',{control:'player'});player.personality.traits=['谨慎'];expect(()=>validateGeneratedCharacter(player)).toThrow();
  });
  it('JSON round-trip and frozen snapshots preserve authority',()=>{
    const model=generateCharacter('snapshot'),view=generatedCharacterSnapshot(model);
    const restored=JSON.parse(JSON.stringify(model));validateGeneratedCharacter(restored);expect(restored).toEqual(model);
    expect(()=>{(view.personality.traits as string[]).push('坏数据');}).toThrow();
    model.appearance.parts.hair.styleId='crop';model.name='已修改';expect(view.name).not.toBe(model.name);
    expect(()=>{(OCCUPATIONS.courier.wardrobe.top as string[]).push('invalid');}).toThrow();
  });
  it('keeps the established appearance/1 seed fixture unchanged after sharing the RNG',()=>{
    expect(generateAppearance('hi-story:sample:001').parts).toEqual({
      hair:{styleId:'bun',color:'#dfbf79'},face:{styleId:'round',color:'#5d6842'},body:{styleId:'broad',color:'#9c664b'},top:{styleId:'tunic',color:'#b7aca0'},pants:{styleId:'straight',color:'#535c44'},shoes:{styleId:'boots',color:'#8b694e'},accessory:{styleId:'pendant',color:'#a8584f'},
    });
  });
});
