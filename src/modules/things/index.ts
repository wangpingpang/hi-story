import type { World, Option } from '../story-planning/index';
import type { TaskBlueprint } from '../quest-generation/index';
import { canInteract, getAnchorPosition, type RuntimeState } from '../runtime/index';
import { requireValue } from '../../contracts/demo';
export interface TaskInstance { blueprint:TaskBlueprint; status:string; reason:string; rewarded:boolean }
export interface ThingsState {
  gold:number; items:Record<'clue'|'supply'|'notes',number>;
  objectives:TaskInstance[]; attempts:Record<string,number>; settlements:string[];
  facts:{eventId:string;optionId:string;text:string}[];
}
export interface BoundEvent {
  eventInstanceId:string; optionId:string; text:string; category:string;
  allowed:boolean; reason:string; cost:number; external?:'combat'; targetActorId?:string;
}
export function createThings(world:World,blueprints:TaskBlueprint[]):ThingsState {
  return {gold:world.gold,items:{clue:Number(world.clue),supply:Number(world.resource),notes:Number(world.notes)},objectives:blueprints.map(blueprint=>({blueprint:structuredClone(blueprint),status:'active',reason:'',rewarded:false})),attempts:{},settlements:[],facts:[]};
}
export function projectStory(world:World,state:ThingsState):World {
  const next=structuredClone(world);next.gold=state.gold;next.clue=state.items.clue>0;next.resource=state.items.supply>0;next.notes=state.items.notes>0;
  for(const task of state.objectives)if(task.blueprint.condition.kind==='story-status'){
    const condition=task.blueprint.condition;
    const quest=next.quests.find(q=>q.id===condition.questId);
    if(quest){quest.status=task.status as typeof quest.status;quest.reason=task.reason;}
  }return next;
}
export function reconcileThings(state:ThingsState,world:World,visitedAnchorIds:string[]):ThingsState {
  const next=structuredClone(state);next.gold=world.gold;next.items={clue:Number(world.clue),supply:Number(world.resource),notes:Number(world.notes)};
  for(const task of next.objectives){
    if(task.blueprint.condition.kind==='story-status'){
      const condition=task.blueprint.condition;
      const q=world.quests.find(q=>q.id===condition.questId);requireValue(q,'INVARIANT_VIOLATION','故事任务绑定丢失。');task.status=q.status;task.reason=q.reason;
    }else if(task.status==='active'&&visitedAnchorIds.includes(task.blueprint.condition.anchorId)){
      task.status='success';task.reason='通过实际探索完成地点目标。';
    }
    if(task.status==='success'&&!task.rewarded){next.gold+=task.blueprint.rewardGold;task.rewarded=true;}
  }
  requireValue(Number.isSafeInteger(next.gold)&&next.gold>=0,'INVARIANT_VIOLATION','金币不能为负或溢出。');return next;
}
export function bindEvents(runId:string,options:Option[],state:ThingsState,runtime:RuntimeState):BoundEvent[] {
  return options.filter(o=>o.actionId!=='travel').map(option=>{
    let point, targetActorId;
    if(option.npcId){const a=Object.values(runtime.actors).find(a=>a.storyNpcId===option.npcId);requireValue(a,'INVALID_BINDING','事件人物绑定丢失。');point=a.position;targetActorId=a.actorId;}
    else {const anchorId:Record<string,string>={notes:'notes',buy:'market',search:'supply',resolve:'goal'};if(anchorId[option.actionId])point=getAnchorPosition(runtime,anchorId[option.actionId]);}
    const allowed=!point||canInteract(runtime,point);
    return {eventInstanceId:`${runId}:event:${option.id}:${Object.hasOwn(state.attempts,option.id)?state.attempts[option.id]:0}`,optionId:option.id,text:option.text,category:option.category,cost:option.cost,allowed,reason:allowed?'':'靠近对应人物或地点后才能操作。',external:option.external,targetActorId};
  });
}
export function settleEvent(state:ThingsState,event:BoundEvent):ThingsState {
  requireValue(event.allowed,'OUT_OF_RANGE',event.reason||'当前不能执行该事件。');
  requireValue(!state.settlements.includes(event.eventInstanceId),'EVENT_ALREADY_RESOLVED','该事件已结算。');
  const next=structuredClone(state);next.settlements.push(event.eventInstanceId);
  Object.defineProperty(next.attempts,event.optionId,{value:(Object.hasOwn(next.attempts,event.optionId)?next.attempts[event.optionId]:0)+1,enumerable:true,writable:true,configurable:true});
  next.facts.push({eventId:event.eventInstanceId,optionId:event.optionId,text:event.text});return next;
}

export * from './adventure';
export * from './equipment';
