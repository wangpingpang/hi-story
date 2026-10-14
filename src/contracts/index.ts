export type Stage = 'bridge' | 'river' | 'post' | 'ended';
export type ChoiceId = 'A'|'B'|'C'|'D'|'solo'|'rope'|'carry'|'public'|'anonymous';
export interface Command { commandId:string; runId:string; actorId:string; eventInstanceId:string; revision:number; choiceId:ChoiceId }
export interface Fact { eventId:string; runId:string; sequence:number; sourceCommandId:string; schemaVersion:1; stage:Stage; choiceId:ChoiceId; text:string }
export type DeepReadonly<T> = T extends object ? {readonly [K in keyof T]:DeepReadonly<T[K]>}:T;
export function freeze<T>(value:T):DeepReadonly<T> { if(value && typeof value==='object'){Object.freeze(value); for(const v of Object.values(value)) freeze(v);} return value as DeepReadonly<T>; }
export * from './runtime';
