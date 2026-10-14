import { freeze, type DeepReadonly } from '../contracts';
import { GameError, requireValue, record, canonical, seedHash } from '../contracts/demo';
import { initializeStory, createStoryRegistry, createStoryMapRequest, processPlayerAction, receiveWorldChange, storyOptions, type World, type CombatRequest } from '../modules/story-planning';
import { generateCharacterWithParams } from '../modules/characters';
import { generateMap, type MapGenerationResult, type MapGenerationRequest } from '../modules/world';
import { createTaskGenerator } from '../modules/quest-generation';
import { createRuntime, validateRuntime, moveRuntime, startBattle, battleAction, getAnchorPosition, type RuntimeState } from '../modules/runtime';
import { createThings, reconcileThings, projectStory, bindEvents, settleEvent, type ThingsState, type BoundEvent } from '../modules/things';
export interface DemoCommand {
  commandId:string; runId:string; actorId:string; expectedRevision:number;
  type:string; payload:Record<string,unknown>;
}
export interface CommandReceipt { fingerprint:string; revision:number; commandId:string }
export interface RunSnapshot {
  schemaVersion:1; runId:string; seed:string; revision:number;
  status:'active'|'waiting-result'|'ended'; playerActorId:string;
  versions:{contracts:string;map:string;story:string};
  story:World; runtime:RuntimeState; things:ThingsState;
  pending?:{request:CombatRequest;event:BoundEvent};
  receipts:Record<string,CommandReceipt>;
}
export interface DemoView { initialized:boolean; busy:boolean; snapshot?:RunSnapshot; events:BoundEvent[] }
export type OperationResult<T>={ok:true;value:T;duplicate?:boolean}|{ok:false;error:{code:string;message:string}};
export interface GameApplicationPorts {
  createMap?:(request:MapGenerationRequest)=>MapGenerationResult|Promise<MapGenerationResult>;
  beforeCommit?:(snapshot:DeepReadonly<RunSnapshot>)=>void|Promise<void>;
}
type Handler=(candidate:RunSnapshot,payload:Record<string,unknown>,command:DemoCommand)=>void;
function failure(error:unknown):OperationResult<never>{return {ok:false,error:{code:error instanceof GameError?error.code:'DOMAIN_REJECTED',message:error instanceof Error?error.message:'操作未完成。'}};}
function commandFrom(input:unknown):DemoCommand {
  const c=record(input,['commandId','runId','actorId','expectedRevision','type','payload']);
  for(const k of ['commandId','runId','actorId','type'])requireValue(typeof c[k]==='string'&&(c[k] as string).trim()&&(c[k] as string).length<=512,'INVALID_COMMAND','操作身份与类型必须有效。');
  requireValue(Number.isSafeInteger(c.expectedRevision)&&(c.expectedRevision as number)>=0,'INVALID_COMMAND','操作版本无效。');
  record(c.payload,Object.keys((c.payload??{}) as object));canonical(c);
  return structuredClone(c) as unknown as DemoCommand;
}
export class GameApplication {
  private current?:RunSnapshot;
  private registry=createStoryRegistry();
  private taskGenerator=createTaskGenerator();
  private handlers=new Map<string,Handler>();
  private tail:Promise<unknown>=Promise.resolve();
  private epoch=0;private stopped=false;private busy=false;
  private listeners=new Set<()=>void>();
  constructor(private ports:GameApplicationPorts={}) {
    this.handlers.set('world.move',(s,p,c)=>{
      record(p,['x','y']);requireValue(Number.isInteger(p.x)&&Number.isInteger(p.y),'INVALID_COMMAND','移动坐标必须是整数。');
      s.runtime=moveRuntime(s.runtime,{x:p.x as number,y:p.y as number});
      const actor=s.runtime.actors[s.playerActorId],regionId=s.runtime.map.cells[actor.position.y][actor.position.x].regionId;
      const region=s.runtime.map.regions.find(r=>r.id===regionId);
      const atTarget=actor.position.x===getAnchorPosition(s.runtime,'goal').x&&actor.position.y===getAnchorPosition(s.runtime,'goal').y;
      const location=region?.environmentRef??'旅途中';
      if(s.story.location!==location||s.story.targetReached!==atTarget)
        s.story=receiveWorldChange(s.story,`${c.commandId}:location`,{kind:'player-location',location,atTarget},this.registry);
      s.story=receiveWorldChange(s.story,`${c.commandId}:time`,{kind:'time',hours:0.1},this.registry);
    });
    this.handlers.set('event.choose',(s,p,c)=>{
      record(p,['eventInstanceId','optionId']);requireValue(typeof p.eventInstanceId==='string'&&typeof p.optionId==='string','INVALID_COMMAND','事件参数无效。');
      const event=bindEvents(s.runId,storyOptions(s.story,this.registry),s.things,s.runtime).find(e=>e.eventInstanceId===p.eventInstanceId&&e.optionId===p.optionId);
      requireValue(event,'OPTION_UNAVAILABLE','事件已变化，请重新选择。');requireValue(event.allowed,'OUT_OF_RANGE',event.reason);
      const result=processPlayerAction(s.story,{id:c.commandId,revision:s.story.revision,rulesRevision:this.registry.revision,optionId:event.optionId},this.registry);
      s.story=result.world;
      if(result.request){
        requireValue(event.targetActorId,'INVALID_BINDING','战斗对象缺少运行人物。');
        s.runtime=startBattle(s.runtime,event.targetActorId,`${s.runId}:combat:${c.commandId}`,s.seed);
        s.pending={request:result.request,event};s.status='waiting-result';
      }else s.things=settleEvent(s.things,event);
    });
    this.handlers.set('combat.action',(s,p,c)=>{
      record(p,['action','x','y']);requireValue(['attack','defend','move','flee'].includes(String(p.action)),'INVALID_COMMAND','战斗操作无效。');
      if(p.action==='move')requireValue(Number.isInteger(p.x)&&Number.isInteger(p.y),'INVALID_COMMAND','战斗坐标必须为整数。');
      else requireValue(p.x===undefined&&p.y===undefined,'INVALID_COMMAND','该战斗操作不接收坐标。');
      requireValue(s.pending&&s.runtime.battle,'NO_BATTLE','当前没有待完成的战斗。');
      requireValue(s.pending.request.revision===s.story.revision&&s.pending.request.rulesRevision===this.registry.revision,'RESULT_MISMATCH','战斗关联版本已失效。');
      s.runtime=battleAction(s.runtime,p.action as 'attack'|'defend'|'move'|'flee',p.action==='move'?{x:p.x as number,y:p.y as number}:undefined);
      const battle=s.runtime.battle!;
      if(battle.status==='active')return;
      const pending=s.pending;
      if(battle.status==='victory')s.story=receiveWorldChange(s.story,`${c.commandId}:death`,{kind:'npc-death',npcId:pending.request.targetId},this.registry);
      if(battle.status==='defeat')s.story=receiveWorldChange(s.story,`${c.commandId}:defeat`,{kind:'player-defeat'},this.registry);
      s.story=receiveWorldChange(s.story,`${c.commandId}:time`,{kind:'time',hours:pending.request.cost},this.registry);
      s.things=settleEvent(s.things,pending.event);s.pending=undefined;s.status='active';
    });
  }
  query():DeepReadonly<DemoView> {
    const snapshot=this.current?structuredClone(this.current):undefined;
    return freeze({initialized:Boolean(snapshot),busy:this.busy,snapshot,events:snapshot&&!snapshot.pending?bindEvents(snapshot.runId,storyOptions(snapshot.story,this.registry),snapshot.things,snapshot.runtime):[]});
  }
  subscribe(listener:()=>void):()=>void {this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  private notify():void {for(const listener of this.listeners)try{listener();}catch{/* State is already committed. A renderer cannot roll it back. */}}
  private enqueue<T>(operation:()=>Promise<OperationResult<T>>):Promise<OperationResult<T>> {
    const promise=this.tail.then(operation);this.tail=promise.then(()=>undefined,()=>undefined);return promise;
  }
  private validEpoch(epoch:number):void {requireValue(!this.stopped,'DISPOSED','运行实例已关闭。');requireValue(epoch===this.epoch,'RUN_MISMATCH','操作已被重新开始取消。');}
  async initialize(options:{seed:string}):Promise<OperationResult<DeepReadonly<DemoView>>> {
    const epoch=this.epoch;
    return this.enqueue(async()=>{try{this.validEpoch(epoch);requireValue(!this.current,'RUN_ALREADY_EXISTS','已经有当前局，请使用重新开始。');return await this.open(options.seed,epoch);}catch(error){return failure(error);}});
  }
  async restart(options?:{seed?:string}):Promise<OperationResult<DeepReadonly<DemoView>>> {
    const seed=options?.seed??this.current?.seed??'hi-story-demo';const epoch=++this.epoch;
    return this.enqueue(async()=>{try{this.validEpoch(epoch);return await this.open(seed,epoch);}catch(error){return failure(error);}});
  }
  private async open(seed:string,epoch:number):Promise<OperationResult<DeepReadonly<DemoView>>> {
    this.busy=true;this.notify();
    try {
      requireValue(typeof seed==='string'&&seed.trim()&&seed.length<=128,'INVALID_SEED','种子须为1至128个字符。');
      const story=initializeStory(seed),request=createStoryMapRequest(story);
      const generated=await (this.ports.createMap??generateMap)(request);
      requireValue(generated.ok,'INITIALIZATION_FAILED',generated.ok?'':'地图生成失败：'+generated.error.message);
      const player=generateCharacterWithParams({seed:`player-${seedHash(seed).toString(16)}`,control:'player'});
      const runtime=createRuntime(generated.map,player,story.npcs);
      const blueprints=this.taskGenerator.generate({seed,quests:story.quests,anchorIds:generated.map.anchors.map(a=>a.id)});
      const things=reconcileThings(createThings(story,blueprints),story,runtime.visitedAnchorIds);
      const candidate:RunSnapshot={schemaVersion:1,runId:`run:${crypto.randomUUID()}`,seed,revision:0,status:'active',playerActorId:player.actorId,versions:{contracts:'demo-contract/1',map:generated.map.generatorVersion,story:'story-adapter/1'},story:projectStory(story,things),runtime,things,receipts:{}};
      this.validate(candidate);await this.ports.beforeCommit?.(freeze(structuredClone(candidate)));this.validEpoch(epoch);
      this.current=candidate;this.busy=false;this.notify();return {ok:true,value:this.query()};
    }finally{if(this.busy){this.busy=false;this.notify();}}
  }
  dispatch(input:unknown):Promise<OperationResult<CommandReceipt>> {
    let command:DemoCommand;
    try{command=commandFrom(input);}catch(error){return Promise.resolve(failure(error));}
    const epoch=this.epoch;
    return this.enqueue<CommandReceipt>(async()=>{
      try{
        this.validEpoch(epoch);const current=this.current;requireValue(current,'NO_ACTIVE_RUN','请先开始一局。');
        requireValue(command.runId===current.runId,'RUN_MISMATCH','操作来自已经结束的旧局。');
        requireValue(command.actorId===current.playerActorId,'ACTOR_MISMATCH','操作身份无效。');
        const fingerprint=canonical(command),previous=Object.hasOwn(current.receipts,command.commandId)?current.receipts[command.commandId]:undefined;
        if(previous){requireValue(previous.fingerprint===fingerprint,'COMMAND_ID_CONFLICT','相同操作编号对应不同内容。');return {ok:true,value:structuredClone(previous),duplicate:true};}
        requireValue(command.expectedRevision===current.revision,'REVISION_CONFLICT','画面已变化，请重新选择。');
        const handler=this.handlers.get(command.type);requireValue(handler,'UNKNOWN_COMMAND','该操作尚未接入。');
        requireValue(current.status!=='ended','RUN_ENDED','本局已经结束，可以重新开始。');
        requireValue(!current.pending||command.type==='combat.action','WAITING_RESULT','请先完成战斗或重新开始。');
        const candidate=structuredClone(current);candidate.story=projectStory(candidate.story,candidate.things);
        handler(candidate,command.payload,command);
        candidate.things=reconcileThings(candidate.things,candidate.story,candidate.runtime.visitedAnchorIds);
        candidate.story=projectStory(candidate.story,candidate.things);
        if(candidate.story.ending)candidate.status='ended';
        candidate.revision=current.revision+1;
        const receipt={commandId:command.commandId,fingerprint,revision:candidate.revision};
        Object.defineProperty(candidate.receipts,command.commandId,{value:receipt,enumerable:true,writable:true,configurable:true});
        this.validate(candidate);await this.ports.beforeCommit?.(freeze(structuredClone(candidate)));this.validEpoch(epoch);
        requireValue(this.current?.runId===current.runId&&this.current.revision===current.revision,'REVISION_CONFLICT','当前局在操作期间变化。');
        this.current=candidate;this.notify();return {ok:true,value:structuredClone(receipt)};
      }catch(error){return failure(error);}
    });
  }
  private validate(state:RunSnapshot):void {
    validateRuntime(state.runtime);
    requireValue(state.playerActorId===state.runtime.playerActorId&&Number.isSafeInteger(state.revision)&&state.revision>=0,'INVARIANT_VIOLATION','本局身份或版本不一致。');
    requireValue(state.story.gold===state.things.gold&&state.story.clue===(state.things.items.clue>0)&&state.story.resource===(state.things.items.supply>0),'INVARIANT_VIOLATION','物品与故事投影不一致。');
    for(const npc of state.story.npcs){const actor=Object.values(state.runtime.actors).find(a=>a.storyNpcId===npc.id);requireValue(actor&&(actor.hp>0)===npc.alive,'INVARIANT_VIOLATION','人物存活状态不一致。');}
    requireValue(Boolean(state.pending)===(state.status==='waiting-result'),'INVARIANT_VIOLATION','战斗等待状态不一致。');
  }
  dispose():void {this.stopped=true;this.epoch++;this.listeners.clear();}
}
export function createGameApplication(ports:GameApplicationPorts={}):GameApplication{return new GameApplication(ports);}
