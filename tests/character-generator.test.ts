import { describe, it, expect } from 'vitest';
import { APPEARANCE_CATALOG, APPEARANCE_SLOTS, generateAppearance, validateAppearance, rerollAppearance, rerollAppearancePart, setAppearancePart, create, snapshot } from '../src/modules/characters';
import { CharacterStudio } from '../src/application/character-studio';

it('静态衣橱可显式选择旧外观骨架，默认工坊仍使用新版且重抽保持版本',()=>{const legacy=new CharacterStudio('wardrobe','appearance/2'),modern=new CharacterStudio('wardrobe');expect(legacy.query().model.version).toBe('appearance/2');expect(modern.query().model.version).toBe('appearance/3');legacy.generate('wardrobe-next');expect(legacy.query().model.version).toBe('appearance/2');});
import { Game } from '../src/application/game';
import { choiceCommand } from '../src/input';

describe('random character appearance', () => {
  it('reproduces a full seven-part model from the same seed', () => {
    const first = generateAppearance('旅人:001');
    expect(generateAppearance('旅人:001')).toEqual(first);
    expect(Object.keys(first.parts)).toEqual(APPEARANCE_SLOTS);
    expect(generateAppearance('旅人:002')).not.toEqual(first);
    validateAppearance(first);
  });
  it('covers every style and color with valid outputs over 1000 deterministic seeds', () => {
    const styles = Object.fromEntries(APPEARANCE_SLOTS.map(s=>[s,new Set<string>()]));
    const colors = Object.fromEntries(APPEARANCE_SLOTS.map(s=>[s,new Set<string>()]));
    for(let i=0;i<1000;i++) {
      const model = generateAppearance(`coverage:${i}`); validateAppearance(model);
      for(const slot of APPEARANCE_SLOTS) { styles[slot].add(model.parts[slot].styleId); colors[slot].add(model.parts[slot].color); }
    }
    for(const slot of APPEARANCE_SLOTS) {
      expect([...styles[slot]].sort()).toEqual(APPEARANCE_CATALOG[slot].styles.map(s=>s.id).sort());
      expect([...colors[slot]].sort()).toEqual([...APPEARANCE_CATALOG[slot].colors].sort());
    }
  });
  it.each(APPEARANCE_SLOTS)('rerolls only %s, using the same stream as full generation', slot => {
    const model=generateAppearance('first'),before=structuredClone(model);
    const next=rerollAppearancePart(model,slot,'second');
    for(const s of APPEARANCE_SLOTS) expect(next.parts[s]).toEqual(s===slot?generateAppearance('second').parts[s]:model.parts[s]);
    expect(model).toEqual(before); expect(next.parts[slot]).not.toBe(model.parts[slot]);
  });
  it('preserves locked styles and colors and copies all parts', () => {
    const model=generateAppearance('first');
    const next=rerollAppearance(model,'second',['hair','body']);
    for(const slot of APPEARANCE_SLOTS) expect(next.parts[slot]).toEqual(['hair','body'].includes(slot)?model.parts[slot]:generateAppearance('second').parts[slot]);
    next.parts.hair.color='#bad'; expect(model.parts.hair.color).not.toBe('#bad');
    expect(rerollAppearance(model,'third',APPEARANCE_SLOTS).parts).toEqual(model.parts);
  });
  it('rejects blank or oversized seeds and malformed/unsupported models', () => {
    for(const seed of ['', '  ', 'x'.repeat(129)]) expect(()=>generateAppearance(seed)).toThrow();
    const model=generateAppearance('first');
    expect(()=>validateAppearance({...model,version:'appearance/999'} as never)).toThrow();
    expect(()=>setAppearancePart(model,'hair',{styleId:'<script>',color:model.parts.hair.color})).toThrow();
    expect(()=>setAppearancePart(model,'hair',{styleId:'crop',color:'red" onclick="bad'})).toThrow();
    expect(()=>rerollAppearancePart(model,'unknown' as never,'second')).toThrow();
    expect(()=>validateAppearance({...model,parts:{...model.parts,extra:model.parts.hair}} as never)).toThrow();
    const bad=structuredClone(model); delete (bad.parts as Partial<typeof bad.parts>).face;
    expect(()=>validateAppearance(bad)).toThrow();
  });
  it('round-trips a manually edited model via JSON without losing any part', () => {
    const model=generateAppearance('first');
    const edited=setAppearancePart(model,'hair',{styleId:'bun',color:'#252a35'});
    const restored=JSON.parse(JSON.stringify(edited)); validateAppearance(restored);
    expect(restored).toEqual(edited); expect(model).toEqual(generateAppearance('first'));
  });
  it('publishes a frozen catalog and a separately frozen roster snapshot', () => {
    const roster=create('seed'),view=snapshot(roster);
    expect(()=>{ (APPEARANCE_CATALOG.hair.colors as string[]).push('bad'); }).toThrow();
    expect(()=>{ (view.courier.appearance.parts.hair as {color:string}).color='bad'; }).toThrow();
    expect(roster.courier.appearance).toEqual(generateAppearance('seed:courier'));
    expect(roster.luyan.appearance).toEqual(generateAppearance('seed:luyan'));
  });
});

describe('studio and adventure integration', () => {
  it('honors locks for random, manual and single-part operations; failures are atomic', () => {
    const studio=new CharacterStudio('first');studio.lock('top',true);
    const before=studio.query();
    expect(()=>studio.reroll('top','second')).toThrow('解锁');
    expect(()=>studio.setPart('top',{styleId:'shirt',color:'#587b72'})).toThrow('解锁');
    expect(()=>studio.generate(' ')).toThrow();expect(studio.query()).toEqual(before);
    studio.generate('second');expect(studio.query().model.parts.top).toEqual(before.model.parts.top);
    studio.lock('top',false);studio.setPart('top',{styleId:'shirt',color:'#587b72'});
    expect(studio.query().model.parts.top).toEqual({styleId:'shirt',color:'#587b72'});
    expect(()=>studio.lock('unknown' as never,true)).toThrow();
  });
  it('keeps authority separate from mutable exports and immutable query snapshots', () => {
    const studio=new CharacterStudio('first'),before=studio.query();
    expect(()=>{ (before.locked as string[]).push('hair'); }).toThrow();
    const exported=JSON.parse(JSON.stringify(before.model));exported.parts.hair.styleId='invalid';
    expect(studio.query()).toEqual(before);
  });
  it('appearance persists through story choices and is regenerated per new run', () => {
    let id=0; const game=new Game(()=>`run-${++id}`),before=game.query();
    for(const choice of ['A','carry','public'] as const) expect(game.execute(choiceCommand(game.query(),choice,`cmd-${choice}`)).ok).toBe(true);
    const after=game.query();
    expect(after.characters.courier.appearance).toEqual(before.characters.courier.appearance);
    expect(after.characters.luyan.appearance).toEqual(before.characters.luyan.appearance);
    expect(after.characters.courier.condition).toBe('exerted');
    game.restart();expect(game.query().characters.courier.appearance).not.toEqual(before.characters.courier.appearance);
  });
});
