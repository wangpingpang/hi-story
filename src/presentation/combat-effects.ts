import type {CombatEffect,CombatEffectKind} from '../application';
import {projectIso} from './isometric';
import {escapeHtml as html} from './html';

interface EffectAsset {url:string;width:number;height:number;frames:{rect:[number,number,number,number];durationMs:number}[]}
interface EffectManifest {version:string;effects:Record<string,EffectAsset>}
let pending:Promise<EffectManifest>|undefined;
export function loadCombatEffects():Promise<EffectManifest>{
 if(pending)return pending;
 pending=fetch(`${import.meta.env.BASE_URL}assets/effects/spells/manifest.json`,{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('特效目录读取失败');const m=await r.json() as EffectManifest;if(m.version!=='combat-spell-assets/1')throw Error('特效目录无效');for(const a of Object.values(m.effects)){if(!/^assets\/effects\/spells\/[a-z]+\.webp$/.test(a.url)||!a.frames.length||a.width<=0||a.height<=0||a.width*a.height>2_000_000)throw Error('特效素材引用无效');for(const f of a.frames){const [x,y,w,h]=f.rect;if(![x,y,w,h,f.durationMs].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>a.width||y+h>a.height||f.durationMs<=0)throw Error('特效帧无效');}}return m;}).catch(e=>{pending=undefined;throw e;});return pending;
}
const colors:Record<CombatEffectKind,string>={fire:'#ffad55',ice:'#a3e9ff',lightning:'#fff08f',wind:'#bcf8ce',arcane:'#c8afff',healing:'#a6edb3'};
const labels={hit:'命中',miss:'未命中',saved:'豁免成功',healing:'治疗'};
export class CombatEffectsPresenter {
 private generation=0;private frame=0;private resolve?:()=>void;private host?:SVGGElement;private shell?:HTMLElement;
 async play(root:HTMLElement,effects:CombatEffect[],reduced:boolean):Promise<void>{
  this.cancel();if(!effects.length)return;const token=this.generation;
  let manifest:EffectManifest;try{manifest=await loadCombatEffects();await Promise.all([...new Set(effects.filter(e=>e.kind!=='healing').map(e=>e.kind))].map(async kind=>{const im=new Image();im.src=import.meta.env.BASE_URL+manifest.effects[kind].url;await im.decode();}));}catch{return;}
  if(token!==this.generation||document.hidden)return;
  const scene=root.querySelector<SVGGElement>('[data-battle-scene]');if(!scene)return;
  const host=document.createElementNS('http://www.w3.org/2000/svg','g');host.classList.add('combat-effects');host.setAttribute('pointer-events','none');host.setAttribute('aria-label','已结算法术效果');scene.append(host);this.host=host;
  this.shell=root.querySelector<HTMLElement>('.adventure-shell')??undefined;this.shell?.classList.add('battle-effects-playing');
  await new Promise<void>(resolve=>{this.resolve=resolve;const started=performance.now(),duration=reduced?220:850;
   const paint=(now:number)=>{
    if(token!==this.generation)return;if(document.hidden||!host.isConnected){this.cancel();return;}
    const t=Math.min(1,(now-started)/duration);
    host.innerHTML=effects.map(effect=>{
     const from=projectIso(effect.from.x,effect.from.y),to=projectIso(effect.to.x,effect.to.y),travel=reduced?1:Math.min(1,t/.7),offset=effect.outcome==='miss'?{x:24,y:-18}:{x:0,y:0},x=from.x+(to.x+offset.x-from.x)*travel,y=from.y+(to.y+offset.y-from.y)*travel-38,color=colors[effect.kind],opacity=t>.85?(1-t)/.15:1;
     if(effect.kind==='healing')return `<g data-combat-effect="healing" data-effect-outcome="healing" transform="translate(${to.x} ${to.y-36})" opacity="${opacity}"><ellipse cy="30" rx="${20+t*12}" ry="10" fill="none" stroke="${color}" stroke-width="3"/><path d="M-3 -16h6v12h12v6H3v12h-6V2h-12v-6h12z" fill="${color}"/><text y="-25" text-anchor="middle" fill="${color}" font-size="11">治疗</text></g>`;
     const a=manifest.effects[effect.kind],total=a.frames.reduce((sum,f)=>sum+f.durationMs,0);let at=reduced?0:(now-started)%total,index=0;while(index<a.frames.length-1&&at>=a.frames[index].durationMs){at-=a.frames[index++].durationMs;}const [fx,fy,w,h]=a.frames[index].rect,scale=effect.kind==='wind'||effect.kind==='arcane'?3:2;
     const angle=Math.atan2(to.y+offset.y-from.y,to.x+offset.x-from.x)*180/Math.PI;
     return `<g data-combat-effect="${effect.kind}" data-effect-outcome="${effect.outcome}" opacity="${opacity}"><g transform="translate(${x} ${y}) rotate(${angle})"><svg x="${-w*scale/2}" y="${-h*scale/2}" width="${w*scale}" height="${h*scale}" viewBox="${fx} ${fy} ${w} ${h}" overflow="hidden"><image href="${html(import.meta.env.BASE_URL+a.url)}" width="${a.width}" height="${a.height}" style="image-rendering:pixelated"/></svg></g>${travel>=1?`<ellipse cx="${to.x}" cy="${to.y+4}" rx="${16+t*14}" ry="9" fill="none" stroke="${color}" stroke-width="${effect.outcome==='hit'?3:1}" ${effect.outcome!=='hit'?'stroke-dasharray="3 4"':''}/><text x="${to.x}" y="${to.y-80}" text-anchor="middle" fill="${color}" font-size="11">${labels[effect.outcome]}</text>`:''}</g>`;
    }).join('');if(t>=1)this.cancel();else this.frame=requestAnimationFrame(paint);
   };paint(started);
  });
 }
 cancel(){this.generation++;cancelAnimationFrame(this.frame);this.host?.remove();this.host=undefined;this.shell?.classList.remove('battle-effects-playing');this.shell=undefined;this.resolve?.();this.resolve=undefined;}
}
