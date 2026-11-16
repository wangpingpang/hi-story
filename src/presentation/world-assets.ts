import manifest from '../../public/assets/world/manifest.json';
import {AssetLoadQueue,decodeAssetImage,sharedAssetRequest,type AssetRequest} from './asset-loading';
export const WORLD_ART_VERSION=manifest.version;
export const worldAssets=manifest.assets;
export type WorldAsset=keyof typeof worldAssets;
const images=new Map<string,HTMLImageElement>();
const pending=new Map<string,AssetRequest<HTMLImageElement>>(),queue=new AssetLoadQueue(2);
export async function loadWorldArt(signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();
 await Promise.all(Object.entries(manifest.atlases).map(async([id,atlas])=>{
  if(images.has(id))return;
  await sharedAssetRequest(pending,id,signal,async request=>{
   const release=await queue.acquire(request);
   try{
    const image=await decodeAssetImage(`${import.meta.env.BASE_URL}assets/world/${atlas.file}`,request);request.throwIfAborted();
    if(image.naturalWidth!==atlas.width||image.naturalHeight!==atlas.height)throw Error('场景图集尺寸无效');
    images.set(id,image);return image;
   }finally{release();}
  });
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
