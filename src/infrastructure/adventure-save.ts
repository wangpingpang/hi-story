import type { SavePort } from '../application';
export function createBrowserSavePort(storage:Storage):SavePort {
 const key='hi-story:adventure:v010';
 return {read:()=>storage.getItem(key),write:value=>{storage.setItem(key,value);}};
}
