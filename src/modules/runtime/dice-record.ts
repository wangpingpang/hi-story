import type {DiceRollRecord} from '../../contracts/adventure';
import type {TacticalBattle} from './adventure';
export function recordRoll(b:TacticalBattle,roll:Omit<DiceRollRecord,'id'|'sequence'>):void {
 b.rollSequence=(b.rollSequence??0)+1;b.rolls??=[];
 b.rolls.push({...roll,id:`${b.id}:roll:${b.rollSequence}`,sequence:b.rollSequence});b.rolls=b.rolls.slice(-60);
}
