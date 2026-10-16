import { ACTIONS, DIRECTIONS, WEAPONS, SPELLS, EXPRESSIONS, appearanceCatalogFor, type Appearance } from '../application/character-motion';
import { createCharacterVisualFrame, validateCharacterVisualFrame, type VisualActor, type VisualPose, type CharacterVisualFrame } from '../application/character-visuals';
import { loadCharacterVisuals, renderCharacterVisualFrame, type CharacterRenderer } from './character-visuals';
import sample from '../../docs/examples/character-pixel-v1/character.json';
import { escapeHtml } from './html';
import './character-pixel-demo.css';

const root = document.querySelector<HTMLElement>('#app')!;
const options = (entries: readonly (readonly [string, string])[]) => entries.map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('');
const catalog = appearanceCatalogFor('appearance/3');
const appUrl = import.meta.env.DEV ? './' : '../';
root.innerHTML = `<header><a href="${appUrl}">hi—story</a><span>人物动作样板 / 01</span><a href="${appUrl}?view=character-motion">原动作工坊 ↗</a></header>
<main><div class="pixel-intro"><p>CHARACTER STUDY</p><h1>先让一个人，活起来。</h1><p>同一人物、同一套部件，检视站姿、步态与动作节奏。</p></div>
<div class="pixel-layout"><section class="pixel-preview" aria-label="人物预览"><div class="pixel-stage"><div class="pixel-grid"></div><div class="pixel-shadow"></div><canvas width="384" height="384" aria-label="像素人物动作画布"></canvas><span class="pixel-caption">艾琳·河湾 / 游商</span></div><div class="pixel-toolbar"><button data-pause>暂停</button><button data-replay>重播</button><label>进度 <input aria-label="动作进度" type="range" min="0" max="1000" value="0"></label></div><p class="pixel-status" role="status"></p></section>
<aside><section><p class="pixel-kicker">动作与方向</p><label>动作<select aria-label="动作">${options(Object.entries(ACTIONS).map(([id, meta]) => [id, meta.label]))}</select></label><div class="pixel-directions" aria-label="方向">${DIRECTIONS.map(d => `<button data-direction="${d}" aria-pressed="${d === 'SE'}">${d}</button>`).join('')}</div><label>武器<select aria-label="武器">${options(WEAPONS.map(x => [x, ({unarmed:'空手',dagger:'匕首',sword:'单手剑',greatsword:'双手剑',axe:'斧',mace:'钉锤',spear:'长矛',bow:'弓',crossbow:'弩',staff:'法杖'})[x]]))}</select></label><label>法术<select aria-label="法术">${options(SPELLS.map(x => [x, ({fire:'火焰',frost:'冰霜',lightning:'雷电',healing:'治疗',ward:'护盾',summon:'召唤',arcane:'奥术'})[x]]))}</select></label><label>表情<select aria-label="表情">${options(Object.entries(EXPRESSIONS))}</select></label></section>
<section><p class="pixel-kicker">人物与搭配</p><label>角色归属<select aria-label="角色归属"><option value="npc">NPC</option><option value="player">玩家</option></select></label><label>身体类型<select aria-label="身体类型"><option value="female">女性</option><option value="male">男性</option></select></label><label>身材<select aria-label="身材">${options(catalog.body.styles.map(s => [s.id, s.label]))}</select></label><label>发型<select aria-label="发型">${options(catalog.hair.styles.map(s => [s.id, s.label]))}</select></label><label>上衣配色<select aria-label="上衣配色">${options(catalog.top.colors.map(c => [c, c]))}</select></label><label>饰品<select aria-label="饰品">${options(catalog.accessory.styles.map(s => [s.id, s.label]))}</select></label></section>
<section><p class="pixel-kicker">对照与导出</p><label>素材版本<select aria-label="素材版本"><option value="auto">优先精修样板</option><option value="rig-v2">原版素材对照</option></select></label><div class="pixel-exports"><button data-export="png">导出 PNG</button><button data-export="json">导出显示参数</button><label class="pixel-import">导入人物 JSON<input type="file" accept=".json,application/json" aria-label="导入人物 JSON"></label></div><p class="pixel-note">精修样板目前覆盖女性短发、椭圆脸、衬衫、直筒裤、短靴及挎包，支持八种身材。其他搭配显示原版素材。</p><p role="alert" class="pixel-error"></p></section></aside></div></main>`;

let actor: VisualActor = { actorId: sample.actorId, gender: sample.gender as 'female', appearance: structuredClone(sample.appearance) as Appearance };
let displayName = sample.name, displayOccupation = sample.identity.occupation;
let pose: VisualPose = { action: 'walk', direction: 'SE', progress: 0, weapon: 'dagger', spell: 'healing', expression: 'neutral' };
let policy: CharacterRenderer = 'auto', elapsed = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches, last = performance.now(), lastPaint = -Infinity;
const stage = root.querySelector('canvas')!, context = stage.getContext('2d')!;
const field = (name: string) => root.querySelector<HTMLSelectElement>(`[aria-label="${name}"]`)!;
const alert = root.querySelector<HTMLElement>('[role=alert]')!, status = root.querySelector<HTMLElement>('[role=status]')!, range = root.querySelector<HTMLInputElement>('[aria-label="动作进度"]')!;
function progress() { const clip = ACTIONS[pose.action]; return clip.loop ? elapsed % clip.duration / clip.duration : Math.min(1, elapsed / clip.duration); }
function request() { return createCharacterVisualFrame(actor, { ...pose, progress: progress() }); }
function syncFields() {
  root.querySelector<HTMLElement>('.pixel-caption')!.textContent = `${displayName}${displayOccupation ? ' / ' + displayOccupation : ''}`;
  field('动作').value = pose.action; field('武器').value = pose.weapon; field('法术').value = pose.spell; field('表情').value = pose.expression;
  field('身体类型').value = actor.gender; field('身材').value = actor.appearance.parts.body.styleId; field('发型').value = actor.appearance.parts.hair.styleId; field('上衣配色').value = actor.appearance.parts.top.color; field('饰品').value = actor.appearance.parts.accessory.styleId;
  root.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.direction === pose.direction)));
  root.querySelector<HTMLButtonElement>('[data-pause]')!.textContent = paused ? '播放' : '暂停';
}
function paint() {
  const value = renderCharacterVisualFrame(request(), { renderer: policy });
  context.clearRect(0, 0, 384, 384); context.imageSmoothingEnabled = false; context.drawImage(value.canvas, 0, 0); value.canvas.width = 0;
  status.textContent = `${value.renderer === 'pixel-v1' ? '精修样板' : '原版素材'} · ${ACTIONS[pose.action].label}${value.fallbackReason ? ' · 当前搭配尚未覆盖精修素材' : ''}`;
  status.dataset.renderer = value.renderer; status.dataset.action = pose.action; range.value = String(Math.round(progress() * 1000));
}
function safe(fn: () => void) { try { fn(); alert.textContent = ''; syncFields(); paint(); } catch (error) { alert.textContent = error instanceof Error ? error.message : '人物参数无效'; } }
function setPart(slot: 'body' | 'hair' | 'top' | 'accessory', value: string, color = false) { actor = { ...actor, appearance: { ...actor.appearance, parts: { ...actor.appearance.parts, [slot]: { ...actor.appearance.parts[slot], [color ? 'color' : 'styleId']: value } } } }; }
for (const [label, key] of [['动作', 'action'], ['武器', 'weapon'], ['法术', 'spell'], ['表情', 'expression']] as const) field(label).onchange = e => safe(() => { pose = { ...pose, [key]: (e.target as HTMLSelectElement).value }; elapsed = 0; });
for (const [label, slot] of [['身材', 'body'], ['发型', 'hair'], ['饰品', 'accessory']] as const) field(label).onchange = e => safe(() => setPart(slot, (e.target as HTMLSelectElement).value));
field('上衣配色').onchange = e => safe(() => setPart('top', (e.target as HTMLSelectElement).value, true));
field('身体类型').onchange = e => safe(() => { actor = { ...actor, gender: (e.target as HTMLSelectElement).value as 'male' | 'female' }; });
field('角色归属').onchange = e => safe(() => { actor = { ...actor, actorId: `pixel-sample:${(e.target as HTMLSelectElement).value}` }; });
field('素材版本').onchange = e => safe(() => { policy = (e.target as HTMLSelectElement).value as CharacterRenderer; });
root.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(b => b.onclick = () => safe(() => { pose = { ...pose, direction: b.dataset.direction as VisualPose['direction'] }; }));
root.querySelector<HTMLButtonElement>('[data-pause]')!.onclick = () => safe(() => { paused = !paused; last = performance.now(); });
root.querySelector<HTMLButtonElement>('[data-replay]')!.onclick = () => safe(() => { elapsed = 0; });
range.oninput = () => safe(() => { paused = true; elapsed = Number(range.value) / 1000 * ACTIONS[pose.action].duration; });
function save(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
root.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(b => b.onclick = () => safe(() => {
  const frame = request(), result = renderCharacterVisualFrame(frame, { renderer: policy });
  if (b.dataset.export === 'json') { save(new Blob([JSON.stringify({ ...frame, render: { renderer: result.renderer, artVersion: result.artVersion, frame: result.frame } }, null, 2)], { type: 'application/json' }), 'hi-story-character-visual.json'); result.canvas.width = 0; }
  else result.canvas.toBlob(blob => { if (blob) save(blob, 'hi-story-character-pixel.png'); result.canvas.width = 0; }, 'image/png');
}));
root.querySelector<HTMLInputElement>('[type=file]')!.onchange = async e => {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
  try {
    const value = JSON.parse(await file.text());
    let next: CharacterVisualFrame;
    if (value.version === 'character-visual/1') { validateCharacterVisualFrame(value); next = value; }
    else next = createCharacterVisualFrame(value, pose) as CharacterVisualFrame;
    if (typeof value.name === 'string') { displayName = value.name; displayOccupation = typeof value.identity?.occupation === 'string' ? value.identity.occupation : ''; }
    else if (next.actor.actorId !== actor.actorId) { displayName = '导入人物'; displayOccupation = ''; }
    actor = structuredClone(next.actor); pose = { ...next.pose }; elapsed = pose.progress * ACTIONS[pose.action].duration;
    safe(() => {});
  } catch (error) { alert.textContent = error instanceof Error ? error.message : '无法读取人物 JSON'; }
};
document.addEventListener('visibilitychange', () => { last = performance.now(); });
await loadCharacterVisuals(); syncFields(); paint();
function loop(now: number) {
  if (!paused && !document.hidden) { elapsed += Math.max(0, now - last); if (now - lastPaint >= 60) { paint(); lastPaint = now; } }
  last = now; requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
