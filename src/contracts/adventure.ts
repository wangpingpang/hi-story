export type AdventureCondition=
 | {kind:'item';itemId:string;count:number}
 | {kind:'fact';id:string}
 | {kind:'visit';anchorId:string}
 | {kind:'alive';npcId:string}
 | {kind:'trust';npcId:string;min:number}
 | {kind:'all'|'any';conditions:AdventureCondition[]}
 | {kind:'not';condition:AdventureCondition};
export type AdventureEffect=
 | {kind:'item';itemId:string;amount:number}
 | {kind:'gold';amount:number}
 | {kind:'fact';id:string}
 | {kind:'trust';npcId:string;amount:number}
 | {kind:'hp';target:'player'|'npc';amount:number}
 | {kind:'door';id:string;open:boolean}
 | {kind:'spawn';npcId:string;anchorId:string}
 | {kind:'quest';questId:string}
 | {kind:'event';templateId:string}
 | {kind:'ending';outcome:'success'|'failed'};

/** Committed battle evidence; presentation must never roll again. */
export interface DiceRollRecord {
 id:string;sequence:number;kind:'initiative'|'movement'|'attack'|'damage'|'escape'|'save'|'healing';
 actorId:string;targetId?:string;sides:4|6|8|10|12|20;dice:number[];bonus:number;total:number;minimum?:0|1;
 threshold?:number;success?:boolean;critical?:boolean;visual?:'spell'|'unarmed';
}
