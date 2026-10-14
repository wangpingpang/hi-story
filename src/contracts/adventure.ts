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
