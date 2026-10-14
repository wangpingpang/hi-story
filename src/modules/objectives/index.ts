export interface Objective {completed:boolean; processing:'tonight'|'morning'|null; publicName:string|null}
export const create=():Objective=>({completed:false,processing:null,publicName:null});
export function complete(elapsed:number,publicName:string|null):Objective {return {completed:true,processing:elapsed<=3?'tonight':'morning',publicName};}

export { transitionQuest, explainQuest, validateQuestTransitions, reconcilePlanProgress } from './quests';
export type { QuestStatus, QuestState, RouteProgress, StageProgress, PlanProgress } from './quests';
