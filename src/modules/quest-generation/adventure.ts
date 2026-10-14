import data from '../../../content/adventure/catalog.json';
import type { AdventureCondition, AdventureEffect } from '../../contracts/adventure';
import { requireValue, seedHash } from '../../contracts/demo';
export interface AdventureQuestBlueprint {id:string;title:string;condition:AdventureCondition;reward:AdventureEffect[];initial:boolean;main?:boolean}
export const adventureQuestCatalog=data.quests as unknown as AdventureQuestBlueprint[];
export function generateAdventureQuests(seed:string,goal:string,include?:string):AdventureQuestBlueprint[] {
 const main:AdventureQuestBlueprint={id:'main',title:goal,condition:{kind:'fact',id:'main-complete'},reward:[],initial:true,main:true};
 if(include){const q=adventureQuestCatalog.find(q=>q.id===include);requireValue(q,'INVALID_TASK_BLUEPRINT','追加任务不存在。');return [structuredClone(q)];}
 const initial=adventureQuestCatalog.filter(q=>q.initial),start=seedHash(seed+':tasks')%initial.length;
 return [main,structuredClone(initial[start]),structuredClone(initial[(start+1)%initial.length])];
}
