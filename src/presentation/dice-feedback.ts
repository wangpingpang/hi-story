import type {DiceFeedback} from '../application';
import {escapeHtml as html} from './html';
import './dice-feedback.css';
export type DiceTheme='jade'|'ivory'|'obsidian';
export interface DicePreferences {theme:DiceTheme;sound:boolean}
export const DICE_PREFERENCE_KEY='hi-story:dice:ui/1';
export function readDicePreferences():DicePreferences {try{const v=JSON.parse(localStorage.getItem(DICE_PREFERENCE_KEY)??'{}');return {theme:['jade','ivory','obsidian'].includes(v.theme)?v.theme:'jade',sound:v.sound===true};}catch{return {theme:'jade',sound:false};}}
export function saveDicePreferences(p:DicePreferences):void {try{localStorage.setItem(DICE_PREFERENCE_KEY,JSON.stringify(p));}catch{/* Presentation settings are optional. */}}
export function selectedDice(f:DiceFeedback):boolean[]{if(f.mode==='normal')return f.dice.map(()=>true);const value=f.mode==='advantage'?Math.max(...f.dice):Math.min(...f.dice),index=f.dice.indexOf(value);return f.dice.map((_,i)=>i===index);}
export function feedbackVerdict(f:DiceFeedback):string {if(f.kind==='attack'&&f.critical)return '重击';if(f.kind==='healing')return '治疗结算';if(f.kind==='damage')return f.critical?'重击伤害':'伤害结算';if(f.success!==undefined)return f.success?'检定成功':'检定失败';return f.kind==='movement'?'移动已就绪':'先攻已确定';}
export function feedbackFormula(f:DiceFeedback):string {const selected=selectedDice(f),dice=f.dice.filter((_,i)=>selected[i]).join(' + '),bonus=f.bonuses.map(b=>`${b.value<0?'−':'+'} ${Math.abs(b.value)}（${b.label}）`).join(' ');return `${dice} ${bonus} = ${f.total}${f.threshold?` / ${f.threshold.label} ${f.threshold.value}`:''}`;}
export function dieMarkup(sides:4|6|8|10|12|20,value:number|null):string {
 const label=value===null?`D${sides}，投掷中`:`D${sides}，点数 ${value}`;
 const shape=sides===4?'<path class="die-base" d="M60 8 112 105H8Z"/><path class="die-edge" d="M60 8 60 77 8 105M60 77 112 105"/>':sides!==6?'<path class="die-base" d="m60 5 49 29v53l-49 28L11 87V34Z"/><path class="die-edge" d="m60 5-27 40 54 0ZM11 34l22 11-22 42m98-53L87 45l22 42M11 87l49 7 49-7M33 45 60 94l27-49M60 94v21"/>':'<rect class="die-base" x="14" y="14" width="92" height="92" rx="21"/><rect class="die-edge" x="23" y="23" width="74" height="74" rx="14"/>';
 const positions:Record<number,number[][]>={1:[[60,60]],2:[[40,40],[80,80]],3:[[40,40],[60,60],[80,80]],4:[[40,40],[80,40],[40,80],[80,80]],5:[[40,40],[80,40],[60,60],[40,80],[80,80]],6:[[40,37],[80,37],[40,60],[80,60],[40,83],[80,83]]};
 const mark=sides===6&&value!==null?(positions[value]??[]).map(([x,y])=>`<circle class="die-pip" cx="${x}" cy="${y}" r="6"/>`).join(''):`<text x="60" y="${sides===4?78:70}" text-anchor="middle">${value??'?'}</text>`;
 return `<svg class="die-svg die-d${sides}" viewBox="0 0 120 120" role="img" aria-label="${label}">${shape}${mark}</svg>`;
}
export function dicePreferenceMarkup(p:DicePreferences):string{return `<fieldset class="dice-preferences"><legend>骰子与反馈</legend><div class="dice-themes">${(['jade','ivory','obsidian'] as const).map(theme=>`<button type="button" data-dice-theme="${theme}" aria-pressed="${p.theme===theme}"><i class="theme-dot ${theme}"></i>${({jade:'翠玉',ivory:'骨白',obsidian:'黑曜'} as const)[theme]}</button>`).join('')}</div><label><input type="checkbox" id="dice-sound" ${p.sound?'checked':''}> 骰子音效</label><small>音效默认关闭；跟随系统的减少动态效果设置。</small></fieldset>`;}
export function compactFeedbackMarkup(f:DiceFeedback):string{return `<div class="dice-result ${f.success===false?'failed':'success'}" aria-label="最近检定"><b>D${f.sides}</b><span>${html(feedbackFormula(f))}<small>${html(f.label)} · ${feedbackVerdict(f)}</small></span><button id="dice-review" aria-label="回看最近骰子结果">回看</button></div>`;}
type Phase='rolling'|'landed'|'result';
/** A cancellable view of already committed facts. No commands or random calls. */
export class DiceFeedbackPresenter {
 private host=document.createElement('div');private generation=0;private active=false;private frames:DiceFeedback[]=[];private index=0;private phase:Phase='rolling';private summary=false;private skipped=false;
 private pending?:{timer?:ReturnType<typeof setTimeout>;resolve:()=>void};private focusBefore?:HTMLElement;private context?:AudioContext;private prefs:DicePreferences;private focusOnRender=false;
 private onScroll=()=>this.position();
 constructor(private root:HTMLElement,prefs:DicePreferences){this.prefs={...prefs};this.host.className='dice-feedback-host';this.host.setAttribute('role','dialog');this.host.setAttribute('aria-label','骰子检定反馈');this.root.addEventListener('scroll',this.onScroll,true);this.host.addEventListener('click',e=>{const target=(e.target as Element).closest<HTMLButtonElement>('button');if(target?.dataset.diceAction==='skip'){this.focusOnRender=true;this.skipped=true;this.release();}if(target?.dataset.diceAction==='close'){this.cancel();}});this.host.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(this.summary)this.cancel();else{this.focusOnRender=true;this.skipped=true;this.release();}}});}
 setPreferences(p:DicePreferences){this.prefs={...p};}
 primeAudio():void {if(!this.prefs.sound)return;try{this.context??=new AudioContext();void this.context.resume().catch(()=>{});}catch{/* Silent fallback. */}}
 private sound(result:boolean):void {if(!this.prefs.sound||!this.context||this.context.state!=='running')return;try{const c=this.context,o=c.createOscillator(),gain=c.createGain();o.type='sine';o.frequency.setValueAtTime(result?660:190,c.currentTime);o.frequency.exponentialRampToValueAtTime(result?880:110,c.currentTime+.12);gain.gain.setValueAtTime(.035,c.currentTime);gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+.18);o.connect(gain).connect(c.destination);o.start();o.stop(c.currentTime+.2);}catch{/* Sound cannot block playback. */}}
 attach():void {if(this.active){this.root.append(this.host);this.position();}}
 private position():void {
  const panels=[...this.host.querySelectorAll<HTMLElement>('.dice-actor-panel')],narrow=innerWidth<=700;
  const left=this.root.querySelector<HTMLElement>('[data-roster-side="ally"]')?.getBoundingClientRect(),right=this.root.querySelector<HTMLElement>('[data-roster-side="enemy"]')?.getBoundingClientRect();
  const start=Math.min(left?.top??110,right?.top??110)+40;const gap=narrow?6:10,lane=left&&right?right.left-left.right-2*gap:innerWidth-40,width=Math.max(110,Math.min(narrow?176:244,lane)),limit=Math.max(120,Math.min(narrow?224:360,(innerHeight-start-10-8*(panels.length-1))/Math.max(1,panels.length)));
  const placed:{left:number;right:number;top:number;bottom:number}[]=[];
  for(const panel of panels){
   const side=panel.dataset.side,anchor=[...this.root.querySelectorAll<HTMLElement>('[data-roster-actor]')].find(el=>el.dataset.rosterActor===panel.dataset.diceActor)?.getBoundingClientRect(),roster=side==='enemy'?right:left;
   panel.style.width=`${width}px`;panel.style.maxHeight=`${limit}px`;
   const x=Math.max(8,Math.min(innerWidth-width-8,side==='enemy'?(roster?.left??innerWidth-20)-gap-width:(roster?.right??20)+gap));
   let y=Math.max(76,anchor?.top??roster?.top??110),height=Math.min(panel.scrollHeight,limit);
   for(const old of placed)if(x<old.right+gap&&x+width>old.left-gap&&y<old.bottom+8&&y+height>old.top-8)y=old.bottom+8;
   y=Math.min(y,innerHeight-height-10);panel.style.left=`${x}px`;panel.style.top=`${Math.max(8,y)}px`;placed.push({left:x,right:x+width,top:y,bottom:y+height});
  }
 }
 private release():void {const p=this.pending;this.pending=undefined;if(p){if(p.timer!==undefined)clearTimeout(p.timer);p.resolve();}}
 private wait(ms?:number):Promise<void>{return new Promise(resolve=>{const timer=ms===undefined?undefined:setTimeout(()=>{this.pending=undefined;resolve();},ms);this.pending={resolve,timer};});}
 private render():void {
  const current=this.frames[this.index],all=this.summary,frames=all?this.frames:[current],focused=this.host.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.diceAction:undefined;this.host.dataset.theme=this.prefs.theme;this.host.dataset.phase=this.phase;
  const groups=new Map<string,DiceFeedback[]>();for(const f of frames){const group=groups.get(f.actorId)??[];group.push(f);groups.set(f.actorId,group);}
  const ordered=[...groups].sort((a,b)=>Number(a[1][0].side==='enemy')-Number(b[1][0].side==='enemy'));
  this.host.innerHTML=ordered.map(([actorId,rolls],i)=>`<section class="dice-modal dice-actor-panel ${all?'dice-summary':''}" role="group" aria-label="${html(rolls[0].actorName)}的骰子" data-dice-actor="${html(actorId)}" data-side="${rolls[0].side}"><header><div><span class="dice-eyebrow">${rolls[0].side==='enemy'?'敌方':'队友'}掷骰 · ${all?'本次全部结果':`${this.index+1} / ${this.frames.length}`}</span><h2>${html(rolls[0].actorName)}</h2></div><button data-dice-action="close" aria-label="关闭本次骰子结果">×</button></header><div class="dice-cards">${rolls.map(f=>this.card(f,all?'result':this.phase,all||this.index===this.frames.length-1)).join('')}</div><footer>${all?(i===0?'<button data-dice-action="close">继续冒险</button>':''):'<button data-dice-action="skip">跳过动画</button>'}<small>${all?'结果保留，手动关闭':'已结算 · 可随时关闭'}</small></footer></section>`).join('');
  this.attach();if(this.focusOnRender||focused){const button=this.host.querySelector<HTMLButtonElement>(`[data-dice-action="${focused??'close'}"]`)??this.host.querySelector<HTMLButtonElement>('[data-dice-action="close"]');button?.focus({preventScroll:true});this.focusOnRender=false;}
 }
 private card(f:DiceFeedback,phase:Phase,effects:boolean):string {
  const reveal=phase!=='rolling',result=phase==='result',selected=selectedDice(f),tone=result?(f.success===false?'failure':f.critical?'critical':'success'):'neutral';
  let detail='';if(result&&f.threshold){const margin=f.total-f.threshold.value;detail=f.kind==='attack'&&f.dice[0]===1?'自然 1：攻击必失':f.kind==='attack'&&f.critical?'自然 20：攻击必命中，伤害骰翻倍':`${margin>=0?'达到难度，超出':'未达到难度，还差'} ${Math.abs(margin)} 点`;}
  return `<article class="dice-card ${tone}" data-roll-id="${html(f.id)}" data-kind="${f.kind}"><p class="dice-actor">${html(f.actorName)} · ${html(f.label)}${f.targetName?` → ${html(f.targetName)}`:''}</p><div class="dice-tray ${phase}">${f.dice.map((v,i)=>`<div class="die-wrap ${reveal&&!selected[i]?'discarded':''}" style="--die-index:${i}">${dieMarkup(f.sides,reveal?v:null)}<small>${reveal&&f.mode!=='normal'?(selected[i]?'采用':'舍弃'):`D${f.sides}`}</small></div>`).join('')}</div>${f.mode!=='normal'?`<p class="dice-mode">${f.mode==='advantage'?'优势 · 取较高值':'劣势 · 取较低值'}</p>`:''}<div class="dice-outcome" role="status" aria-live="polite">${result?`<h3><span aria-hidden="true">${f.success===false?'×':f.critical?'✦':'✓'}</span> ${feedbackVerdict(f)}</h3><p class="dice-formula">${html(feedbackFormula(f))}</p>${detail?`<p>${detail}</p>`:''}${f.kind==='damage'?'<small>重击仅翻倍伤害骰，加值只计算一次。</small>':''}${effects&&f.consequences.length?`<ul class="dice-consequences" aria-label="本次行动后果">${f.consequences.map(t=>`<li>${html(t)}</li>`).join('')}</ul>`:''}`:`<p>${phase==='rolling'?'骰子正在翻滚…':'点数已落定…'}</p>`}</div></article>`;
 }
 async play(frames:DiceFeedback[],review=false):Promise<void>{
  if(!frames.length)return;this.cancel(false);const token=++this.generation;this.active=true;this.frames=structuredClone(frames);this.index=0;this.phase='rolling';this.summary=false;this.skipped=false;this.focusOnRender=true;this.focusBefore=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{
   if(review||reduced){this.summary=true;this.phase='result';this.render();await this.wait();}
   else for(this.index=0;this.index<this.frames.length;this.index++){
    this.phase='rolling';this.render();await this.wait(760);if(token!==this.generation)return;if(this.skipped)break;
    this.phase='landed';this.render();await this.wait(260);if(token!==this.generation)return;if(this.skipped)break;
    this.phase='result';this.sound(this.frames[this.index].success!==false);this.render();if(this.index<this.frames.length-1)await this.wait(850);if(token!==this.generation)return;if(this.skipped)break;
   }
   if(token!==this.generation)return;
   this.summary=true;this.phase='result';this.render();await this.wait();
  }finally{if(token===this.generation)this.cancel();}
 }
 cancel(restoreFocus=true):void {this.generation++;this.release();this.active=false;this.host.remove();if(restoreFocus){const target=this.focusBefore?.isConnected?this.focusBefore:this.root.querySelector<HTMLElement>('#adventure-map');target?.focus({preventScroll:true});}this.focusBefore=undefined;}
 dispose():void {this.cancel(false);this.root.removeEventListener('scroll',this.onScroll,true);void this.context?.close().catch(()=>{});}
}
