import type {CombatEffectKind} from '../application';

export const EFFECT_KINDS: readonly CombatEffectKind[] = ['fire','ice','lightning','wind','arcane','healing'];
export interface EffectAsset {
 url:string;
 width:number;
 height:number;
 frames:{rect:[number,number,number,number];durationMs:number}[];
 pivot:[number,number];
 anchor:'ground'|'body';
 displayHeight:number;
 previewFrame:number;
 durationMs:number;
}
export interface EffectManifest {
 version:'pixelfx-combat-assets/1';
 effects:Record<CombatEffectKind,EffectAsset>;
}

/** Validate the offline atlas contract before creating any image or SVG element. */
export function validateCombatEffectManifest(value:unknown):EffectManifest {
 const m=value as EffectManifest;
 if(!m||m.version!=='pixelfx-combat-assets/1'||!m.effects||Object.keys(m.effects).length!==EFFECT_KINDS.length)throw Error('特效目录无效');
 for(const kind of EFFECT_KINDS){
  const a=m.effects[kind];
  if(!a||a.url!==`assets/effects/pixelfx/${kind}.webp`||!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<=0||a.height<=0||a.width>4096||a.height>4096||a.width*a.height>4_000_000)throw Error('特效素材引用无效');
  if(!Array.isArray(a.frames)||!a.frames.length||a.frames.length>240)throw Error('特效帧无效');
  let total=0;
  for(const f of a.frames){
   if(!f||!Array.isArray(f.rect)||f.rect.length!==4)throw Error('特效帧无效');
   const [x,y,w,h]=f.rect;
   if(!f.rect.every(Number.isInteger)||x<0||y<0||w<=0||h<=0||x+w>a.width||y+h>a.height||!Number.isFinite(f.durationMs)||f.durationMs<=0)throw Error('特效帧无效');
   if(w!==a.frames[0].rect[2]||h!==a.frames[0].rect[3])throw Error('特效帧画布不一致');
   total+=f.durationMs;
  }
  const [, ,w,h]=a.frames[0].rect;
  if(!Array.isArray(a.pivot)||a.pivot.length!==2||!a.pivot.every(Number.isFinite)||a.pivot[0]<0||a.pivot[0]>w||a.pivot[1]<0||a.pivot[1]>h)throw Error('特效锚点无效');
  if(!['ground','body'].includes(a.anchor)||!Number.isFinite(a.displayHeight)||a.displayHeight<24||a.displayHeight>144||!Number.isInteger(a.previewFrame)||a.previewFrame<0||a.previewFrame>=a.frames.length)throw Error('特效显示参数无效');
  if(!Number.isFinite(a.durationMs)||Math.abs(a.durationMs-total)>.01||total>5000)throw Error('特效时长无效');
 }
 return m;
}

/** Play the original sequence once; reduced motion uses a measured visible frame. */
export function combatEffectFrame(asset:EffectAsset,elapsed:number,reduced=false):number {
 if(reduced)return asset.previewFrame;
 let at=Math.max(0,elapsed);
 for(let i=0;i<asset.frames.length-1;i++){
  if(at<asset.frames[i].durationMs)return i;
  at-=asset.frames[i].durationMs;
 }
 return asset.frames.length-1;
}

let cached:EffectManifest|undefined;
export async function loadCombatEffects(signal:AbortSignal):Promise<EffectManifest> {
 signal.throwIfAborted();
 if(cached)return cached;
 const response=await fetch(`${import.meta.env.BASE_URL}assets/effects/pixelfx/manifest.json`,{signal});
 if(!response.ok)throw Error('特效目录读取失败');
 const manifest=validateCombatEffectManifest(await response.json());
 signal.throwIfAborted();
 cached=manifest;
 return manifest;
}

const images=new Map<CombatEffectKind,HTMLImageElement>();
export function loadCombatEffectImage(kind:CombatEffectKind,asset:EffectAsset,signal:AbortSignal):Promise<void> {
 signal.throwIfAborted();
 if(images.has(kind))return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const image=new Image();
  const cleanup=()=>{image.onload=null;image.onerror=null;signal.removeEventListener('abort',abort);};
  const fail=(error:unknown)=>{cleanup();image.src='';reject(error);};
  const abort=()=>fail(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  image.onerror=()=>fail(Error('特效图像读取失败'));
  image.onload=()=>{
   void image.decode().then(()=>{
    if(signal.aborted)return;
    if(image.naturalWidth!==asset.width||image.naturalHeight!==asset.height){fail(Error('特效图集尺寸不符'));return;}
    cleanup();images.set(kind,image);resolve();
   },fail);
  };
  image.src=import.meta.env.BASE_URL+asset.url;
 });
}
