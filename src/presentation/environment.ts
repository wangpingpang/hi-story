export type Weather='sun'|'mist'|'rain'|'snow'|'wind';
export function environmentFor(seed:string,hours:number,override?:Weather){
 let hash=2166136261;for(const c of seed)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const weather=override??(['sun','mist','rain','snow','wind'] as Weather[])[(hash+Math.floor(hours/3))%5];
 const hour=(16+hours)%24,night=hour>=20||hour<6;
 return {weather,hour,night,label:({sun:'晴光',mist:'薄雾',rain:'细雨',snow:'飘雪',wind:'落叶风'} as const)[weather],light:night?'night':hour>=16?'dusk':'day'};
}
