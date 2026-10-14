import type { Fact, Stage } from '../../contracts';
export const eventId=(runId:string,stage:Stage)=>`${runId}:${stage}`;
export function append(facts:Fact[],fact:Fact):Fact[]{if(facts.some(f=>f.eventId===fact.eventId)) throw Error('事件已结算'); return [...facts,fact];}

export { assembleEvents, requireEvent, waitForEvent, settleEvent } from './events';
export type { EventBinding, EventInstance, Settlement } from './events';
