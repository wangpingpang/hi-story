import type { ChoiceId } from '../../contracts';
export interface Evidence {scene:string; choice:ChoiceId; priority:'time'|'resources'|'privacy'|'open'; text:string}
export const record=(past:Evidence[],e:Evidence):Evidence[]=>[...past,e];
export function describe(evidence:readonly Evidence[]){return (['time','resources'] as const).flatMap(priority=>{const support=evidence.filter(e=>e.priority===priority); if(new Set(support.map(e=>e.scene)).size<2)return []; return [{text:priority==='time'?'本局角色在不同场景中重复优先节省时间':'本局角色在不同场景中重复优先保留物资',confidence:'低' as const,support:support.map(e=>e.choice),counterEvidence:evidence.filter(e=>e.priority===(priority==='time'?'resources':'time')).map(e=>e.choice)}];});}
