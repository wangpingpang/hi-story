import type {DeepReadonly} from '../contracts';
import type {AdventureSnapshot} from './adventure-application';
import {MONSTER_ENCOUNTERS,monsterEncounter} from '../modules/story-planning';
import {canInteract} from '../modules/runtime';

export function monsterModelFor(s:DeepReadonly<AdventureSnapshot>,actorId:string):string|undefined {
 const npc=s.story.npcs.find(n=>n.profile.actorId===actorId);
 return npc?.monsterId?monsterEncounter(npc.monsterId)?.modelId:undefined;
}
export function queryMonsterEncounters(s:AdventureSnapshot|undefined){
 return MONSTER_ENCOUNTERS.map(m=>{
  const npc=s?.story.npcs.find(n=>n.monsterId===m.id),anchor=s?.runtime.map.anchors.find(a=>a.id===m.anchorId);
  const reason=!s?'请先开始冒险。':s.status!=='active'?'请先完成当前战斗或开始新旅程。':npc?npc.alive?'魔物已经现身，可点击地图靠近。':'这只魔物已被击退。':s.story.npcs.length>=8?'本局相遇已满。':!anchor||!canInteract(s.runtime,anchor.position)?'靠近风蚀哨塔后可唤醒魔物。':undefined;
  return {...m,npcId:npc?.id,alive:npc?.alive,allowed:reason===undefined,reason};
 });
}
