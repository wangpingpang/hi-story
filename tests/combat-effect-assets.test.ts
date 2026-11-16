import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {combatEffectFrame,validateCombatEffectManifest,type EffectManifest} from '../src/presentation/combat-effect-assets';

const manifest=()=>JSON.parse(readFileSync('public/assets/effects/pixelfx/manifest.json','utf8')) as EffectManifest;

describe('PixelFX presentation asset contract',()=>{
 it('accepts the shipped six effects with their measured pivots and timing',()=>{
  const m=manifest();
  expect(validateCombatEffectManifest(m)).toBe(m);
  expect(Object.keys(m.effects).sort()).toEqual(['arcane','fire','healing','ice','lightning','wind']);
 });
 for(const [name,change] of [
  ['foreign image URL',(m:EffectManifest)=>{m.effects.fire.url='https://example.com/fire.webp';}],
  ['missing healing',(m:EffectManifest)=>{delete (m.effects as Partial<EffectManifest['effects']>).healing;}],
  ['out of bounds frame',(m:EffectManifest)=>{m.effects.fire.frames[0].rect[0]=m.effects.fire.width;}],
  ['different frame canvas',(m:EffectManifest)=>{m.effects.fire.frames[1].rect[2]-=1;}],
  ['invalid pivot',(m:EffectManifest)=>{m.effects.fire.pivot[1]=Infinity;}],
  ['invalid preview frame',(m:EffectManifest)=>{m.effects.fire.previewFrame=m.effects.fire.frames.length;}],
  ['timing mismatch',(m:EffectManifest)=>{m.effects.fire.durationMs+=20;}],
  ['oversized atlas',(m:EffectManifest)=>{m.effects.fire.width=10000;}],
 ] as const)it(`rejects ${name} before requesting images`,()=>{
  const m=manifest();change(m);expect(()=>validateCombatEffectManifest(m)).toThrow();
 });
 it('keeps frame boundaries and holds the last frame instead of repeating a burst',()=>{
  const a=manifest().effects.fire;
  expect(combatEffectFrame(a,-1)).toBe(0);
  expect(combatEffectFrame(a,a.frames[0].durationMs-.001)).toBe(0);
  expect(combatEffectFrame(a,a.frames[0].durationMs)).toBe(1);
  expect(combatEffectFrame(a,a.durationMs*3)).toBe(a.frames.length-1);
 });
 it('uses the visible preview frame for the whole reduced-motion interval',()=>{
  const a=manifest().effects.healing;
  expect(combatEffectFrame(a,0,true)).toBe(a.previewFrame);
  expect(combatEffectFrame(a,210,true)).toBe(a.previewFrame);
 });
});
