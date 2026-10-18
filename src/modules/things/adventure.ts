import catalog from '../../../content/adventure/catalog.json';
import type { AdventureCondition, AdventureEffect } from '../../contracts/adventure';
import { requireValue } from '../../contracts/demo';
import type { AdventureRuntime, CheckResult } from '../runtime/index';
import { canInteract, SKILLS, abilityModifier } from '../runtime/index';
import { adventureCatalog, templateFor, socialTemplate, type AdventureStory, type AdventureEventTemplate, type AdventureChoice } from '../story-planning/index';
import type { AdventureQuestBlueprint } from '../quest-generation/index';
import {createAdventureEquipment,validateAdventureEquipment,type AdventureEquipmentInventory} from './equipment';
export interface ItemDefinition {id:string;name:string;description:string;price:number;sellable:boolean;heal:number}
export const ADVENTURE_ITEMS=catalog.items as ItemDefinition[];
export interface AdventureEvent {id:string;templateId:string;npcId?:string;status:'prepared'|'ready'|'waiting'|'settled'|'cancelled';choiceId?:string;check?:CheckResult}
export interface AdventureTask {blueprint:AdventureQuestBlueprint;status:'active'|'success'|'failed'|'abandoned';rewarded:boolean;reason:string}
export interface AdventureThings {gold:number;inventory:Record<string,number>;facts:string[];events:AdventureEvent[];tasks:AdventureTask[];settlements:string[];followups:string[];equipment:AdventureEquipmentInventory}
export interface ConditionContext {things:AdventureThings;runtime:AdventureRuntime;story:AdventureStory}
export interface BoundAdventureChoice {eventId:string;choiceId:string;title:string;text:string;anchorId?:string;npcId?:string;allowed:boolean;reason:string;time:number;gold:number;items:Record<string,number>;check?:{skill:string;label:string;dc:number;mode:CheckResult['mode'];modifier:number;proficiency:number}}
export function validateAdventureCondition(c:AdventureCondition,depth=0,budget={left:128}):void {
 requireValue(c&&typeof c==='object'&&depth<=8&&--budget.left>=0,'INVALID_CONDITION','条件结构超出限制。');
 if(c.kind==='all'||c.kind==='any'){requireValue(Array.isArray(c.conditions)&&c.conditions.length<=32,'INVALID_CONDITION','组合条件无效。');c.conditions.forEach(x=>validateAdventureCondition(x,depth+1,budget));}
 else if(c.kind==='not')validateAdventureCondition(c.condition,depth+1,budget);
 else {requireValue(['item','fact','visit','alive','trust'].includes(c.kind),'INVALID_CONDITION','未知条件类型。');const key=c.kind==='item'?c.itemId:c.kind==='visit'?c.anchorId:c.kind==='fact'?c.id:'npcId'in c?c.npcId:'';requireValue(typeof key==='string'&&key.length>0&&key.length<=120,'INVALID_CONDITION','条件引用无效。');if(c.kind==='item')requireValue(ADVENTURE_ITEMS.some(i=>i.id===c.itemId)&&Number.isSafeInteger(c.count)&&c.count>=1&&c.count<=99,'INVALID_CONDITION','物品条件无效。');if(c.kind==='trust')requireValue(Number.isInteger(c.min)&&c.min>=-5&&c.min<=5,'INVALID_CONDITION','关系条件无效。');}
}
export function conditionMet(c:AdventureCondition,ctx:ConditionContext):boolean {
 validateAdventureCondition(c);
 const handlers:Record<string,()=>boolean>={item:()=>ctx.things.inventory[(c as Extract<AdventureCondition,{kind:'item'}>).itemId]>=(c as Extract<AdventureCondition,{kind:'item'}>).count,fact:()=>ctx.things.facts.includes((c as Extract<AdventureCondition,{kind:'fact'}>).id),visit:()=>ctx.runtime.visitedAnchorIds.includes((c as Extract<AdventureCondition,{kind:'visit'}>).anchorId),alive:()=>Boolean(ctx.story.npcs.find(n=>n.id===(c as Extract<AdventureCondition,{kind:'alive'}>).npcId)?.alive),trust:()=>Boolean(ctx.story.npcs.find(n=>n.id===(c as Extract<AdventureCondition,{kind:'trust'}>).npcId&&n.trust>=(c as Extract<AdventureCondition,{kind:'trust'}>).min)),all:()=>('conditions'in c)&&c.conditions.every(x=>conditionMet(x,ctx)),any:()=>('conditions'in c)&&c.conditions.some(x=>conditionMet(x,ctx)),not:()=>('condition'in c)&&!conditionMet(c.condition,ctx)};return handlers[c.kind]();
}
export function createAdventureThings(quests:AdventureQuestBlueprint[],adventureId:string,npcIds:string[]):AdventureThings {
 const state:AdventureThings={gold:16,inventory:Object.fromEntries(ADVENTURE_ITEMS.map(i=>[i.id,0])),facts:[],events:[],tasks:quests.map(blueprint=>({blueprint:structuredClone(blueprint),status:'active',rewarded:false,reason:''})),settlements:[],followups:[],equipment:createAdventureEquipment()};state.inventory.potion=2;state.inventory.rope=1;state.inventory.herb=2;state.inventory.torch=1;
 for(const id of ['notes','supply','shrine','cache','gate','watch','herbalist','tower-door'])addAdventureEvent(state,id,adventureId);
 for(const npcId of npcIds)addSocialEvents(state,npcId,adventureId);return state;
}
export function addAdventureEvent(s:AdventureThings,templateId:string,adventureId:string,npcId?:string):void {
 const id=`${adventureId}:${npcId??'site'}:${templateId}`;if(s.events.some(e=>e.id===id))return;
 requireValue(s.events.length<128,'CONTENT_LIMIT','事件数量超出本版限制。');s.events.push({id,templateId,...(npcId?{npcId}:{}),status:'prepared'});
}
export function addSocialEvents(s:AdventureThings,npcId:string,adventureId:string):void {for(const social of adventureCatalog.social)addAdventureEvent(s,`social-${social.id}`,adventureId,npcId);}
export function eventTemplate(e:AdventureEvent,story:AdventureStory):AdventureEventTemplate {if(e.npcId){const npc=story.npcs.find(n=>n.id===e.npcId);requireValue(npc,'INVALID_BINDING','事件人物已丢失。');return socialTemplate(npc,e.templateId.replace('social-',''));}return templateFor(e.templateId);}
export function bindAdventureChoices(ctx:ConditionContext):BoundAdventureChoice[] {
 const {things:s,runtime:r,story}=ctx;const player=r.actors[r.playerActorId],result:BoundAdventureChoice[]=[];
 for(const e of s.events){if(e.status==='settled'||e.status==='cancelled'||e.status==='waiting')continue;const t=eventTemplate(e,story);if(!conditionMet(t.when,ctx))continue;
  const npc=e.npcId?story.npcs.find(n=>n.id===e.npcId):undefined,actor=npc?Object.values(r.actors).find(a=>a.storyNpcId===npc.id):undefined,anchor=npc?undefined:r.map.anchors.find(a=>a.id===t.anchorId),point=actor?.position??anchor?.position;
  requireValue(point,'INVALID_BINDING','事件没有人物或地点绑定。');
  for(const c of t.choices){let reason='',dc=c.check?.dc??0,mode:CheckResult['mode']='normal';const items={...c.items};
   if(npc){dc+=npc.attitude==='hostile'?2:npc.attitude==='friendly'?-2:0;if(c.check?.skill==='deception')dc=Math.max(dc,10+abilityModifier(actor!.abilities.wis)+(actor!.skills.includes('insight')?actor!.proficiency:0));if(s.facts.includes(`${npc.id}:insight:success`)||npc.attitude==='friendly')mode='advantage';else if(npc.attitude==='hostile')mode='disadvantage';}
   if(c.check?.skill==='arcana'&&s.inventory.torch>0){mode='advantage';items.torch=(items.torch??0)+1;}
   if(!canInteract(r,point))reason='靠近可见人物或地点后互动。';
   if(story.ending||r.encounter?.status==='active')reason='当前不能进行探索互动。';
   if(s.gold<c.gold)reason='金币不足。';
   for(const [id,n]of Object.entries(items))if(s.inventory[id]<n)reason=`缺少${ADVENTURE_ITEMS.find(i=>i.id===id)?.name??id}。`;
   if(t.id==='tower-door'){const plot=adventureCatalog.mainlines.find(p=>p.id===story.plotId)!;if(!r.visitedAnchorIds.includes('goal'))reason='需要真实抵达暮光塔目标格。';if(!s.inventory[plot.requiredItem])reason=`缺少目标物品：${ADVENTURE_ITEMS.find(i=>i.id===plot.requiredItem)!.name}。`;items[plot.requiredItem]=1;}
   result.push({eventId:e.id,choiceId:c.id,title:t.title,text:c.text,anchorId:anchor?.id,npcId:e.npcId,allowed:!reason,reason,time:c.time,gold:c.gold,items,...(c.check?{check:{skill:c.check.skill,label:SKILLS[c.check.skill].label,dc,mode,modifier:abilityModifier(player.abilities[SKILLS[c.check.skill].ability]),proficiency:player.skills.includes(c.check.skill)?player.proficiency:0}}:{})});
  }
 }return result;
}
export function resolveAdventureChoice(ctx:ConditionContext,eventId:string,choiceId:string):{event:AdventureEvent;choice:AdventureChoice;bound:BoundAdventureChoice} {
 const event=ctx.things.events.find(e=>e.id===eventId),bound=bindAdventureChoices(ctx).find(c=>c.eventId===eventId&&c.choiceId===choiceId);requireValue(event&&bound,'OPTION_UNAVAILABLE','事件已经完成或条件发生变化。');requireValue(bound.allowed,'OUT_OF_RANGE',bound.reason);const choice=eventTemplate(event,ctx.story).choices.find(c=>c.id===choiceId)!;return {event,choice,bound};
}
export function changeAdventureItem(s:AdventureThings,id:string,amount:number):void {requireValue(Object.hasOwn(s.inventory,id)&&Number.isSafeInteger(amount)&&Math.abs(amount)<=99,'INVALID_ITEM','物品效果无效。');const count=s.inventory[id]+amount;requireValue(Number.isSafeInteger(count)&&count>=0&&count<=99,'INSUFFICIENT_ITEMS','物品数量不足或超出限制。');s.inventory[id]=count;}
export function changeAdventureGold(s:AdventureThings,amount:number):void {const next=s.gold+amount;requireValue(Number.isSafeInteger(amount)&&Number.isSafeInteger(next)&&next>=0&&next<=100000,'INSUFFICIENT_GOLD','金币不足或无效。');s.gold=next;}
export function addAdventureFact(s:AdventureThings,id:string):void {requireValue(typeof id==='string'&&id.length<=120,'INVALID_FACT','事实编号无效。');if(!s.facts.includes(id)){requireValue(s.facts.length<2000,'CONTENT_LIMIT','事实数量超出限制。');s.facts.push(id);}}
export function updateAdventureTasks(ctx:ConditionContext):AdventureEffect[] {const effects:AdventureEffect[]=[];for(const task of ctx.things.tasks){if(task.status==='active'&&conditionMet(task.blueprint.condition,ctx)){task.status='success';task.reason='已通过真实行动满足目标条件。';}if(task.status==='success'&&!task.rewarded){task.rewarded=true;effects.push(...structuredClone(task.blueprint.reward));}if(ctx.story.outcome==='failed'&&task.status==='active'){task.status='failed';task.reason='本局已经结束。';}}return effects;}
export function validateAdventureThings(s:AdventureThings):void {
 validateAdventureEquipment(s.equipment);
 requireValue(Number.isSafeInteger(s.gold)&&s.gold>=0&&s.gold<=100000&&s.events.length<=128&&s.tasks.length<=32&&s.facts.length<=2000,'INVALID_THINGS','物品/事件状态无效。');
 requireValue(Object.keys(s.inventory).length===ADVENTURE_ITEMS.length&&ADVENTURE_ITEMS.every(i=>Number.isInteger(s.inventory[i.id])&&s.inventory[i.id]>=0&&s.inventory[i.id]<=99),'INVALID_THINGS','背包数据无效。');
 const ids=new Set<string>();for(const e of s.events){requireValue(typeof e.id==='string'&&!ids.has(e.id)&&['prepared','ready','waiting','settled','cancelled'].includes(e.status),'INVALID_EVENT','事件身份/状态无效。');ids.add(e.id);requireValue((e.status==='settled')===s.settlements.includes(e.id),'INVALID_EVENT','事件结算账本不一致。');}
 requireValue(new Set(s.facts).size===s.facts.length&&new Set(s.settlements).size===s.settlements.length,'INVALID_THINGS','事实/结算重复。');const quests=new Set<string>();for(const q of s.tasks){requireValue(!quests.has(q.blueprint.id)&&['active','success','failed','abandoned'].includes(q.status)&&typeof q.rewarded==='boolean'&&(!q.rewarded||q.status==='success'),'INVALID_TASK','任务状态无效。');quests.add(q.blueprint.id);validateAdventureCondition(q.blueprint.condition);}
}

export function validateAdventureContent(anchorIds:string[]):void {
 const ids=new Set<string>();const effect=(e:AdventureEffect)=>{requireValue(e&&['item','gold','fact','trust','hp','door','spawn','quest','event','ending'].includes(e.kind),'INVALID_CONTENT','未知效果。');if(e.kind==='item')requireValue(ADVENTURE_ITEMS.some(i=>i.id===e.itemId)&&Number.isInteger(e.amount)&&Math.abs(e.amount)<=99,'INVALID_CONTENT','效果物品引用无效。');if(e.kind==='gold'||e.kind==='trust'||e.kind==='hp')requireValue(Number.isSafeInteger(e.amount)&&Math.abs(e.amount)<=100,'INVALID_CONTENT','效果数值无效。');if(e.kind==='spawn')requireValue(anchorIds.includes(e.anchorId),'INVALID_CONTENT','新增人物锚点无效。');if(e.kind==='event')requireValue(adventureCatalog.events.some(t=>t.id===e.templateId),'INVALID_CONTENT','后续事件引用无效。');};
 for(const event of adventureCatalog.events){requireValue(!ids.has(event.id)&&anchorIds.includes(event.anchorId)&&event.choices.length>=1&&event.choices.length<=8,'INVALID_CONTENT','事件或地点引用无效。');ids.add(event.id);validateAdventureCondition(event.when);const choices=new Set<string>();for(const c of event.choices){requireValue(!choices.has(c.id)&&Number.isFinite(c.time)&&c.time>=0&&c.time<=4&&Number.isSafeInteger(c.gold)&&c.gold>=0,'INVALID_CONTENT','事件选项无效。');choices.add(c.id);for(const [id,n]of Object.entries(c.items))requireValue(ADVENTURE_ITEMS.some(i=>i.id===id)&&Number.isSafeInteger(n)&&n>=1&&n<=99,'INVALID_CONTENT','选项成本无效。');if(c.check)requireValue(Object.hasOwn(SKILLS,c.check.skill)&&Number.isSafeInteger(c.check.dc)&&c.check.dc>=1&&c.check.dc<=30,'INVALID_CONTENT','检定配置无效。');[...c.success,...c.failure].forEach(effect);}}
 for(const f of adventureCatalog.followups){validateAdventureCondition(f.when);f.effects.forEach(effect);}for(const social of adventureCatalog.social)[...social.success,...social.failure].forEach(effect);
}
