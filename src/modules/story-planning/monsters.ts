import {generateCharacterWithParams} from '../characters';
import {requireValue,seedHash} from '../../contracts/demo';
import type {AdventureNPC} from './adventure';

/** Names/visual bindings only. Combat values come from the runtime's own rules. */
export const MONSTER_ENCOUNTERS_VERSION='monster-encounters/1' as const;
export const MONSTER_ENCOUNTERS=[
 {id:'skeleton',name:'枯骨守卫',sourceName:'骷髅战士',modelId:'monster-2827',anchorId:'watch'},
 {id:'lizard',name:'赤鳞魔蜥',sourceName:'火龙蜥',modelId:'monster-2942',anchorId:'watch'},
] as const;
export function monsterEncounter(id:string){return MONSTER_ENCOUNTERS.find(m=>m.id===id);}
export function makeMonsterNPC(seed:string,id:string):AdventureNPC {
 const entry=monsterEncounter(id);requireValue(entry,'INVALID_MONSTER','未知的魔物相遇。');
 const profile=generateCharacterWithParams({seed:`adv-${seedHash(seed).toString(16)}:monster-${id}`,control:'npc',name:entry.name,occupation:'遗迹魔物',background:'遗迹中的魔物被动静唤醒，守在风蚀哨塔附近。',motivation:'守住遗迹',personality:{traits:['警惕、守护领地']},preferences:{likes:['安静的遗迹'],dislikes:['闯入领地']}});
 return {id:`monster-${id}`,monsterId:id,name:entry.name,role:'遗迹魔物',profile,alive:true,trust:0,attitude:'hostile',location:'watch',trait:'遗迹中的魔物；可以靠近挑战，也可以绕开。'};
}
export function validateMonsterNPC(npc:AdventureNPC):void {
 if(npc.monsterId===undefined){requireValue(!npc.id.startsWith('monster-'),'INVALID_MONSTER','魔物缺少来源绑定。');return;}
 const entry=monsterEncounter(npc.monsterId);requireValue(entry&&npc.id===`monster-${entry.id}`&&npc.name===entry.name&&npc.profile.name===entry.name&&npc.role==='遗迹魔物','INVALID_MONSTER','魔物身份与素材绑定不一致。');
}
