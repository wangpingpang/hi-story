import { freeze, type DeepReadonly } from '../../contracts';
import { validateTime, validateVitals, type Action, type VisualVitals } from './animation';
export const EXPRESSIONS = freeze({neutral:'平静',happy:'微笑',elated:'欣喜',sad:'失落',angry:'愤怒',fear:'恐惧',pain:'痛苦',focused:'专注',sleepy:'困倦',asleep:'闭眼',sick:'不适',surprised:'惊讶'});
export type Expression=keyof typeof EXPRESSIONS;
export const ENVIRONMENTS=['normal','safe','dark','cold','hot','danger'] as const;
export const ACTOR_STATUSES=['normal','tired','poisoned','frightened','angry'] as const;
export const DIALOGUE_TONES=['neutral','friendly','hostile','surprising'] as const;
export interface ExpressionSignals {
  environment?:typeof ENVIRONMENTS[number];status?:typeof ACTOR_STATUSES[number];dialogue?:typeof DIALOGUE_TONES[number];manual?:Expression;
  dice?:{value:number;sides:number;success:boolean;at:number};hit?:{at:number};
}
export interface ExpressionResult { expression:Expression; source:string; priority:number; reason:string; expiresAt?:number }
export function validateExpressionSignals(signals:DeepReadonly<ExpressionSignals>,now:number):void {
  validateTime(now);
  if(!signals||typeof signals!=='object'||Array.isArray(signals))throw Error('表情信号无效');
  if(signals.environment!==undefined&&!ENVIRONMENTS.includes(signals.environment)||signals.status!==undefined&&!ACTOR_STATUSES.includes(signals.status)||signals.dialogue!==undefined&&!DIALOGUE_TONES.includes(signals.dialogue)||signals.manual!==undefined&&!Object.hasOwn(EXPRESSIONS,signals.manual))throw Error('表情信号无效');
  const dice=signals.dice;
  if(dice){if(!Number.isInteger(dice.sides)||dice.sides<2||dice.sides>1000||!Number.isInteger(dice.value)||dice.value<1||dice.value>dice.sides||typeof dice.success!=='boolean')throw Error('骰子信号无效');validateTime(dice.at);if(dice.at>now)throw Error('骰子信号不能来自未来');}
  if(signals.hit){validateTime(signals.hit.at);if(signals.hit.at>now)throw Error('受击信号不能来自未来');}
}
export function resolveExpression(signals:DeepReadonly<ExpressionSignals>,vitals:DeepReadonly<VisualVitals>,action:Action,now:number):ExpressionResult {
  validateExpressionSignals(signals,now);validateVitals(vitals);
  const result=(expression:Expression,source:string,priority:number,reason:string,expiresAt?:number):ExpressionResult=>({expression,source,priority,reason,...(expiresAt===undefined?{}:{expiresAt})});
  if(vitals.dead)return result('asleep','life',100,'已收到明确死亡状态');
  if(vitals.hp===0)return result('pain','life',95,'倒地但未判定死亡');
  if(action==='sleep')return result('asleep','action',90,'正在睡觉');
  if(signals.hit&&now-signals.hit.at<900)return result('pain','hit',85,'近期受击',signals.hit.at+900);
  if(vitals.hp/vitals.maxHp<=.25)return result('pain','life',80,'生命不高于四分之一');
  if(signals.status==='poisoned')return result('sick','status',75,'中毒不适');
  if(signals.status==='frightened')return result('fear','status',70,'恐惧状态');
  if(signals.status==='angry')return result('angry','status',65,'愤怒状态');
  if(signals.dice&&now-signals.dice.at<1800){const d=signals.dice;return result(d.value===d.sides?'elated':d.value===1?'surprised':d.success?'happy':'sad','dice',60,'检定结果反馈',d.at+1800);}
  if(signals.manual)return result(signals.manual,'manual',50,'预览指定表情');
  if(vitals.inCombat||['attack','heavy-attack','cast','block','dodge','combat-ready'].includes(action))return result('focused','combat',45,'战斗专注');
  if(signals.dialogue&&signals.dialogue!=='neutral')return result(({friendly:'happy',hostile:'angry',surprising:'surprised'} as const)[signals.dialogue],'dialogue',40,'对话语气');
  if(signals.status==='tired')return result('sleepy','status',35,'疲惫');
  const environment=signals.environment??'normal';
  return result(({normal:'neutral',safe:'happy',dark:'fear',cold:'sick',hot:'sick',danger:'fear'} as const)[environment],'environment',20,'当前环境');
}
