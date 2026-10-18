import type {DeepReadonly} from '../contracts';
import type {AdventureSnapshot} from '../application';
import {escapeHtml as html} from './html';

export function renderBattleRoster(s:DeepReadonly<AdventureSnapshot>,portrait:(id:string)=>string,resourceName:(id:string)=>string):string {
 const battle=s.runtime.encounter!;
 return `<aside class="battle-roster" aria-label="战斗成员"><h2>战斗成员 <small>第 ${battle.round} 回合</small></h2>${battle.participants.map(p=>{const a=s.runtime.actors[p.actorId],player=a.actorId===s.playerActorId;return `<article data-roster-actor="${html(a.actorId)}" class="battle-member ${player?'battle-member-player':''} ${a.hp===0?'battle-member-down':''}"><img data-actor-portrait="${html(a.actorId)}" src="${portrait(a.actorId)}" alt="${html(a.profile.name)}"><div><strong>${html(a.profile.name)}</strong><span>${player?'你':'敌方'} · ${a.hp===0?'倒下':`生命 ${a.hp}/${a.maxHp}`}</span><div class="hp-bar"><i style="width:${a.hp/a.maxHp*100}%"></i></div><small>先攻 ${p.initiative}${player&&battle.guard?' · 防御 +2':''}</small>${a.profession?`<small>${Object.entries(a.profession.resources).map(([id,n])=>`${html(resourceName(id))} ${n}`).join(' · ')}</small>`:''}</div></article>`;}).join('')}</aside>`;
}
export function renderBattleLog(s:DeepReadonly<AdventureSnapshot>,collapsed:boolean):string {
 const logs=s.runtime.encounter!.log;
 return `<section class="battle-journal" aria-label="战斗日志"><header><h2>战斗日志 <small>最近 ${Math.min(40,logs.length)} 条</small></h2><button id="battle-log-toggle" aria-expanded="${!collapsed}" aria-label="${collapsed?'展开':'收起'}战斗日志">${collapsed?'＋':'−'}</button></header><div class="battle-log-scroll" ${collapsed?'hidden':''}><ol class="battle-log" role="log" aria-live="polite" aria-relevant="additions">${logs.slice(-40).map(t=>`<li>${html(t)}</li>`).join('')||'<li>战斗开始。</li>'}</ol></div></section>`;
}
