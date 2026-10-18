import type {AdventureApplication} from '../application';
import {escapeHtml as html} from './html';
export function renderMonsterEncounters(app:AdventureApplication,busy:boolean):string {
 return `<section class="monster-encounters"><h3>风蚀哨塔 · 魔物踪迹</h3><p class="panel-intro">靠近哨塔可唤醒魔物，再走近挑战。也可以绕开，继续旅程。</p><button data-route="watch" ${busy?'disabled':''}>前往风蚀哨塔</button><div class="adventure-choices">${app.queryMonsterEncounters().map(m=>`<button ${m.npcId&&m.alive?`data-seek-monster="${html(m.npcId)}"`:`data-reveal-monster="${m.id}"`} ${busy||!m.allowed&&!(m.npcId&&m.alive)?'disabled':''}><strong>${m.npcId?m.alive?'靠近':'已击退':'唤醒'} · ${m.name}</strong><small>${html(m.reason??'魔物将在附近现身，不会立即发起战斗。')}</small></button>`).join('')}</div></section>`;
}
