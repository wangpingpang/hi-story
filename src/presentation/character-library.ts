import {
 characterAssetUrl, characterPreviewScale, loadModelCatalog, loadCharacterModel, loadSpriteAtlas, resolveClipFrame,
 readSelectedModel, selectModel, type ModelCatalog, type ModelManifest,
} from './external-character-models';
import {escapeHtml as escape} from './html';
import './character-library.css';

const directions = [
 {id:0,name:'NW',label:'左上',arrow:'↖'}, {id:1,name:'N',label:'上',arrow:'↑'}, {id:2,name:'NE',label:'右上',arrow:'↗'},
 {id:7,name:'W',label:'左',arrow:'←'}, {id:-1,name:'',label:'',arrow:'✦'}, {id:3,name:'E',label:'右',arrow:'→'},
 {id:6,name:'SW',label:'左下',arrow:'↙'}, {id:5,name:'S',label:'下',arrow:'↓'}, {id:4,name:'SE',label:'右下',arrow:'↘'},
];

/** A visual preference only. Visiting the library never initializes or modifies an adventure. */
export async function mountCharacterLibrary(root:HTMLElement):Promise<()=>void> {
 let disposed=false,catalog:ModelCatalog|undefined,manifest:ModelManifest|undefined,image:HTMLImageElement|undefined;
 let selectedId=readSelectedModel(),savedId=selectedId,actionId=0,directionId=5,request=0,elapsed=0,last=0,lastPaint=0,raf=0,previewScale=1;
 let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,search='';
 root.innerHTML=`<div class="character-library"><header class="cl-header"><a class="cl-brand" href="?view=demo" aria-label="hi-story 返回旅程">hi<span>—</span>story</a><span class="cl-header-label">TRAVELER COLLECTION</span><a class="cl-back" href="?view=demo">← 返回旅程</a></header><main class="cl-main"><div class="cl-heading"><div><p class="cl-eyebrow">MEET YOUR NEXT TRAVELER</p><h1>每一位，都有自己的姿态。</h1><p>挑选旅人的模样，让下一步鲜活起来。</p></div><div class="cl-totals" aria-label="素材目录规模"><span><strong data-total-characters>—</strong>人物</span><span><strong data-total-actions>—</strong>动作</span><span><strong>8</strong>方向</span></div></div><div data-library-content><div class="cl-initial" role="status">正在打开人物素材馆…</div></div><footer class="cl-footer"><span>HI-STORY · 人物素材馆</span><p>默认风格一 · 空手。素材来源：<a href="https://www.molibaike.com/Role" target="_blank" rel="noopener noreferrer">魔力百科站 ↗</a><br>原站标注图档版权归史克威尔艾尼克斯（中国）；未提供开放素材许可证。</p></footer></main></div>`;
 const get=<T extends HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
 const content=get<HTMLElement>('[data-library-content]');
 const actionLabel=()=>catalog?.actions.find(a=>a.id===actionId)?.label??'站立';
 const directionLabel=()=>directions.find(d=>d.id===directionId)!;

 function status(message:string,error=false) {
  const element=root.querySelector<HTMLElement>('[data-cl-status]');if(!element)return;
  element.textContent=message;element.dataset.error=String(error);
  get<HTMLButtonElement>('[data-cl-retry]').hidden=!error;
 }
 function updateButtons() {
  if(!catalog)return;
  root.querySelectorAll<HTMLButtonElement>('[data-cl-model]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.clModel===selectedId)));
  root.querySelectorAll<HTMLButtonElement>('[data-cl-action]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.clAction)===actionId)));
  root.querySelectorAll<HTMLButtonElement>('[data-cl-direction]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.clDirection)===directionId)));
  const pause=get<HTMLButtonElement>('[data-cl-pause]');pause.textContent=paused?'▶ 播放':'Ⅱ 暂停';pause.setAttribute('aria-pressed',String(paused));
  get<HTMLElement>('[data-cl-action-label]').textContent=actionLabel();
  get<HTMLElement>('[data-cl-direction-label]').textContent=`朝向${directionLabel().label} · ${directionLabel().name}`;
 }
 function cards() {
  if(!catalog)return;
  const filtered=catalog.characters.filter(character=>character.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  get('[data-cl-count]').textContent=`${filtered.length} / ${catalog.characters.length}`;
  get('[data-cl-cards]').innerHTML=filtered.length?filtered.map(character=>`<button type="button" class="cl-character" data-cl-model="${escape(character.id)}" aria-label="预览${escape(character.name)}" aria-pressed="${character.id===selectedId}"><span class="cl-character-image"><img src="${escape(characterAssetUrl(character.portraitUrl))}" alt="" loading="lazy" width="80" height="112"></span><strong>${escape(character.name)}</strong><span class="cl-character-marker">${character.id===savedId?'当前旅人':'查看动作'}</span></button>`).join(''):'<p class="cl-empty">没有找到这位人物。试试其他名字。</p>';
 }
 function paint() {
  const canvas=root.querySelector<HTMLCanvasElement>('[data-cl-canvas]');if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
  if(!manifest||!image)return;
  const resolved=resolveClipFrame(manifest,actionId,directionId,elapsed,true);
  const [x,y,width,height]=resolved.frame.rect,[pivotX,pivotY]=resolved.frame.pivot;
  // A shared standing scale and floor anchor keep gesture size and foot placement honest.
  const scale=previewScale;
  ctx.drawImage(image,x,y,width,height,Math.round(320-pivotX*scale),Math.round(330-pivotY*scale),Math.round(width*scale),Math.round(height*scale));
  canvas.dataset.frame=String(resolved.frameIndex);canvas.dataset.time=String(Math.floor(elapsed));
  get<HTMLElement>('[data-cl-frame]').textContent=`${String(resolved.frameIndex+1).padStart(2,'0')} / ${String(resolved.clip.frames.length).padStart(2,'0')}`;
 }
 function schedule() {
  cancelAnimationFrame(raf);raf=0;
  if(disposed||paused||document.hidden||!image)return;
  last=performance.now();raf=requestAnimationFrame(tick);
 }
 function tick(now:number) {
  if(disposed||paused||document.hidden)return;
  elapsed+=Math.min(100,Math.max(0,now-last));last=now;
  if(now-lastPaint>=40){paint();lastPaint=now;}
  raf=requestAnimationFrame(tick);
 }
 async function preview() {
  const token=++request,id=selectedId,requestedAction=actionId,requestedDirection=directionId;
  cancelAnimationFrame(raf);image=undefined;manifest=undefined;elapsed=0;paint();updateButtons();
  const character=catalog?.characters.find(c=>c.id===id);if(!character)return;
  get('[data-cl-name]').textContent=character.name;
  get<HTMLAnchorElement>('[data-cl-source]').href=character.detailUrl;
  get('[data-cl-saved]').textContent=savedId===id?'当前旅人':'人物预览';
  const canvas=get<HTMLCanvasElement>('[data-cl-canvas]');canvas.dataset.ready='loading';canvas.dataset.model=id;canvas.dataset.action=String(actionId);canvas.dataset.direction=String(directionId);
  get<HTMLButtonElement>('[data-cl-use]').disabled=true;
  status(`正在载入${character.name}的${actionLabel()}动作…`);
  try {
   const next=await loadCharacterModel(id);if(disposed||token!==request)return;
   const frame=resolveClipFrame(next,requestedAction,requestedDirection,0,true),atlas=await loadSpriteAtlas(frame.atlasUrl);
   if(disposed||token!==request)return;
   previewScale=characterPreviewScale(next);manifest=next;image=atlas;canvas.dataset.ready='ready';
   get<HTMLButtonElement>('[data-cl-use]').disabled=false;
   get('[data-cl-coverage]').textContent=`${next.availableClips} / ${next.requestedClips} 动作方向`;
   status(frame.fallback?'此动作方向暂无素材，当前显示站立替代。':`${character.name} · ${actionLabel()} · 朝向${directionLabel().label}`);
   paint();schedule();
  } catch(error) {
   if(disposed||token!==request)return;
   canvas.dataset.ready='error';status(error instanceof Error?error.message:'人物素材暂时未能加载，请重试。',true);
  }
 }
 async function initialize() {
  try {
   const loaded=await loadModelCatalog();if(disposed)return;catalog=loaded;
   if(!catalog.characters.some(c=>c.id===selectedId))selectedId=catalog.characters[0].id;
   get('[data-total-characters]').textContent=String(catalog.characters.length);get('[data-total-actions]').textContent=String(catalog.actions.length);
   content.innerHTML=`<div class="cl-layout"><section class="cl-catalog" aria-label="人物目录"><div class="cl-section-heading"><h2>旅人名册</h2><span data-cl-count></span></div><label class="cl-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索人物" placeholder="寻找一位旅人" autocomplete="off" data-cl-search></label><div class="cl-character-grid" data-cl-cards></div></section><section class="cl-preview" aria-label="人物动作预览"><div class="cl-preview-heading"><div><p class="cl-eyebrow">CHARACTER PREVIEW</p><h2 data-cl-name></h2></div><span class="cl-tag" data-cl-saved></span></div><div class="cl-stage"><div class="cl-stage-glow"></div><div class="cl-stage-floor"></div><span class="cl-stage-caption">风格一 / 空手</span><canvas data-cl-canvas width="640" height="420" role="img" aria-label="人物动画画布"></canvas><span class="cl-frame-counter">FRAME <b data-cl-frame>—</b></span><span class="cl-stage-origin" aria-hidden="true">✦</span></div><div class="cl-playback"><div><strong data-cl-action-label>站立</strong><span data-cl-direction-label>朝向下 · S</span></div><button type="button" class="cl-secondary" data-cl-pause>Ⅱ 暂停</button></div><div class="cl-status-row"><p role="status" aria-live="polite" data-cl-status></p><button type="button" class="cl-retry" data-cl-retry hidden>重新加载</button></div><div class="cl-use-area"><button type="button" class="cl-primary" data-cl-use disabled>作为旅人，返回旅程 <span aria-hidden="true">↗</span></button><p>仅更换外观，保留当前冒险进度与人物资料。</p></div></section><section class="cl-controls" aria-label="动作与方向"><div class="cl-section-heading"><h2>动作</h2><span>循环预览</span></div><div class="cl-actions" aria-label="选择人物动作">${catalog.actions.map(action=>`<button type="button" data-cl-action="${action.id}" aria-pressed="${action.id===actionId}">${escape(action.label)}</button>`).join('')}</div><div class="cl-section-heading cl-direction-heading"><h2>朝向</h2><span>屏幕方向</span></div><div class="cl-directions" aria-label="选择人物朝向">${directions.map(direction=>direction.id<0?'<span class="cl-compass" aria-hidden="true">✦</span>':`<button type="button" data-cl-direction="${direction.id}" aria-label="面向${direction.label}（${direction.name}）" aria-pressed="${direction.id===directionId}"><span aria-hidden="true">${direction.arrow}</span><small>${direction.name}</small></button>`).join('')}</div><div class="cl-source-info"><span data-cl-coverage>读取动作覆盖…</span><p>本地收录默认风格与空手动作。其他配色、武器组合可到原站查看。</p><a data-cl-source target="_blank" rel="noopener noreferrer">查看原站人物 ↗</a></div></section></div>`;
   cards();await preview();
  } catch(error) {
   if(disposed)return;content.innerHTML='<div class="cl-initial"><p role="alert" data-cl-init-error></p><button class="cl-secondary" type="button" data-cl-initialize>重新加载目录</button></div>';
   get('[data-cl-init-error]').textContent=error instanceof Error?error.message:'人物目录暂时无法打开。';
  }
 }
 function click(event:MouseEvent) {
  const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||!root.contains(button))return;
  if(button.hasAttribute('data-cl-model')){selectedId=button.dataset.clModel!;void preview();}
  else if(button.hasAttribute('data-cl-action')){actionId=Number(button.dataset.clAction);void preview();}
  else if(button.hasAttribute('data-cl-direction')){directionId=Number(button.dataset.clDirection);void preview();}
  else if(button.hasAttribute('data-cl-pause')){paused=!paused;updateButtons();paint();schedule();}
  else if(button.hasAttribute('data-cl-retry'))void preview();
  else if(button.hasAttribute('data-cl-initialize')){button.disabled=true;void initialize();}
  else if(button.hasAttribute('data-cl-use')){
   try{selectModel(selectedId);savedId=selectedId;location.assign('?view=demo');}
   catch(error){status(error instanceof Error?error.message:'人物选择未能保存，请重试。',true);}
  }
 }
 function input(event:Event) {if(event.target instanceof HTMLInputElement&&event.target.hasAttribute('data-cl-search')){search=event.target.value.trim();cards();}}
 function visibility(){schedule();}
 function dispose(){if(disposed)return;disposed=true;request++;cancelAnimationFrame(raf);root.removeEventListener('click',click);root.removeEventListener('input',input);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);}
 function pagehide(event:PageTransitionEvent){if(!event.persisted)dispose();}
 root.addEventListener('click',click);root.addEventListener('input',input);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);
 await initialize();return dispose;
}
