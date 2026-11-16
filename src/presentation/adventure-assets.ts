import {monsterModelFor,type AdventureSnapshot} from '../application';
import type {DeepReadonly} from '../contracts';
import {DEFAULT_CHARACTER_MODEL,readSelectedModel,stableNpcModel,loadModelCatalog,loadCharacterModel,loadSpriteAtlas,preloadCharacterAtlas,type ModelCatalog,type ModelManifest} from './external-character-models';
import {EFFECT_KINDS,loadCombatEffects,loadCombatEffectImage} from './combat-effect-assets';

type Snapshot=DeepReadonly<AdventureSnapshot>;
export interface AssetPreparationProgress {completed:number;total:number;label:string}
export interface CharacterPreparation {modelId:string;actions:number[];initialAction:number;player:boolean}
const PLAYER_ACTIONS=[0,1,3,5,6,8,9,10,16];
const BATTLE_ACTIONS=[0,1,3,5,6,8,9,10];

/** Only this run's visible cast and battle participants; no hidden actors or new RNG. */
export function planAdventureCharacters(s:Snapshot,catalog:ModelCatalog,selected=readSelectedModel()):CharacterPreparation[]{
 const ids=catalog.characters.map(c=>c.id).sort(),visible=new Set(s.runtime.visible);
 const battle=s.runtime.encounter?.status==='active'?s.runtime.encounter:undefined;
 const plans=new Map<string,CharacterPreparation>();
 const actors=Object.values(s.runtime.actors).sort((a,b)=>Number(b.actorId===s.playerActorId)-Number(a.actorId===s.playerActorId));
 for(const actor of actors){
  const player=actor.actorId===s.playerActorId,participant=battle?.participants.some(p=>p.actorId===actor.actorId);
  if(!player&&!participant&&!visible.has(`${Math.round(actor.position.x)},${Math.round(actor.position.y)}`))continue;
  const modelId=monsterModelFor(s,actor.actorId)??(player?(ids.includes(selected)?selected:DEFAULT_CHARACTER_MODEL):stableNpcModel(actor.actorId,ids));
  const actions=player?PLAYER_ACTIONS:participant?BATTLE_ACTIONS:[0,1,10,16],initialAction=actor.hp===0?10:0,old=plans.get(modelId);
  if(old){old.actions=[...new Set([...old.actions,...actions])];if(initialAction===10)old.initialAction=10;old.player||=player;}
  else plans.set(modelId,{modelId,actions:[...actions],initialAction,player});
 }
 return [...plans.values()];
}

/** Fit predecoded poses into the existing character LRU, leaving all other bytes compressed. */
export function planCharacterAtlases(plans:readonly CharacterPreparation[],models:ReadonlyMap<string,ModelManifest>){
 const downloads=new Map<string,{width:number;height:number}>(),initial=new Set<string>(),optional=new Set<string>();
 for(const p of plans){
  const model=models.get(p.modelId)!;
  for(const action of p.actions){
   const clips=Object.values(model.clips).filter(c=>c.actionId===action);
   for(const clip of clips){const atlas=model.atlases.find(a=>a.url===clip.atlasUrl)!;downloads.set(atlas.url,atlas);if(action===0||action===p.initialAction)initial.add(atlas.url);else if(p.player)optional.add(atlas.url);}
  }
 }
 const decode:string[]=[];let pixels=0;
 for(const path of [...initial,...optional]){
  if(decode.includes(path))continue;
  const a=downloads.get(path)!,size=a.width*a.height;
  if(decode.length>=24||pixels+size>12_000_000)continue;
  decode.push(path);pixels+=size;
 }
 return {downloads:[...downloads.keys()],decode,pixels};
}

export async function prepareAdventureAssets(s:Snapshot,signal:AbortSignal,onProgress:(p:AssetPreparationProgress)=>void,prepareWorld:(signal:AbortSignal)=>Promise<void>):Promise<void>{
 signal.throwIfAborted();onProgress({completed:0,total:0,label:'正在读取本次旅程所需素材'});
 const catalog=await loadModelCatalog(signal),plans=planAdventureCharacters(s,catalog),models=new Map<string,ModelManifest>();
 // Metadata is small, but keep concurrent network work bounded too.
 for(const plan of plans){signal.throwIfAborted();models.set(plan.modelId,await loadCharacterModel(plan.modelId,signal));}
 const atlasPlan=planCharacterAtlases(plans,models);
 const effects=await loadCombatEffects(signal);
 const decode=new Set(atlasPlan.decode);
 const jobs:{label:string;run:()=>Promise<void>}[]=[
  {label:'准备山谷场景',run:()=>prepareWorld(signal)},
  ...atlasPlan.downloads.map(path=>({label:'准备人物与常用动作',run:async()=>{await preloadCharacterAtlas(path,signal);if(decode.has(path))await loadSpriteAtlas(path,signal);}})),
  ...EFFECT_KINDS.map(kind=>({label:'准备战斗特效',run:()=>loadCombatEffectImage(kind,effects.effects[kind],signal)})),
 ];
 let completed=0,index=0,failed=0;
 onProgress({completed,total:jobs.length,label:'正在准备场景、人物与特效'});
 const worker=async()=>{
  while(index<jobs.length){
   signal.throwIfAborted();const job=jobs[index++];
   try{await job.run();completed++;}catch(error){if(signal.aborted)throw error;failed++;}
   signal.throwIfAborted();onProgress({completed,total:jobs.length,label:job.label});
  }
 };
 await Promise.all(Array.from({length:Math.min(3,jobs.length)},worker));
 if(failed)throw Error(`${failed}项素材尚未准备好`);
}
