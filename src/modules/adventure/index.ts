import type { Stage } from '../../contracts';
export interface Adventure {runId:string; stage:Stage; revision:number; elapsed:number}
export const start=(runId:string):Adventure=>({runId,stage:'bridge',revision:0,elapsed:0});
export function advance(s:Adventure,time:number):Adventure {const next:Record<Stage,Stage>={bridge:'river',river:'post',post:'ended',ended:'ended'}; if(s.stage==='ended') throw Error('本局已结束'); return {...s,stage:next[s.stage],revision:s.revision+1,elapsed:s.elapsed+time};}
