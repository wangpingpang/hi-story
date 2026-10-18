import type {DeepReadonly} from '../contracts';
import type {DemoCommand} from './game-application';
import type {AdventureSnapshot} from './adventure-application';
import {getProfessionSkill} from '../modules/professions';
import {canonical} from '../contracts/demo';

export const COMBAT_EFFECTS_VERSION='combat-effects/1' as const;
export type CombatEffectKind='fire'|'ice'|'lightning'|'wind'|'arcane'|'healing';
export interface CombatEffect {id:string;kind:CombatEffectKind;actorId:string;targetId:string;outcome:'hit'|'miss'|'saved'|'healing';from:{x:number;y:number};to:{x:number;y:number}}
type Snapshot=DeepReadonly<AdventureSnapshot>;
/** Called only after a successful commit. Uses recorded outcomes, never predicts hits. */
export function collectCombatEffects(before:Snapshot,after:Snapshot,command:DemoCommand):CombatEffect[]{
 const b=after.runtime.encounter,old=before.runtime.encounter;
 if(before.runId!==after.runId||before.adventureId!==after.adventureId||after.revision!==before.revision+1||command.runId!==before.runId||command.actorId!==after.playerActorId||command.expectedRevision!==before.revision||after.receipts[command.commandId]?.fingerprint!==canonical(command)||!b||b.status==='fled')return [];
 const sequence=old?.id===b.id?old.rollSequence??0:0,rolls=b.rolls?.filter(r=>r.sequence>sequence)??[];
 let chosen:CombatEffectKind|undefined;
 if(command.type==='profession.skill'&&typeof command.payload.skillId==='string'){
  const e=getProfessionSkill(command.payload.skillId).execution;
  chosen=e?.kind==='heal'?'healing':({fire:'fire',cold:'ice',lightning:'lightning',wind:'wind',force:'arcane',radiant:'arcane'} as Record<string,CombatEffectKind>)[e?.damageType??''];
 }
 const out:CombatEffect[]=[];
 for(const r of rolls){
  if(!(r.visual==='spell'&&(r.kind==='attack'||r.kind==='save')||r.kind==='healing'))continue;
  const actorId=r.kind==='save'?r.targetId:r.actorId,targetId=r.kind==='save'?r.actorId:r.targetId;if(!actorId||!targetId)continue;
  const from=b.participants.find(p=>p.actorId===actorId)?.position,to=b.participants.find(p=>p.actorId===targetId)?.position;if(!from||!to)continue;
  const kind=actorId===after.playerActorId&&chosen?chosen:r.kind==='healing'?'healing':'arcane';
  out.push({id:r.id,kind,actorId,targetId,outcome:r.kind==='healing'?'healing':r.kind==='save'?r.success?'saved':'hit':r.success?'hit':'miss',from:{...from},to:{...to}});
 }
 return out;
}
