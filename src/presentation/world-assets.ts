import manifest from '../../public/assets/world/manifest.json';
export const WORLD_ART_VERSION=manifest.version;
export const worldAssets=manifest.assets;
export type WorldAsset=keyof typeof worldAssets;
const images=new Map<string,HTMLImageElement>();
export async function loadWorldArt():Promise<void>{
 await Promise.all(Object.entries(manifest.atlases).map(async([id,atlas])=>{
  const image=new Image();image.src=`${import.meta.env.BASE_URL}assets/world/${atlas.file}`;
  await image.decode();images.set(id,image);
 }));
}
export function drawWorldAsset(ctx:CanvasRenderingContext2D,id:WorldAsset,x:number,y:number,width:number,height=width):void{
 const a=worldAssets[id],image=images.get(a.atlas);if(!image)return;
 const [sx,sy,sw,sh]=a.rect,scale=Math.min(width/sw,height/sh),w=sw*scale,h=sh*scale;
 ctx.drawImage(image,sx,sy,sw,sh,x-w/2,y-h,w,h);
}
export function drawGroundTexture(ctx:CanvasRenderingContext2D,id:WorldAsset,x:number,y:number,width:number,height:number):void{
 const a=worldAssets[id],image=images.get(a.atlas);if(!image)return;const [sx,sy,sw,sh]=a.rect;
 ctx.drawImage(image,sx,sy,sw,sh,x,y,width,height);
}
