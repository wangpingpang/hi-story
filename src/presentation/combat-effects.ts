import type {CombatEffect,CombatEffectKind} from '../application';
import {projectIso} from './isometric';
import {escapeHtml as html} from './html';
import {loadCombatEffects,loadCombatEffectImage,combatEffectFrame,type EffectManifest} from './combat-effect-assets';

const colors:Record<CombatEffectKind,string>={fire:'#ffad55',ice:'#a3e9ff',lightning:'#fff08f',wind:'#bcf8ce',arcane:'#c8afff',healing:'#a6edb3'};
const labels={hit:'命中',miss:'未命中',saved:'豁免成功',healing:'治疗'};
const LOAD_BUDGET_MS=2500;
const MAX_PLAYBACK_MS=1200;
const REDUCED_DURATION_MS=220;

export class CombatEffectsPresenter {
 private generation=0;
 private frame=0;
 private resolve?:()=>void;
 private host?:SVGGElement;
 private shell?:HTMLElement;
 private loading?:AbortController;

 async play(root:HTMLElement,effects:CombatEffect[],reduced:boolean):Promise<void>{
  this.cancel();
  if(!effects.length||document.hidden)return;
  const token=this.generation,controller=new AbortController();
  this.loading=controller;
  // Missing or stalled decorative assets must never hold up an already committed turn.
  const timeout=window.setTimeout(()=>controller.abort(),LOAD_BUDGET_MS);
  let manifest:EffectManifest;
  try{
   manifest=await loadCombatEffects(controller.signal);
   await Promise.all([...new Set(effects.map(e=>e.kind))].map(kind=>loadCombatEffectImage(kind,manifest.effects[kind],controller.signal)));
  }catch{controller.abort();return;}
  finally{window.clearTimeout(timeout);if(this.loading===controller)this.loading=undefined;}
  if(token!==this.generation||document.hidden)return;
  const scene=root.querySelector<SVGGElement>('[data-battle-scene]');
  if(!scene)return;
  const actorImages=new Map(Array.from(scene.querySelectorAll<SVGImageElement>('image[data-character]')).map(image=>[image.dataset.character,image]));
  const host=document.createElementNS('http://www.w3.org/2000/svg','g');
  host.classList.add('combat-effects');host.setAttribute('pointer-events','none');host.setAttribute('aria-label','已结算法术效果');scene.append(host);this.host=host;
  this.shell=root.querySelector<HTMLElement>('.adventure-shell')??undefined;
  this.shell?.classList.add('battle-effects-playing');
  await new Promise<void>(resolve=>{
   this.resolve=resolve;
   const started=performance.now(),duration=reduced?REDUCED_DURATION_MS:Math.max(...effects.map(e=>Math.min(MAX_PLAYBACK_MS,manifest.effects[e.kind].durationMs)));
   const paint=(now:number)=>{
    if(token!==this.generation)return;
    if(document.hidden||!host.isConnected){this.cancel();return;}
    const elapsed=Math.max(0,now-started);
    if(elapsed>=duration){this.cancel();return;}
    host.innerHTML=effects.map(effect=>{
     const a=manifest.effects[effect.kind],playbackDuration=Math.min(MAX_PLAYBACK_MS,a.durationMs);
     if(!reduced&&elapsed>=playbackDuration)return '';
     const to=projectIso(effect.to.x,effect.to.y),from=projectIso(effect.from.x,effect.from.y);
     const index=combatEffectFrame(a,elapsed*a.durationMs/playbackDuration,reduced),[fx,fy,w,h]=a.frames[index].rect,scale=a.displayHeight/h;
     // An evaded spell blooms beyond the target, never over its body.
     const miss=effect.outcome==='miss',side=to.x>=from.x?1:-1;
     const targetImage=actorImages.get(effect.targetId);
     const targetEdge=targetImage?(side>0?targetImage.x.baseVal.value+targetImage.width.baseVal.value:-targetImage.x.baseVal.value):32;
     const clearance=Math.max(a.pivot[0],w-a.pivot[0])*scale+Math.max(32,targetEdge)+16;
     const x=to.x+(miss?side*clearance:0),y=to.y+(a.anchor==='body'?-34:0)+(miss?-16:0);
     const fade=reduced?1:Math.min(1,(playbackDuration-elapsed)/100);
     const color=colors[effect.kind],opacity=(effect.outcome==='saved'?.55:miss?.7:1)*fade;
     return `<g data-combat-effect="${effect.kind}" data-effect-source="pixelfx" data-effect-frame="${index}" data-effect-outcome="${effect.outcome}"><g transform="translate(${x} ${y})" opacity="${opacity}"><svg x="${-a.pivot[0]*scale}" y="${-a.pivot[1]*scale}" width="${w*scale}" height="${h*scale}" viewBox="${fx} ${fy} ${w} ${h}" overflow="hidden"><image href="${html(import.meta.env.BASE_URL+a.url)}" width="${a.width}" height="${a.height}" style="image-rendering:pixelated"/></svg></g><ellipse cx="${to.x}" cy="${to.y+4}" rx="24" ry="9" fill="none" stroke="${color}" stroke-width="${effect.outcome==='hit'||effect.outcome==='healing'?2:1}" ${effect.outcome==='saved'||miss?'stroke-dasharray="3 4"':''}/><text x="${to.x}" y="${to.y-84}" text-anchor="middle" fill="${color}" font-size="11">${labels[effect.outcome]}</text></g>`;
    }).join('');
    this.frame=requestAnimationFrame(paint);
   };
   paint(started);
  });
 }

 cancel(){
  this.generation++;
  this.loading?.abort();this.loading=undefined;
  cancelAnimationFrame(this.frame);
  this.host?.remove();this.host=undefined;
  this.shell?.classList.remove('battle-effects-playing');this.shell=undefined;
  this.resolve?.();this.resolve=undefined;
 }
}
