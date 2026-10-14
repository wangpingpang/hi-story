import { requireRuntime, runtimeId, runtimeInteger } from '../../contracts';
export interface RandomState { version: 'runtime-rng/1'; value: number }
export interface DiceSpec { count: number; sides: number; bonus?: number }
export interface DiceResult { dice: number[]; bonus: number; total: number }
export function createRandomState(seed: string): RandomState {
  runtimeId(seed, '骰子种子'); let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619) >>> 0;
  return { version: 'runtime-rng/1', value };
}
export function rollDice(state: RandomState, spec: DiceSpec): { random: RandomState; result: DiceResult } {
  requireRuntime(state.version === 'runtime-rng/1', 'INVALID_INPUT', '随机算法版本无效'); runtimeInteger(state.value, 0, 0xffffffff, '随机状态');
  runtimeInteger(spec.count, 1, 200, '骰子个数'); runtimeInteger(spec.sides, 2, 1000, '骰子面数'); runtimeInteger(spec.bonus ?? 0, -1000, 1000, '骰子加值');
  let value = state.value; const dice: number[] = [];
  for (let i = 0; i < spec.count; i++) {
    value = (value + 0x6d2b79f5) >>> 0; let x = value;
    x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    dice.push(1 + Math.floor(((x ^ (x >>> 14)) >>> 0) / 4294967296 * spec.sides));
  }
  const bonus = spec.bonus ?? 0;
  return { random: { ...state, value }, result: { dice, bonus, total: dice.reduce((a, b) => a + b, bonus) } };
}
/** Ordinary ability checks have no automatic success/failure on natural 20/1. */
export function abilityCheck(state: RandomState, modifier: number, difficulty: number, mode: 'normal' | 'advantage' | 'disadvantage' = 'normal') {
  runtimeInteger(modifier, -1000, 1000, '检定加值'); runtimeInteger(difficulty, 0, 1000, '难度');
  requireRuntime(['normal', 'advantage', 'disadvantage'].includes(mode), 'INVALID_INPUT', '检定模式无效');
  const roll = rollDice(state, { count: mode === 'normal' ? 1 : 2, sides: 20 });
  const natural = mode === 'advantage' ? Math.max(...roll.result.dice) : mode === 'disadvantage' ? Math.min(...roll.result.dice) : roll.result.dice[0];
  return { random: roll.random, result: { dice: roll.result.dice, natural, modifier, total: natural + modifier, difficulty, success: natural + modifier >= difficulty } };
}
export function attackCheck(state: RandomState, bonus: number, armorClass: number) {
  runtimeInteger(bonus, -1000, 1000, '命中加值'); runtimeInteger(armorClass, 1, 1000, '护甲');
  const roll = rollDice(state, { count: 1, sides: 20, bonus }); const natural = roll.result.dice[0];
  return { random: roll.random, result: { ...roll.result, natural, hit: natural === 20 || (natural !== 1 && roll.result.total >= armorClass), critical: natural === 20 } };
}
