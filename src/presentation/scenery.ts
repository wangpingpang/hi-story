/** Public, generated scenery. Source rectangles are calibrated to the actual atlas. */
export const SCENERY_VERSION='hd2d-scenery/1';
export const SCENERY_ATLAS='assets/scenery/hd2d-scenery-v1.webp';
export const sceneryRects={oak:[0,0,450,480],cottage:[450,0,460,480],tower:[910,0,460,480],shrine:[1370,0,404,480],tent:[0,480,490,407],rock:[490,480,440,407],wagon:[930,480,440,407],fir:[1370,470,404,417]} as const;
export type ScenerySprite=keyof typeof sceneryRects;
export function scenerySprite(kind:ScenerySprite,x:number,y:number,width:number,height=width,interactive=false):string {
 const [sx,sy,sw,sh]=sceneryRects[kind],url=`${import.meta.env.BASE_URL}${SCENERY_ATLAS}`;
 return `<svg data-scenery="${kind}" x="${x-width/2}" y="${y-height*.94}" width="${width}" height="${height}" viewBox="${sx} ${sy} ${sw} ${sh}" overflow="hidden" ${interactive?'':'pointer-events="none"'}><image href="${url}" width="1774" height="887"/></svg>`;
}
export function sceneryDefs():string{return `<pattern id="ground-grass" width="32" height="16" patternUnits="userSpaceOnUse"><path d="M2 7l2-3m8 7 2-4m9-4 2 2m4 7-2-3" stroke="#b8be7270" stroke-width="1.4"/><path d="M4 14h3M18 3h4M25 9h3" stroke="#183e3670" stroke-width="2"/></pattern><pattern id="ground-stone" width="32" height="16" patternUnits="userSpaceOnUse"><path d="M0 8h32M16 0v8M7 8v8M28 8v8" stroke="#34483d70"/><path d="M1 7h14M18 15h8" stroke="#dfd6a75c"/></pattern><pattern id="ground-earth" width="24" height="16" patternUnits="userSpaceOnUse"><path d="M3 5h3m9 5h5M8 15h2" stroke="#554c3c66"/><path d="M8 2h4m7 12h3" stroke="#efda9b55"/></pattern><pattern id="ground-water" width="48" height="20" patternUnits="userSpaceOnUse"><path d="M3 5h17m9 12h16M4 18h7" stroke="#a0c7a54d" stroke-width="1"/></pattern><radialGradient id="lantern-light"><stop stop-color="#ffdb8790"/><stop offset="1" stop-color="#ffc96600"/></radialGradient>`;}
