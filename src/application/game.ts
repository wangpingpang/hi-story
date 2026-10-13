import { freeze, type Command, type Fact } from '../contracts';
import { choices, VERSION } from '../../content/fog-bridge';
import * as adventure from '../modules/adventure';
import * as characters from '../modules/characters';
import * as inventory from '../modules/inventory';
import * as objectives from '../modules/objectives';
import * as runtime from '../modules/story-runtime';
import * as npc from '../modules/npc';
import * as relations from '../modules/relations';
import * as personality from '../modules/personality';
import { MemoryStore } from '../infrastructure/memory-store';
function initial(runId:string){return {version:VERSION,adventure:adventure.start(runId),character:characters.create(),inventory:inventory.create(),objective:objectives.create(),npc:npc.create(),relations:relations.create(),facts:[] as Fact[],evidence:[] as personality.Evidence[],receipts:{} as Record<string,{fingerprint:string; revision:number}>};}
export type State=ReturnType<typeof initial>;
export type Result={ok:true; revision:number; duplicate:boolean}|{ok:false; reason:string};
export class Game {
 #store:MemoryStore<State>;
 constructor(private readonly createId:()=>string=()=>crypto.randomUUID(),private readonly beforeCommit?:(candidate:State)=>void){this.#store=new MemoryStore(initial(createId()));}
 query(){const s=this.#store.read();return freeze({...s,eventInstanceId:runtime.eventId(s.adventure.runId,s.adventure.stage),traits:personality.describe(s.evidence),choices:choices.filter(c=>c.stage===s.adventure.stage).map(c=>({...c,disabledReason:s.inventory.rope<c.rope?'缺少绳索：已在雾桥换取通行':s.inventory.coins<c.coins?'铜钱不足':null}))});}
 restart(){this.#store.commit(initial(this.createId()));return this.query();}
 execute(command:Command):Result {
  const s=this.#store.read();
  // Explicit field canonicalization: property order is irrelevant to idempotency.
  const fingerprint=JSON.stringify([command.runId,command.actorId,command.eventInstanceId,command.revision,command.choiceId]);
  if(!command.commandId||typeof command.commandId!=='string')return {ok:false,reason:'命令编号无效'};
  if(command.runId!==s.adventure.runId)return {ok:false,reason:'旧旅程命令已失效'};
  const receipt=Object.hasOwn(s.receipts,command.commandId)?s.receipts[command.commandId]:undefined;
  if(receipt)return receipt.fingerprint===fingerprint?{ok:true,duplicate:true,revision:receipt.revision}:{ok:false,reason:'同一命令编号不能更换内容'};
  if(command.actorId!==s.character.actorId)return {ok:false,reason:'角色不匹配'};
  if(s.adventure.stage==='ended')return {ok:false,reason:'本局已结束'};
  if(command.revision!==s.adventure.revision||command.eventInstanceId!==runtime.eventId(s.adventure.runId,s.adventure.stage))return {ok:false,reason:'场景已变化，请使用当前选项'};
  const c=choices.find(c=>c.id===command.choiceId&&c.stage===s.adventure.stage);
  if(!c)return {ok:false,reason:'当前场景没有这个选项'};
  try {
   s.inventory=inventory.consume(s.inventory,c,c.help);
   if(c.stage==='river'){s.npc=npc.observeRiver(c.help);if(c.help)s.relations=relations.acknowledgeHelp(s.relations);}
   s.evidence=personality.record(s.evidence,{scene:c.stage,choice:c.id,priority:c.evidence,text:c.fact});
   s.facts=runtime.append(s.facts,{eventId:command.eventInstanceId,runId:command.runId,sequence:s.adventure.revision+1,sourceCommandId:command.commandId,schemaVersion:1,stage:c.stage,choiceId:c.id,text:c.fact});
   s.adventure=adventure.advance(s.adventure,c.time);
   if(c.stage==='post')s.objective=objectives.complete(s.adventure.elapsed,c.id==='public'?s.character.name:null);
   Object.defineProperty(s.receipts,command.commandId,{value:{fingerprint,revision:s.adventure.revision},enumerable:true,writable:true,configurable:true});
   this.beforeCommit?.(structuredClone(s));
   this.#store.commit(s);
   return {ok:true,duplicate:false,revision:s.adventure.revision};
  }catch(error){return {ok:false,reason:error instanceof Error?error.message:'提交失败，本次未产生变化'};}
 }
}
export type View=ReturnType<Game['query']>;
