/** Imported sprite data is presentation only; it never replaces character identity or saves. */
import {AssetLoadQueue,decodeAssetImage,sharedAssetRequest,type AssetRequest} from './asset-loading';
export interface ModelOption {id:number;label:string}
export interface ModelCatalog {
 version:string;source:string;licenseNotice:string;selection:{color:number;weapon:number;description:string};
 directions:{id:number;name:string}[];actions:ModelOption[];
 characters:{id:string;baseId:number;name:string;detailUrl:string;manifestUrl:string;portraitUrl:string;roleColor:ModelOption[];weaponType:ModelOption[];actionType:ModelOption[];candidateCount:number}[];
}
export interface SpriteFrame {rect:[number,number,number,number];durationMs:number;pivot:[number,number]}
export interface SpriteClip {actionId:number;directionId:number;atlasId:string;atlasUrl:string;durationMs:number;loop:boolean;frames:SpriteFrame[];sourceUrl:string}
export interface ModelManifest {
 version:string;characterId:string;name:string;source:string;licenseNotice:string;standHeight:number|null;pivotPolicy:string;
 atlases:{id:string;url:string;width:number;height:number;bytes:number;sha256:string}[];
 clips:Record<string,SpriteClip>;availableClips:number;requestedClips:number;
}
export const DEFAULT_CHARACTER_MODEL='role-1024';
export const CHARACTER_MODEL_PREFERENCE='hi-story:character-model:molibaike-v1';
export const SPRITE_DIRECTIONS=['NW','N','NE','E','SE','S','SW','W'] as const;
const modelIdPattern=/^role-\d{4,6}$/;
export function readSelectedModel():string{try{const value=localStorage.getItem(CHARACTER_MODEL_PREFERENCE);return value&&modelIdPattern.test(value)?value:DEFAULT_CHARACTER_MODEL;}catch{return DEFAULT_CHARACTER_MODEL;}}
export function selectModel(id:string):void{if(!modelIdPattern.test(id))throw Error('人物编号无效');try{localStorage.setItem(CHARACTER_MODEL_PREFERENCE,id);}catch{throw Error('浏览器未能保存人物选择，请允许本地存储后重试。');}}
export function characterAssetUrl(path:string):string{
 if(!/^assets\/(?:characters|monsters)\/molibaike\/[a-zA-Z0-9/_-]+\.(?:json|webp)$/.test(path))throw Error('人物素材路径无效');
 return `${import.meta.env.BASE_URL}${path}`;
}
export function stableNpcModel(actorId:string,ids:readonly string[]):string{
 if(!ids.length)return DEFAULT_CHARACTER_MODEL;let hash=2166136261;for(const char of actorId)hash=Math.imul(hash^char.charCodeAt(0),16777619);return ids[(hash>>>0)%ids.length];
}
/** Keep one standing scale across all poses while allowing tall/wide source canvases. */
export function normalizedSpriteGeometry(frame:SpriteFrame,standHeight:number){
 if(!Number.isFinite(standHeight)||standHeight<=0)throw Error('人物站姿高度无效');
 const scale=240/standHeight,[,,width,height]=frame.rect;
 return {scale,width:Math.ceil(width*scale)+4,height:Math.ceil(height*scale)+4,pivot:[frame.pivot[0]*scale+2,frame.pivot[1]*scale+2] as [number,number],target:[2,2,width*scale,height*scale] as [number,number,number,number]};
}
/** One scale for every pose in the 640x420 preview, anchored at (320,330).
 * Full source canvases stay inside 24px side / 30px top / 20px bottom margins.
 */
export function characterPreviewScale(manifest:Pick<ModelManifest,'standHeight'|'clips'>){
 const height=manifest.standHeight;if(!Number.isFinite(height)||height!<=0)throw Error('人物站姿高度无效');
 let above=0,below=0,side=0,frames=0;
 for(const clip of Object.values(manifest.clips))for(const frame of clip.frames){
  const [,,width,height]=frame.rect,[x,y]=frame.pivot;
  above=Math.max(above,y);below=Math.max(below,height-y);side=Math.max(side,Math.abs(x),Math.abs(width-x));frames++;
 }
 if(!frames)throw Error('人物没有可预览的动画帧');
 return Math.min(3,205/height!,above>0?300/above:Infinity,side>0?296/side:Infinity,below>0?70/below:Infinity);
}
function touch<K,V>(map:Map<K,V>,key:K,value:V,max:number){map.delete(key);map.set(key,value);while(map.size>max)map.delete(map.keys().next().value!);return value;}
// A run may show eight NPCs plus the player. Keep the full 28-person catalog's
// lightweight manifests, and enough decoded atlases for their stand/walk poses.
const MANIFEST_CACHE_LIMIT=32,ATLAS_CACHE_LIMIT=24,ATLAS_PIXEL_LIMIT=12_000_000;
let catalog:ModelCatalog|undefined;
const catalogPending=new Map<string,AssetRequest<ModelCatalog>>();
const manifests=new Map<string,ModelManifest>(),manifestPending=new Map<string,AssetRequest<ModelManifest>>();
export function peekModelCatalog(){return catalog;}
export function peekCharacterModel(id:string){const value=manifests.get(id);return value?touch(manifests,id,value,MANIFEST_CACHE_LIMIT):undefined;}
async function json<T>(path:string,signal:AbortSignal):Promise<T>{const response=await fetch(characterAssetUrl(path),{signal});if(!response.ok)throw Error(`人物素材读取失败（${response.status}）`);return response.json() as Promise<T>;}
export async function loadModelCatalog(signal?:AbortSignal):Promise<ModelCatalog>{
 signal?.throwIfAborted();if(catalog)return catalog;
 return sharedAssetRequest(catalogPending,'catalog',signal,async request=>{
  const value=await json<ModelCatalog>('assets/characters/molibaike/source-catalog.json',request);request.throwIfAborted();
  if(value.version!=='molibaike-catalog/1'||!Array.isArray(value.characters)||!value.characters.length)throw Error('人物目录格式无效');catalog=value;return value;
 });
}
export async function loadCharacterModel(id:string,signal?:AbortSignal):Promise<ModelManifest>{
 signal?.throwIfAborted();const monster=['monster-2827','monster-2942'].includes(id);if(!modelIdPattern.test(id)&&!monster)throw Error('人物编号无效');const cached=manifests.get(id);if(cached)return touch(manifests,id,cached,MANIFEST_CACHE_LIMIT);
 return sharedAssetRequest(manifestPending,id,signal,async request=>{
  const value=monster?await json<ModelManifest>(`assets/monsters/molibaike/${id}/manifest.json`,request):await loadModelCatalog(request).then(catalog=>{const model=catalog.characters.find(c=>c.id===id);if(!model)throw Error('人物不在当前素材目录中');return json<ModelManifest>(model.manifestUrl,request);});request.throwIfAborted();
  if(value.version!==(monster?'molibaike-monster/1':'molibaike-character/1')||value.characterId!==id||!Number.isFinite(value.standHeight)||value.standHeight!<=0||!value.clips||!value.atlases?.length)throw Error('人物动画数据无效');
  for(const clip of Object.values(value.clips)){const atlas=value.atlases.find(a=>a.id===clip.atlasId);if(!atlas||atlas.url!==clip.atlasUrl||!clip.frames.length||!(clip.durationMs>0))throw Error('人物图集引用无效');characterAssetUrl(clip.atlasUrl);for(const frame of clip.frames){const [x,y,w,h]=frame.rect;if(![x,y,w,h,...frame.pivot,frame.durationMs].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>atlas.width||y+h>atlas.height||frame.durationMs<=0)throw Error('人物动画帧超出图集');}}
  return touch(manifests,id,value,MANIFEST_CACHE_LIMIT);
 });
}
/** Exact source clip if present; any stand substitution is returned explicitly. */
export function resolveClipFrame(manifest:ModelManifest,actionId:number,directionId:number,timeMs:number,loop?:boolean){
 const clip=manifest.clips[`${actionId}:${directionId}`]??manifest.clips[`0:${directionId}`]??manifest.clips['0:5'];if(!clip?.frames.length)throw Error('人物缺少可用站立动画');
 const duration=clip.frames.reduce((sum,frame)=>sum+frame.durationMs,0),time=Math.max(0,Number.isFinite(timeMs)?timeMs:0),repeat=loop??clip.loop;
 let remaining=repeat?time%duration:Math.min(time,duration-Number.EPSILON),index=0;while(index<clip.frames.length-1&&remaining>=clip.frames[index].durationMs){remaining-=clip.frames[index].durationMs;index++;}
 return {clip,frame:clip.frames[index],frameIndex:index,atlasUrl:clip.atlasUrl,actionId:clip.actionId,directionId:clip.directionId,fallback:clip.actionId!==actionId||clip.directionId!==directionId};
}
/** The imported set has no independent facial layer or exact clip for every game action. */
export function mapGameAction(action:string):{id:number;loop:boolean;holdLast?:boolean;substitute:boolean}{
 const ids:Record<string,number>={stand:0,walk:1,attack:5,cast:6,block:9,fall:10,sit:11,wave:12,nod:16};
 if(action in ids)return {id:ids[action],loop:['stand','walk','sit'].includes(action),substitute:false};
 if(['downed','dead','lie','sleep'].includes(action))return {id:10,loop:false,holdLast:true,substitute:true};
 const substitutes:Record<string,number>={'stand-relaxed':0,'stand-alert':0,'combat-ready':0,'heavy-attack':5,'hit-unarmed':8,'hit-weapon':8,'hit-spell':8,talk:16,point:12,'shake-head':0,lean:0,dodge:1};
 return {id:substitutes[action]??0,loop:['stand-relaxed','stand-alert','combat-ready','lean'].includes(action),substitute:true};
}
const atlasImages=new Map<string,HTMLImageElement>(),atlasPending=new Map<string,AssetRequest<HTMLImageElement>>();
export function peekSpriteAtlas(path:string){const value=atlasImages.get(path);return value?touch(atlasImages,path,value,ATLAS_CACHE_LIMIT):undefined;}
const decodeQueue=new AssetLoadQueue(3),downloadQueue=new AssetLoadQueue(3);
// Compressed prefetched poses are separate from the decoded stand/walk LRU.
// No service worker or unversioned persistent store is used; reloads use normal HTTP cache policy.
const ATLAS_BLOB_BYTES=16*1024*1024,ATLAS_BLOB_LIMIT=96,ATLAS_SINGLE_BLOB_BYTES=2*1024*1024;
const atlasBlobs=new Map<string,Blob>(),blobPending=new Map<string,AssetRequest<Blob>>();
function keepBlob(path:string,blob:Blob){
 touch(atlasBlobs,path,blob,ATLAS_BLOB_LIMIT);
 let bytes=[...atlasBlobs.values()].reduce((sum,value)=>sum+value.size,0);
 while(bytes>ATLAS_BLOB_BYTES){const key=atlasBlobs.keys().next().value!;bytes-=atlasBlobs.get(key)!.size;atlasBlobs.delete(key);}
 return blob;
}
function atlasBlob(path:string,signal?:AbortSignal):Promise<Blob>{
 const url=characterAssetUrl(path);if(!path.endsWith('.webp'))return Promise.reject(Error('人物图集路径无效'));
 if(signal?.aborted)return Promise.reject(signal.reason);
 const cached=atlasBlobs.get(path);if(cached)return Promise.resolve(touch(atlasBlobs,path,cached,ATLAS_BLOB_LIMIT));
 return sharedAssetRequest(blobPending,path,signal,async request=>{
  const release=await downloadQueue.acquire(request);
  try{
   const response=await fetch(url,{signal:request});if(!response.ok)throw Error(`人物图集读取失败（${response.status}）`);
   if(Number(response.headers.get('content-length'))>ATLAS_SINGLE_BLOB_BYTES)throw Error('人物图集文件超过预取上限');
   const blob=await response.blob();request.throwIfAborted();
   if(!blob.size||blob.size>ATLAS_SINGLE_BLOB_BYTES)throw Error('人物图集文件无效或超过预取上限');
   return keepBlob(path,blob);
  }finally{release();}
 });
}
/** Download compressed poses without evicting the visible decoded characters. */
export async function preloadCharacterAtlas(path:string,signal?:AbortSignal):Promise<void>{await atlasBlob(path,signal);}
/** At most 24 decoded atlases / 12 million pixels, with three concurrent decodes. */
export async function loadSpriteAtlas(path:string,signal?:AbortSignal):Promise<HTMLImageElement>{
 signal?.throwIfAborted();const url=characterAssetUrl(path),cached=atlasImages.get(path);if(cached)return touch(atlasImages,path,cached,ATLAS_CACHE_LIMIT);
 return sharedAssetRequest(atlasPending,path,signal,async request=>{
  const release=await decodeQueue.acquire(request);let objectUrl:string|undefined;
  try{
   const blob=atlasBlobs.get(path)??(blobPending.has(path)?await atlasBlob(path,request):undefined);
   if(blob){touch(atlasBlobs,path,blob,ATLAS_BLOB_LIMIT);objectUrl=URL.createObjectURL(blob);}
   const image=await decodeAssetImage(objectUrl??url,request);request.throwIfAborted();
   const imagePixels=image.naturalWidth*image.naturalHeight;if(!Number.isFinite(imagePixels)||imagePixels<=0||imagePixels>ATLAS_PIXEL_LIMIT){image.src='';throw Error('人物图集尺寸超过缓存上限');}
   touch(atlasImages,path,image,ATLAS_CACHE_LIMIT);let pixels=[...atlasImages.values()].reduce((n,im)=>n+im.naturalWidth*im.naturalHeight,0);
   while(pixels>ATLAS_PIXEL_LIMIT&&atlasImages.size>1){const key=atlasImages.keys().next().value!,old=atlasImages.get(key)!;pixels-=old.naturalWidth*old.naturalHeight;atlasImages.delete(key);}
   return image;
  }catch(error){if(!request.aborted)atlasBlobs.delete(path);throw error;}
  finally{if(objectUrl)URL.revokeObjectURL(objectUrl);release();}
 });
}
export const CHARACTER_PLACEHOLDER_URL='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="288" viewBox="0 0 144 288"><path d="M72 46l35 64-35 64-35-64z" fill="#29463c" stroke="#d7c794" stroke-width="4" stroke-dasharray="6 5"/><text x="72" y="120" text-anchor="middle" font-size="28" fill="#ead7a5">…</text><text x="72" y="213" text-anchor="middle" font-size="14" fill="#ead7a5">素材加载中</text></svg>');
