import { describe, expect, it } from 'vitest';
import { assertActorCanAct, attributeModifier, damageActor, generateCharacterWithParams, healActor, registerActor, runtimeActor, setActorStatus, type ActorRuntime, type ActorRuntimeOptions } from '../src/modules/characters/index';
import { abilityCheck, attackCheck, createRandomState, rollDice } from '../src/modules/rules/index';
import { createWorld, entity, placeEntity } from '../src/modules/world/index';
import { combatAction, currentCombatActor, startCombat, type CombatFrame } from '../src/modules/combat/index';
const source = (id: string) => ({ actorId: id, name: id, control: 'npc' as const });
function roster(overrides: ActorRuntimeOptions = {}): ActorRuntime {
  let state = registerActor({ actors: [] }, source('a'), { teamId: 'a', ...overrides });
  return registerActor(state, source('b'), { teamId: 'b', ...overrides });
}
function frame(overrides: ActorRuntimeOptions = {}): CombatFrame {
  let world = createWorld({ id: 'arena', width: 6, height: 5, spawn: { x: 1, y: 2 }, blocked: [], locations: [] });
  world = placeEntity(world, 'a', { x: 1, y: 2 }); world = placeEntity(world, 'b', { x: 2, y: 2 });
  return startCombat('fight', ['a','b'], roster(overrides), world, createRandomState('battle'));
}
const stateWithNatural = (natural: number) => {
  for (let i = 0; i < 1000; i++) { const state = createRandomState(`natural-${i}`); if (rollDice(state, { count: 1, sides: 20 }).result.dice[0] === natural) return state; }
  throw Error('test seed unavailable');
};
describe('arbitrary character runtime', () => {
  it('registers actual generator output without changing profile or coupling personality to combat', () => {
    const generated = generateCharacterWithParams({ seed: 'runtime-person', personality: { traits: ['谨慎'], parameters: { caution: 0.8 } } });
    const before = structuredClone(generated); const r = registerActor({ actors: [] }, generated);
    expect(r.actors[0]).toMatchObject({ actorId: generated.actorId, maxHp: 10, hp: 10, speed: 3, armorClass: 10 });
    expect(generated).toEqual(before); expect(r.actors[0].attributes.strength).toBe(10);
  });
  it('derives stats, caps damage/heal and forbids ordinary resurrection', () => {
    let r = roster({ attributes: { strength: 16, dexterity: 14, constitution: 12 } });
    expect(r.actors[0]).toMatchObject({ maxHp: 11, armorClass: 12, attackBonus: 3, damage: { bonus: 3 } });
    r = damageActor(r, 'a', 4); expect(runtimeActor(r, 'a').hp).toBe(7);
    r = healActor(r, 'a', 100); expect(runtimeActor(r, 'a').hp).toBe(11);
    r = damageActor(r, 'a', 100); expect(runtimeActor(r, 'a').hp).toBe(0); expect(() => healActor(r, 'a', 2)).toThrow();
  });
  it.each([{ maxHp: 0 }, { hp: 99 }, { speed: -1 }, { armorClass: NaN }, { attributes: { strength: 31 } }, { damage: { count: 1, sides: 1, bonus: 0 } }])('rejects invalid stats %j', options => expect(() => roster(options)).toThrow());
  it('rejects duplicate ID and applies explicit status restrictions', () => {
    const r = roster(); expect(() => registerActor(r, source('a'))).toThrow();
    const rooted = setActorStatus(r, 'a', 'rooted', true);
    expect(() => assertActorCanAct(runtimeActor(rooted, 'a'), 'move')).toThrow();
    expect(() => assertActorCanAct(runtimeActor(rooted, 'a'), 'attack')).not.toThrow();
    expect(() => assertActorCanAct(runtimeActor(setActorStatus(r, 'a', 'stunned', true), 'a'), 'check')).toThrow();
    expect(runtimeActor(r, 'a').statuses).toEqual([]);
    expect(attributeModifier(9)).toBe(-1); expect(attributeModifier(15)).toBe(2);
  });
});
describe('serialized deterministic dice', () => {
  it('same seed/spec repeats, sequential dice differ, input state is unchanged', () => {
    const state = createRandomState('dice'), before = structuredClone(state), spec = { count: 10, sides: 6, bonus: 2 };
    const a = rollDice(state, spec); expect(a).toEqual(rollDice(state, spec)); expect(state).toEqual(before);
    expect(rollDice(a.random, spec)).not.toEqual(a); expect(a.result.dice.every(d => d >= 1 && d <= 6)).toBe(true);
    expect(a.result.total).toBe(a.result.dice.reduce((a, b) => a + b, 2));
  });
  it('advantage/disadvantage select respectively max/min and equality meets DC', () => {
    const state = createRandomState('adv'); const a = abilityCheck(state, 2, 10, 'advantage'), d = abilityCheck(state, 2, 10, 'disadvantage');
    expect(a.result.dice).toEqual(d.result.dice); expect(a.result.natural).toBe(Math.max(...a.result.dice)); expect(d.result.natural).toBe(Math.min(...d.result.dice));
    const normal = abilityCheck(state, 2, 10); expect(abilityCheck(state, 2, normal.result.total).result.success).toBe(true);
  });
  it('ability 1/20 are ordinary rolls; attacks 1/20 automatically miss/hit', () => {
    const one = stateWithNatural(1), twenty = stateWithNatural(20);
    expect(abilityCheck(one, 100, 10).result.success).toBe(true); expect(abilityCheck(twenty, 0, 30).result.success).toBe(false);
    expect(attackCheck(one, 100, 10).result.hit).toBe(false); expect(attackCheck(twenty, -100, 100).result).toMatchObject({ hit: true, critical: true });
  });
});
describe('minimal tactical battle', () => {
  it('requires living distinct participants and opposing teams', () => {
    const f = frame(); expect(() => startCombat('x', ['a','a'], f.characters, f.world, f.random)).toThrow();
    expect(() => startCombat('x', ['a','b'], damageActor(f.characters, 'b', 999), f.world, f.random)).toThrow();
    const sameTeam = registerActor(registerActor({ actors: [] }, source('a')), source('b'));
    expect(() => startCombat('x', ['a','b'], sameTeam, f.world, f.random)).toThrow();
  });
  it('wrong-turn and invalid attacks consume no HP, action or RNG', () => {
    const f = frame(), before = structuredClone(f), current = currentCombatActor(f.combat), other = current === 'a' ? 'b' : 'a';
    expect(() => combatAction(f, other, { kind: 'attack', targetId: current })).toThrow();
    expect(() => combatAction(f, current, { kind: 'attack', targetId: current })).toThrow();
    expect(() => combatAction(f, current, { kind: 'attack', targetId: 'unknown' })).toThrow(); expect(f).toEqual(before);
  });
  it('moves spend one point, attacks spend one action, end-turn resets budgets and advances rounds', () => {
    let f = frame({ speed: 1 }); const current = currentCombatActor(f.combat), target = current === 'a' ? 'b' : 'a';
    const p = entity(f.world, current).position;
    f = combatAction(f, current, { kind: 'move', destination: { x: p.x, y: p.y + 1 } });
    expect(f.combat.movesLeft).toBe(0); expect(() => combatAction(f, current, { kind: 'move', destination: p })).toThrow();
    expect(() => combatAction(f, current, { kind: 'attack', targetId: target })).toThrow(); // now out of range
    f = combatAction(f, current, { kind: 'end-turn' }); const other = currentCombatActor(f.combat);
    expect(other).toBe(target); expect(f.combat.movesLeft).toBe(1); expect(f.combat.actionAvailable).toBe(true);
    f = combatAction(f, other, { kind: 'end-turn' }); expect(f.combat.round).toBe(2);
  });
  it('miss consumes action, while a critical doubles dice only and publishes victory immediately', () => {
    let f = frame({ maxHp: 100, damage: { count: 1, sides: 6, bonus: 3 } }); const current = currentCombatActor(f.combat), target = current === 'a' ? 'b' : 'a';
    f.random = stateWithNatural(1); const missed = combatAction(f, current, { kind: 'attack', targetId: target });
    expect(missed.report).toMatchObject({ hit: false, damage: 0 }); expect(missed.combat.actionAvailable).toBe(false);
    expect(() => combatAction(missed, current, { kind: 'attack', targetId: target })).toThrow();
    f.random = stateWithNatural(20); f.characters = damageActor(f.characters, target, 99);
    const killed = combatAction(f, current, { kind: 'attack', targetId: target });
    expect(killed.report.kind).toBe('combat.attacked');
    if (killed.report.kind === 'combat.attacked') {
      expect(killed.report.damageDice).toHaveLength(2); expect(killed.report.damage).toBe(killed.report.damageDice.reduce((a,b) => a+b, 3));
    }
    expect(killed.combat).toMatchObject({ status: 'ended', winnerTeamId: current, outcome: 'victory' });
    expect(runtimeActor(killed.characters, target).hp).toBe(0); expect(entity(killed.world, target).solid).toBe(false);
    expect(() => combatAction(killed, current, { kind: 'end-turn' })).toThrow();
  });
  it('stunned participant can end its turn; rooted participant can attack', () => {
    let f = frame(); const current = currentCombatActor(f.combat), target = current === 'a' ? 'b' : 'a';
    f.characters = setActorStatus(f.characters, current, 'stunned', true);
    expect(() => combatAction(f, current, { kind: 'attack', targetId: target })).toThrow();
    expect(() => combatAction(f, current, { kind: 'end-turn' })).not.toThrow();
    f.characters = setActorStatus(setActorStatus(f.characters, current, 'stunned', false), current, 'rooted', true);
    expect(() => combatAction(f, current, { kind: 'attack', targetId: target })).not.toThrow();
  });
  it('ranged attacks cannot hit through walls and cost no roll when rejected', () => {
    let w = createWorld({ id: 'wall', width: 5, height: 1, spawn: { x: 0, y: 0 }, blocked: [{ x: 1, y: 0 }], locations: [] });
    w = placeEntity(w, 'a', { x: 0, y: 0 }); w = placeEntity(w, 'b', { x: 2, y: 0 });
    const f = startCombat('ranged', ['a','b'], roster({ attackRange: 4 }), w, createRandomState('range'));
    const before = structuredClone(f), current = currentCombatActor(f.combat);
    expect(() => combatAction(f, current, { kind: 'attack', targetId: current === 'a' ? 'b' : 'a' })).toThrow();
    expect(f).toEqual(before);
  });
  it('skips dead participants while at least two teams remain', () => {
    let f = frame(); f.characters = registerActor(f.characters, source('c'), { teamId: 'c' }); f.world = placeEntity(f.world, 'c', { x: 3, y: 2 });
    f = startCombat('three', ['a','b','c'], f.characters, f.world, f.random);
    const current = currentCombatActor(f.combat), nextId = f.combat.order[(f.combat.turnIndex + 1) % 3];
    f.characters = damageActor(f.characters, nextId, 999);
    const advanced = combatAction(f, current, { kind: 'end-turn' });
    expect(advanced.combat.status).toBe('active'); expect(currentCombatActor(advanced.combat)).not.toBe(nextId);
  });
});
