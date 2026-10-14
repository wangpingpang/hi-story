import { describe, expect, it } from 'vitest';
import { RuntimeSession, type RuntimeAction, type RuntimeCommand, type RuntimeConfig } from '../src/application/index';
import { createRandomState, rollDice } from '../src/modules/rules/index';
const config = (): RuntimeConfig => ({ seed: 'session', visionRadius: 4,
  map: { id: 'test', width: 5, height: 5, blocked: [{ x: 1, y: 1 }], spawn: { x: 0, y: 2 }, locations: [{ id: 'gate', cells: [{ x: 1, y: 2 }] }] },
  actors: [{ source: { actorId: 'player', name: '旅人', control: 'player' } },
    { source: { actorId: 'enemy', name: '守路人', control: 'npc' }, position: { x: 2, y: 2 }, options: { teamId: 'enemy', maxHp: 1 } }] });
let run = 0, cmd = 0;
function create(hook?: ConstructorParameters<typeof RuntimeSession>[2]) { return new RuntimeSession(config(), () => `run-${++run}`, hook); }
function command(s: RuntimeSession, action: RuntimeAction, actorId = 'player', commandId = `cmd-${++cmd}`): RuntimeCommand {
  const v = s.query(); return { commandId, runId: v.runId, actorId, expectedRevision: v.revision, action };
}
function act(s: RuntimeSession, action: RuntimeAction, actorId = 'player') { const result = s.dispatch(command(s, action, actorId)); expect(result.ok).toBe(true); return result; }
describe('atomic runtime composition', () => {
  it('movement emits distinct committed trigger signals, retries never duplicate them', () => {
    const s = create(), c = command(s, { type: 'world.move', destination: { x: 1, y: 2 } }, 'player', '__proto__');
    const result = s.dispatch(c); expect(result).toMatchObject({ ok: true, revision: 1, duplicate: false, signals: [{ kind: 'location.entered', locationId: 'gate' }] });
    const before = s.query(); expect(s.dispatch(c)).toMatchObject({ ok: true, duplicate: true }); expect(s.query()).toEqual(before);
    expect(s.dispatch({ ...c, action: { type: 'world.interact', targetId: 'enemy' } })).toMatchObject({ ok: false, code: 'COMMAND_ID_CONFLICT' });
  });
  it('canonical fingerprints ignore object property order and normalize default check mode', () => {
    const s = create(), c = command(s, { type: 'rules.check', attribute: 'wisdom', difficulty: 10 }); s.dispatch(c);
    expect(s.dispatch({ ...c, action: { difficulty: 10, type: 'rules.check', mode: 'normal', attribute: 'wisdom' } })).toMatchObject({ ok: true, duplicate: true });
  });
  it('bad movement leaves every slice unchanged; valid interaction emits request only', () => {
    const s = create(); act(s, { type: 'world.move', destination: { x: 1, y: 2 } }); const before = s.query();
    expect(s.dispatch(command(s, { type: 'world.move', destination: { x: 1, y: 1 } }))).toMatchObject({ ok: false, code: 'BLOCKED' }); expect(s.query()).toEqual(before);
    act(s, { type: 'world.interact', targetId: 'enemy' }); expect(s.query().signals.at(-1)).toMatchObject({ kind: 'interaction.requested', targetId: 'enemy' });
  });
  it('commit fault after a roll preserves RNG, receipts, revision and effects, then retry repeats the roll', () => {
    let fail = true; const s = create(() => { if (fail) throw Error('injected'); }); const before = s.query(), c = command(s, { type: 'rules.check', attribute: 'strength', difficulty: 12 });
    expect(s.dispatch(c)).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' }); expect(s.query()).toEqual(before);
    fail = false; const result = s.dispatch(c); expect(result.ok).toBe(true);
    expect(result.ok && result.report).toMatchObject({ natural: rollDice(before.random, { count: 1, sides: 20 }).result.dice[0] });
  });
  it('combat damage and victory also roll back together on commit fault', () => {
    let fail = false; const s = create(() => { if (fail) throw Error('injected'); });
    act(s, { type: 'world.move', destination: { x: 1, y: 2 } }); act(s, { type: 'combat.start', combatId: 'f', actorIds: ['player','enemy'] });
    // Iterate turns until a valid hit is ready; each attempt is independently copied.
    for (let i = 0; i < 100 && s.query().combat?.status === 'active'; i++) {
      const battle = s.query().combat!, actorId = battle.order[battle.turnIndex], targetId = actorId === 'player' ? 'enemy' : 'player';
      const c = command(s, { type: 'combat.attack', targetId }, actorId), before = s.query(); fail = true;
      expect(s.dispatch(c)).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' }); expect(s.query()).toEqual(before);
      fail = false; expect(s.dispatch(c).ok).toBe(true);
      if (s.query().combat?.status === 'active') act(s, { type: 'combat.end-turn' }, actorId);
    }
    expect(s.query().combat?.status).toBe('ended'); expect(s.query().signals.filter(x => x.kind === 'combat.ended')).toHaveLength(1);
  });
  it('rejects old revisions, old runs, unknown types and extra fields', () => {
    const s = create(); const stale = command(s, { type: 'rules.check', attribute: 'strength', difficulty: 1 });
    act(s, { type: 'world.move', destination: { x: 1, y: 2 } }); expect(s.dispatch(stale)).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
    expect(s.dispatch({ ...stale, runId: 'old' })).toMatchObject({ ok: false, code: 'RUN_MISMATCH' });
    const before = s.query();
    expect(s.dispatch({ ...command(s, { type: 'combat.end-turn' }), action: { type: 'unknown' } } as unknown as RuntimeCommand)).toMatchObject({ ok: false, code: 'UNKNOWN_COMMAND' });
    expect(s.dispatch({ ...command(s, { type: 'world.move', destination: { x: 1, y: 3 } }), injected: true } as RuntimeCommand)).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
    expect(s.query()).toEqual(before);
  });
  it('NPC cannot make exploration commands, even for a previously used command ID', () => {
    const s = create(); const c = command(s, { type: 'rules.check', attribute: 'strength', difficulty: 1 }); s.dispatch(c);
    expect(s.dispatch({ ...c, actorId: 'enemy' })).toMatchObject({ ok: false, code: 'ACTOR_MISMATCH' });
  });
  it('active combat blocks exploration/check/another fight and wrong-turn commands', () => {
    const s = create(); act(s, { type: 'combat.start', combatId: 'f', actorIds: ['player','enemy'] }); const before = s.query();
    expect(s.dispatch(command(s, { type: 'world.move', destination: { x: 1, y: 2 } }))).toMatchObject({ ok: false, code: 'COMBAT_ACTIVE' });
    expect(s.dispatch(command(s, { type: 'rules.check', attribute: 'strength', difficulty: 1 }))).toMatchObject({ ok: false, code: 'COMBAT_ACTIVE' });
    const current = before.combat!.order[before.combat!.turnIndex];
    expect(s.dispatch(command(s, { type: 'combat.end-turn' }, current === 'player' ? 'enemy' : 'player'))).toMatchObject({ ok: false, code: 'WRONG_TURN' }); expect(s.query()).toEqual(before);
  });
  it('combat movement uses exploration and emits the same location triggers', () => {
    const s = create(); act(s, { type: 'combat.start', combatId: 'f', actorIds: ['player','enemy'] });
    const combat = s.query().combat!; if (combat.order[combat.turnIndex] !== 'player') act(s, { type: 'combat.end-turn' }, 'enemy');
    const result = act(s, { type: 'combat.move', destination: { x: 1, y: 2 } });
    expect(result).toMatchObject({ signals: [{ kind: 'location.entered', locationId: 'gate' }] });
  });
  it('restart resets HP, position, fog, battle, RNG and receipts; old callbacks are refused', () => {
    const s = create(); const initial = s.query(), old = command(s, { type: 'world.move', destination: { x: 1, y: 2 } }); s.dispatch(old);
    act(s, { type: 'combat.start', combatId: 'f', actorIds: ['player','enemy'] }); const next = s.restart();
    expect(next.runId).not.toBe(initial.runId); expect(next.revision).toBe(0); expect(next.world).toEqual(initial.world);
    expect(next.exploration).toEqual(initial.exploration); expect(next.characters).toEqual(initial.characters); expect(next.random).toEqual(initial.random);
    expect(next.combat).toBeUndefined(); expect(next.receipts).toEqual([]); expect(s.dispatch(old)).toMatchObject({ ok: false, code: 'RUN_MISMATCH' });
  });
  it('failed restart keeps current run intact, duplicate run ID is refused', () => {
    let fail = false; const s = create(() => { if (fail) throw Error('restart-fault'); }); act(s, { type: 'rules.check', attribute: 'strength', difficulty: 1 }); const before = s.query();
    fail = true; expect(() => s.restart()).toThrow(); expect(s.query()).toEqual(before);
    const same = new RuntimeSession(config(), () => 'same'); expect(() => same.restart()).toThrow();
  });
  it('query is deeply frozen; original config and returned results cannot corrupt authority', () => {
    const input = config(), s = new RuntimeSession(input, () => `run-${++run}`); input.map.blocked.length = 0;
    const q = s.query(); expect(() => { (q.world.entities as unknown[]).push({}); }).toThrow(); expect(q.world.map.blocked).toHaveLength(1);
    const result = act(s, { type: 'world.move', destination: { x: 1, y: 2 } });
    if (result.ok) result.signals[0].locationId = 'corrupt'; expect(s.query().signals.at(-1)?.locationId).toBe('gate');
  });
  it('initialize requires exactly one living player and rejects invalid registration/placement', () => {
    const missing = config(); missing.actors = missing.actors.filter(a => a.source.control === 'npc'); expect(() => new RuntimeSession(missing)).toThrow();
    const collision = config(); collision.actors[1].position = collision.map.spawn; expect(() => new RuntimeSession(collision)).toThrow();
    expect(createRandomState('session:runtime')).toEqual(create().query().random);
  });
});
