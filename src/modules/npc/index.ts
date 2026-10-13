export interface Npc {knownFacts:string[]; safelyMoved:boolean}
export const create=():Npc=>({knownFacts:[],safelyMoved:false});
export function observeRiver(help:boolean):Npc {return {knownFacts:help?['与沈青在旧渡口合作搬箱']:[],safelyMoved:true};}
