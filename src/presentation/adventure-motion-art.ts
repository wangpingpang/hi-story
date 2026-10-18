import {AdventureMotion} from '../application/adventure-motion';
import type {AdventureSnapshot} from '../application';
import type {DeepReadonly} from '../contracts';
import {DEFAULT_CHARACTER_MODEL,CHARACTER_PLACEHOLDER_URL,SPRITE_DIRECTIONS,loadModelCatalog,loadCharacterModel,loadSpriteAtlas,peekModelCatalog,peekCharacterModel,peekSpriteAtlas,resolveClipFrame,mapGameAction,readSelectedModel,stableNpcModel,normalizedSpriteGeometry} from './external-character-models';
/** One imported visual identity for the map, tactical scene and portraits. No legacy rig fallback. */
export class AdventureMotionArt {
 readonly motion=new AdventureMotion();
 ready=false;
 private playerId='';private runId='';
 private frames=new Map<string,{image:HTMLCanvasElement;pivot:[number,number]}>();
 private urls=new WeakMap<HTMLCanvasElement,string>();
 private portraits=new Map<string,string>();
 private pending=new Set<string>();private failures=new Map<string,number>();
 private placeholder?:HTMLCanvasElement;
 constructor(){this.ensure('catalog',()=>loadModelCatalog().then(()=>{this.ready=true;}));}
 private ensure(key:string,load:()=>Promise<unknown>){
  if(this.pending.has(key)||(this.failures.get(key)??0)>performance.now())return;
  this.pending.add(key);void load().then(()=>{this.failures.delete(key);}).catch(()=>{this.failures.set(key,performance.now()+5000);}).finally(()=>{this.pending.delete(key);});
 }
 observe(s:DeepReadonly<AdventureSnapshot>){if(s.runId!==this.runId){this.reset();this.runId=s.runId;}this.playerId=s.playerActorId;this.motion.observe(s,performance.now());}
 modelId(actorId:string){
  const catalog=peekModelCatalog();if(!catalog){this.ensure('catalog',()=>loadModelCatalog().then(()=>{this.ready=true;}));return DEFAULT_CHARACTER_MODEL;}
  const ids=catalog.characters.map(c=>c.id).sort();return actorId===this.playerId?(ids.includes(readSelectedModel())?readSelectedModel():DEFAULT_CHARACTER_MODEL):stableNpcModel(actorId,ids);
 }
 private missing(){
  if(this.placeholder)return this.placeholder;const image=document.createElement('canvas');image.width=image.height=384;const c=image.getContext('2d')!;c.strokeStyle='#e6d0a2';c.fillStyle='#213d35';c.lineWidth=4;c.setLineDash([9,8]);c.beginPath();c.moveTo(192,100);c.lineTo(240,205);c.lineTo(192,310);c.lineTo(144,205);c.closePath();c.fill();c.stroke();c.setLineDash([]);c.fillStyle='#ead8af';c.font='48px system-ui';c.textAlign='center';c.fillText('…',192,218);this.placeholder=image;return image;
 }
 private sprite(id:string,actionId:number,directionId:number,time:number,loop:boolean){
  const manifest=peekCharacterModel(id);if(!manifest){this.ensure(`model:${id}`,()=>loadCharacterModel(id));return;}
  const resolved=resolveClipFrame(manifest,actionId,directionId,time,loop),key=`${id}:${resolved.actionId}:${resolved.directionId}:${resolved.frameIndex}`;
  const cached=this.frames.get(key);if(cached){this.frames.delete(key);this.frames.set(key,cached);return {...cached,resolved};}
  const atlas=peekSpriteAtlas(resolved.atlasUrl);if(!atlas){this.ensure(resolved.atlasUrl,()=>loadSpriteAtlas(resolved.atlasUrl));return;}
  const {rect:[x,y,w,h]}=resolved.frame,geometry=normalizedSpriteGeometry(resolved.frame,manifest.standHeight!);
  const image=document.createElement('canvas');image.width=geometry.width;image.height=geometry.height;const c=image.getContext('2d')!;c.imageSmoothingEnabled=false;
  c.drawImage(atlas,x,y,w,h,...geometry.target);const value={image,pivot:geometry.pivot};this.frames.set(key,value);while(this.frames.size>48)this.frames.delete(this.frames.keys().next().value!);
  return {...value,resolved};
 }
 frame(actorId:string,now:number,weather='sun',running?:{direction:typeof SPRITE_DIRECTIONS[number];elapsedMs:number}){
  const f=this.motion.frame(actorId,now,weather==='snow'?'cold':weather==='mist'?'dark':'normal');if(!f)return;
  const direction=running?.direction??f.direction,modelId=this.modelId(actorId),mapped=running?{id:3,loop:true,substitute:false,holdLast:false}:mapGameAction(f.action),manifest=peekCharacterModel(modelId),directionId=SPRITE_DIRECTIONS.indexOf(direction),duration=manifest?.clips[`${mapped.id}:${directionId}`]?.durationMs??1000;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,time=mapped.holdLast?duration:reduced?0:running?running.elapsedMs:mapped.loop?now:f.progress*duration;
  const sprite=this.sprite(modelId,mapped.id,directionId,time,mapped.loop),failed=[`model:${modelId}`,'catalog',manifest?.clips[`${mapped.id}:${directionId}`]?.atlasUrl??''].some(key=>this.failures.has(key));
  return {image:sprite?.image??this.missing(),pivot:sprite?.pivot??[192,329] as [number,number],action:running?'run':f.action,direction,expression:f.expression,modelId,sourceAction:sprite?.resolved.actionId??mapped.id,substitute:mapped.substitute||sprite?.resolved.fallback===true,status:sprite?'ready':failed?'error':'loading'};
 }
 url(image:HTMLCanvasElement){let url=this.urls.get(image);if(!url){url=image.toDataURL('image/png');this.urls.set(image,url);}return url;}
 portrait(actorId:string){
  const id=this.modelId(actorId),cached=this.portraits.get(id);if(cached)return cached;const sprite=this.sprite(id,0,5,0,true);if(!sprite)return CHARACTER_PLACEHOLDER_URL;
  const image=document.createElement('canvas');image.width=144;image.height=288;const scale=Math.min(1,136/sprite.image.width);image.getContext('2d')!.drawImage(sprite.image,72-sprite.pivot[0]*scale,264-sprite.pivot[1]*scale,sprite.image.width*scale,sprite.image.height*scale);const url=image.toDataURL('image/png');this.portraits.set(id,url);if(this.portraits.size>28)this.portraits.delete(this.portraits.keys().next().value!);return url;
 }
 portraitStatus(actorId:string){const id=this.modelId(actorId);if(this.portraits.has(id))return 'ready';const path=peekCharacterModel(id)?.clips['0:5']?.atlasUrl;return this.failures.has('catalog')||this.failures.has(`model:${id}`)||!!path&&this.failures.has(path)?'error':'loading';}
 reset(){this.frames.clear();this.portraits.clear();this.urls=new WeakMap();}
}
