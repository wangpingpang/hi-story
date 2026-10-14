import { gridDistance, requireRuntime, runtimeId } from '../../contracts';
import { assertActorCanAct, attributeModifier, damageActor, runtimeActor, type ActorRuntime } from '../characters/index';
import { entity, hasLineOfSight, moveEntity, setEntitySolid, type WorldRuntime, type GridPoint } from '../world/index';
import { attackCheck, rollDice, type RandomState } from '../rules/index';
export interface CombatRuntime {
  id: string; status: 'active' | 'ended'; round: number; turnIndex: number;
  order: string[]; initiative: { actorId: string; natural: number; total: number }[];
  movesLeft: number; actionAvailable: boolean; winnerTeamId?: string; outcome?: 'victory' | 'draw';
}
export interface CombatFrame { combat: CombatRuntime; characters: ActorRuntime; world: WorldRuntime; random: RandomState }
export type CombatAction = { kind: 'move'; destination: GridPoint } | { kind: 'attack'; targetId: string } | { kind: 'end-turn' };
export function currentCombatActor(combat: CombatRuntime): string { return combat.order[combat.turnIndex]; }
function settle(frame: CombatFrame): void {
  const teams = new Set(frame.combat.order.map(id => runtimeActor(frame.characters, id)).filter(a => a.hp > 0).map(a => a.teamId));
  if (teams.size <= 1) {
    frame.combat.status = 'ended'; frame.combat.outcome = teams.size === 1 ? 'victory' : 'draw';
    frame.combat.winnerTeamId = [...teams][0]; frame.combat.movesLeft = 0; frame.combat.actionAvailable = false;
  }
}
export function startCombat(id: string, actorIds: string[], characters: ActorRuntime, world: WorldRuntime, random: RandomState): CombatFrame {
  runtimeId(id, '战斗编号');
  requireRuntime(Array.isArray(actorIds) && actorIds.length >= 2 && actorIds.length <= 100 && new Set(actorIds).size === actorIds.length, 'INVALID_INPUT', '战斗需要 2–100 个不同人物');
  const participants = actorIds.map(actorId => { const actor = runtimeActor(characters, actorId); entity(world, actorId); requireRuntime(actor.hp > 0, 'ACTOR_DEAD', '死亡人物不能参战'); return actor; });
  requireRuntime(new Set(participants.map(a => a.teamId)).size >= 2, 'INVALID_INPUT', '战斗至少需要两个队伍');
  let nextRandom = structuredClone(random);
  const initiative = participants.map(actor => {
    const roll = rollDice(nextRandom, { count: 1, sides: 20, bonus: attributeModifier(actor.attributes.dexterity) }); nextRandom = roll.random;
    return { actorId: actor.actorId, natural: roll.result.dice[0], total: roll.result.total };
  });
  // Equal initiative preserves the caller's participant order.
  initiative.sort((a, b) => b.total - a.total);
  const first = runtimeActor(characters, initiative[0].actorId);
  return { characters: structuredClone(characters), world: structuredClone(world), random: nextRandom,
    combat: { id, status: 'active', round: 1, turnIndex: 0, initiative, order: initiative.map(i => i.actorId), movesLeft: first.speed, actionAvailable: true } };
}
export function combatAction(frame: CombatFrame, actorId: string, action: CombatAction) {
  requireRuntime(frame.combat.status === 'active', 'COMBAT_ENDED', '战斗已经结束');
  requireRuntime(currentCombatActor(frame.combat) === actorId, 'WRONG_TURN', '尚未轮到此人物');
  const next = structuredClone(frame); const actor = runtimeActor(next.characters, actorId);
  requireRuntime(actor.hp > 0, 'ACTOR_DEAD', '死亡人物无法行动');
  if (action.kind === 'end-turn') {
    settle(next);
    if (next.combat.status === 'active') {
      do {
        next.combat.turnIndex++;
        if (next.combat.turnIndex === next.combat.order.length) { next.combat.turnIndex = 0; next.combat.round++; }
      } while (runtimeActor(next.characters, currentCombatActor(next.combat)).hp === 0);
      next.combat.movesLeft = runtimeActor(next.characters, currentCombatActor(next.combat)).speed;
      next.combat.actionAvailable = true;
    }
    return { ...next, report: { kind: 'turn.ended' as const, actorId } };
  }
  if (action.kind === 'move') {
    assertActorCanAct(actor, 'move'); requireRuntime(next.combat.movesLeft > 0, 'NO_MOVEMENT', '本回合移动力不足');
    next.world = moveEntity(next.world, actorId, action.destination); next.combat.movesLeft--;
    return { ...next, report: { kind: 'combat.moved' as const, actorId, destination: structuredClone(action.destination) } };
  }
  requireRuntime(action.kind === 'attack', 'INVALID_INPUT', '未知战斗行动'); assertActorCanAct(actor, 'attack');
  requireRuntime(next.combat.actionAvailable, 'NO_ACTION', '本回合已使用攻击行动');
  requireRuntime(next.combat.order.includes(action.targetId), 'INVALID_TARGET', '目标未参与当前战斗');
  const target = runtimeActor(next.characters, action.targetId);
  requireRuntime(target.hp > 0 && target.teamId !== actor.teamId, 'INVALID_TARGET', '不能攻击死亡目标或队友');
  const from = entity(next.world, actorId).position, to = entity(next.world, target.actorId).position;
  requireRuntime(gridDistance(from, to) <= actor.attackRange, 'OUT_OF_RANGE', '目标超出攻击距离');
  requireRuntime(hasLineOfSight(next.world, from, to), 'NOT_VISIBLE', '目标被遮挡');
  const hit = attackCheck(next.random, actor.attackBonus, target.armorClass); next.random = hit.random;
  let damage = 0, damageDice: number[] = [];
  if (hit.result.hit) {
    const roll = rollDice(next.random, { ...actor.damage, count: actor.damage.count * (hit.result.critical ? 2 : 1) });
    next.random = roll.random; damage = Math.max(1, roll.result.total); damageDice = roll.result.dice;
    next.characters = damageActor(next.characters, target.actorId, damage);
    if (runtimeActor(next.characters, target.actorId).hp === 0) next.world = setEntitySolid(next.world, target.actorId, false);
  }
  next.combat.actionAvailable = false; settle(next);
  return { ...next, report: { kind: 'combat.attacked' as const, actorId, targetId: target.actorId, ...hit.result, damage, damageDice, targetHp: runtimeActor(next.characters, target.actorId).hp } };
}
