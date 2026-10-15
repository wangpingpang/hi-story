import { appearanceCatalogFor, appearanceSlots, type AppearanceSlot, type AppearancePart, type Gender, type StudioView } from '../application/character-studio';
import { characterSprite } from './character-sprite';
import { escapeHtml as escape } from './html';

export interface StudioActions {
  generate(seed?: string): void;
  reroll(slot: AppearanceSlot): void;
  lock(slot: AppearanceSlot, locked: boolean): void;
  select(slot: AppearanceSlot, part: AppearancePart): void;
  export(): void;
  exportPng(): void;
  gender(gender:Gender): void;
}
export function renderCharacterStudio(root: HTMLElement, view: StudioView, actions: StudioActions, message = ''): void {
  const { model, locked, gender } = view;
  const backTo=new URLSearchParams(location.search).get('return')==='demo'?'./?view=demo':'./?view=fog-bridge';
  const appearanceCatalog=appearanceCatalogFor(model.version);
  const focusKey = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focus : undefined;
  root.innerHTML = `<header class="masthead"><a href="${backTo}" aria-label="返回旅程">hi<span>—</span>story</a><span>CHARACTER ATELIER</span><a class="restart" href="${backTo}">返回旅程 ↗</a></header>
  <main class="atelier"><div class="intro"><div><p class="eyebrow">SEVEN PARTS · ENDLESS ENCOUNTERS</p><h1>人物工坊</h1><p>拼出一位旅人，为下一段相遇留一张面孔。</p></div><span class="edition">像素外观生成器<br>PNG 部件装配 · v3</span></div>
  <div class="atelier-layout"><section class="card portrait-card" aria-label="人物预览"><p class="eyebrow">YOUR NEXT TRAVELER</p><div class="portrait-stage"><div class="portrait-grid"></div>${characterSprite(model,'随机人物',gender)}<span class="portrait-caption">旅人 / 001</span></div><h2>下一位，擦肩而过的人</h2><p class="muted">发型、脸型、身材与穿搭自由组合。</p><div class="atelier-actions"><button class="again" type="button" data-action="random" data-focus="random">随机一位旅人 ↻</button><a class="restart" href="?view=character-motion#character=${encodeURIComponent(JSON.stringify({appearance:model,gender}))}">动作与表情工坊 ↗</a><button class="restart" type="button" data-action="png" data-focus="png">导出人物 PNG ↓</button><button class="restart" type="button" data-action="export" data-focus="export">导出人物 JSON ↓</button></div><p class="status" role="status" aria-live="polite">${escape(message || '可锁定喜欢的部件，再生成新的组合。')}</p></section>
  <section class="card atelier-controls" aria-label="外观编辑"><div class="controls-heading"><div><p class="eyebrow">BUILD AN APPEARANCE</p><h2>七块拼图，一位旅人</h2></div><span class="badge">已锁定 ${locked.length} / 7</span></div>
  <div class="body-rig"><label for="body-rig">身体类型</label><select id="body-rig" data-focus="body-rig"><option value="male" ${gender==='male'?'selected':''}>男性素材</option><option value="female" ${gender==='female'?'selected':''}>女性素材</option></select></div>
  ${appearanceSlots.map((slot,index)=>{const c=appearanceCatalog[slot],part=model.parts[slot],isLocked=locked.includes(slot);return `<div class="part-row" data-slot="${slot}"><div class="part-heading"><label for="style-${slot}"><span class="part-number">0${index+1}</span>${c.label}</label><label class="lock-label"><input type="checkbox" data-lock="${slot}" data-focus="lock-${slot}" ${isLocked?'checked':''} aria-label="锁定${c.label}"> 锁定</label></div><div class="part-options"><select id="style-${slot}" data-style="${slot}" data-focus="style-${slot}" ${isLocked?'disabled':''}>${c.styles.map(s=>`<option value="${s.id}" ${s.id===part.styleId?'selected':''}>${s.label}</option>`).join('')}</select><button type="button" class="part-reroll" data-reroll="${slot}" data-focus="reroll-${slot}" aria-label="随机${c.label}" ${isLocked?'disabled':''}>↻</button></div><div class="swatches" role="group" aria-label="${slot==='body'?'肤色':slot==='face'?'眼睛颜色':c.label+'颜色'}">${c.colors.map((color,i)=>`<button type="button" class="swatch" style="--swatch:${color}" data-color="${color}" data-color-slot="${slot}" data-focus="color-${slot}-${i}" aria-label="${c.label}颜色 ${i+1}" aria-pressed="${color===part.color}" ${isLocked?'disabled':''}><span aria-hidden="true">${color===part.color?'✓':''}</span></button>`).join('')}</div></div>`;}).join('')}
  <form class="seed-form"><label for="appearance-seed">生成种子</label><div><input id="appearance-seed" name="seed" data-focus="seed" value="${escape(model.seed)}" maxlength="128" required autocomplete="off"><button type="submit" class="restart" data-focus="apply-seed">按种子生成</button></div><p class="muted">同一种子复现同一初始人物；已锁定部件保留当前样式。导出 JSON 可完整保留手动修改后的组合。</p></form></section></div><footer>HI-STORY <span>相遇不必同行，面孔各有故事。</span><span>外观模型 · ${model.version}</span></footer></main>`;
  root.querySelector('[data-action="random"]')!.addEventListener('click',()=>actions.generate());
  root.querySelector<HTMLSelectElement>('#body-rig')!.addEventListener('change',event=>actions.gender((event.currentTarget as HTMLSelectElement).value as Gender));
  root.querySelector('[data-action="png"]')!.addEventListener('click',()=>actions.exportPng());
  root.querySelector('[data-action="export"]')!.addEventListener('click',()=>actions.export());
  root.querySelectorAll<HTMLInputElement>('[data-lock]').forEach(input=>input.addEventListener('change',()=>actions.lock(input.dataset.lock as AppearanceSlot,input.checked)));
  root.querySelectorAll<HTMLButtonElement>('[data-reroll]').forEach(button=>button.addEventListener('click',()=>actions.reroll(button.dataset.reroll as AppearanceSlot)));
  root.querySelectorAll<HTMLSelectElement>('[data-style]').forEach(select=>select.addEventListener('change',()=>{const slot=select.dataset.style as AppearanceSlot;actions.select(slot,{styleId:select.value,color:model.parts[slot].color});}));
  root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button=>button.addEventListener('click',()=>{const slot=button.dataset.colorSlot as AppearanceSlot;actions.select(slot,{styleId:model.parts[slot].styleId,color:button.dataset.color!});}));
  root.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();actions.generate(root.querySelector<HTMLInputElement>('#appearance-seed')!.value);});
  if(focusKey) Array.from(root.querySelectorAll<HTMLElement>('[data-focus]')).find(el=>el.dataset.focus===focusKey)?.focus();
}
