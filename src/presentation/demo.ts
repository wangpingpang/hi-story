import { GameApplication, type DemoCommand } from '../application';
import { escapeHtml as html } from './html';
import { assembleCharacterCanvas } from './character-art';
import './demo-style.css';
export function mountDemo(root:HTMLElement,app:GameApplication):()=>void {
  let busy=false,message='',removeKeys=()=>{};
  async function submit(command:DemoCommand):Promise<void>{
    if(busy)return;busy=true;root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
    const result=await app.dispatch(command);message=result.ok?'':result.error.message;busy=false;draw();
  }
  function draw():void {
    removeKeys();const view=app.query(),s=view.snapshot;
    if(!s){root.innerHTML='<main class="demo-shell"><h1>旅程未能开始</h1><p role="alert">'+html(message||'正在生成旅程。')+'</p></main>';return;}
    const player=s.runtime.actors[s.playerActorId],battle=s.runtime.battle,visible=new Set(s.runtime.visible),explored=new Set(s.runtime.explored);
    const tile=18;
    const cells=s.runtime.map.cells.flatMap((row,y)=>row.map((cell,x)=>{
      const seen=explored.has(`${x},${y}`),current=visible.has(`${x},${y}`);
      return `<rect x="${x*tile}" y="${y*tile}" width="${tile}" height="${tile}" fill="${!seen?'#101820':cell.walkable?(current?'#b8b398':'#5e655e'):(current?'#40564c':'#263930')}" stroke="#273831" stroke-width="0.5"/>`;
    })).join('');
    const anchors=s.runtime.map.anchors.filter(a=>visible.has(`${a.position.x},${a.position.y}`)).map(a=>`<text x="${a.position.x*tile+9}" y="${a.position.y*tile+13}" text-anchor="middle" fill="#16292e" font-size="12">${({spawn:'起',notes:'书',market:'商',supply:'物',goal:'终'} as Record<string,string>)[a.id]??'◇'}</text>`).join('');
    const actors=Object.values(s.runtime.actors).filter(a=>visible.has(`${a.position.x},${a.position.y}`)&&a.hp>0).map(a=>`<circle cx="${a.position.x*tile+9}" cy="${a.position.y*tile+9}" r="5" fill="${a.actorId===s.playerActorId?'#e9ae52':'#7e496e'}"><title>${html(a.profile.name)}</title></circle>`).join('');
    const events=view.events.map((e,i)=>`<button type="button" data-event="${i}" ${!e.allowed||s.status!=='active'?'disabled':''}><span>${html(e.text)}</span><small>${e.allowed?`耗时 ${e.cost} 小时`:html(e.reason)}</small></button>`).join('');
    const tasks=s.things.objectives.map(q=>`<li><strong>${html(q.blueprint.title)}</strong><span>${({active:'进行中',success:'已完成',failed:'失败',abandoned:'已放弃',expired:'已过期'} as Record<string,string>)[q.status]??html(q.status)}</span></li>`).join('');
    const battlePanel=battle&&s.pending?`<section class="demo-battle"><h2>战斗 · 第${battle.round}回合</h2><p>你：${player.hp}/${player.maxHp} · 对方：${s.runtime.actors[battle.enemyActorId].hp}/${s.runtime.actors[battle.enemyActorId].maxHp}</p><div class="battle-board">${Array.from({length:35},(_,i)=>{const x=i%7,y=Math.floor(i/7),p=battle.playerPosition.x===x&&battle.playerPosition.y===y,e=battle.enemyPosition.x===x&&battle.enemyPosition.y===y;return `<button type="button" data-battle-cell="${x},${y}" aria-label="战斗格 ${x},${y}${p?' 玩家':e?' 对手':''}" ${p||e?'disabled':''}>${p?'你':e?'敌':'·'}</button>`;}).join('')}</div><div class="demo-controls"><button data-combat="attack">攻击</button><button data-combat="defend">防御</button><button data-combat="flee">脱离战斗</button></div><ol>${battle.log.slice(-6).map(text=>`<li>${html(text)}</li>`).join('')}</ol></section>`:'';
    root.innerHTML=`<main class="demo-shell"><header><a href="./">hi-story</a><span>生成与探索 Demo</span><a href="./?view=story-generator">故事工坊</a></header><div class="demo-title"><div><p>剑与魔法 · 随机旅程</p><h1>${html(s.story.goal)}</h1></div><button id="demo-restart" type="button">同种子重新开始</button></div><form id="demo-seed-form"><label for="demo-seed">旅程种子</label><input id="demo-seed" value="${html(s.seed)}" maxlength="128" required><button type="submit">生成新旅程</button></form><p class="demo-message" role="status" aria-live="polite">${html(message||s.story.ending||'探索迷雾，靠近书、商人和人物进行互动。方向键或下方按钮移动。')}</p><div class="demo-layout"><section><h2>世界地图</h2><p>区域路线：${html(s.spatial.label)} · 旅程时限 ${s.story.deadline} 小时</p><svg id="demo-map" role="img" aria-label="有界探索地图。方向键逐格移动。" tabindex="0" viewBox="0 0 ${s.runtime.map.bounds.width*tile} ${s.runtime.map.bounds.height*tile}">${cells}${anchors}${actors}</svg><p class="demo-legend">金色：你 · 紫色：NPC · 书：笔记 · 商：交易 · 物：搜寻 · 终：目标</p><div class="demo-controls" aria-label="探索移动"><button data-move="0,-1">向上</button><button data-move="-1,0">向左</button><button data-move="1,0">向右</button><button data-move="0,1">向下</button></div><p>坐标 ${player.position.x}, ${player.position.y} · 已探索 ${s.runtime.explored.length} 格</p>${battlePanel}<section class="demo-events"><h2>当前可选行动</h2>${events||'<p>当前没有可执行的故事行动。</p>'}</section></section><aside><section><h2>人物与行囊</h2><div id="demo-portrait"></div><p>${html(player.profile.name)} · ${html(player.profile.identity.occupation)}</p><p>生命 ${player.hp}/${player.maxHp} · 金币 <strong data-gold>${s.things.gold}</strong></p><p>线索 ${s.things.items.clue?'已取得':'未取得'} · 物资 ${s.things.items.supply?'已取得':'未取得'}</p><p>累计耗时 ${s.story.time.toFixed(1)} 小时</p></section><section><h2>任务</h2><ul class="demo-tasks">${tasks}</ul></section><section><h2>旅程手记</h2><ol>${s.story.history.slice(-6).map(h=>`<li>${html(h.text)}</li>`).join('')}</ol></section></aside></div></main>`;
    try{const canvas=assembleCharacterCanvas(player.profile.appearance,player.profile.gender,1);canvas.setAttribute('aria-label',player.profile.name+'的像素外观');root.querySelector('#demo-portrait')?.append(canvas);}catch{/* Gameplay does not depend on a portrait renderer. */}
    const make=(type:string,payload:Record<string,unknown>):DemoCommand=>({commandId:crypto.randomUUID(),runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type,payload});
    const move=(dx:number,dy:number)=>submit(make('world.move',{x:player.position.x+dx,y:player.position.y+dy}));
    root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button=>{
      button.disabled=Boolean(s.pending)||s.status==='ended';button.onclick=()=>{const [x,y]=button.dataset.move!.split(',').map(Number);void move(x,y);};
    });
    root.querySelectorAll<HTMLButtonElement>('[data-event]').forEach(button=>button.onclick=()=>{const e=view.events[Number(button.dataset.event)];void submit(make('event.choose',{eventInstanceId:e.eventInstanceId,optionId:e.optionId}));});
    root.querySelectorAll<HTMLButtonElement>('[data-combat]').forEach(button=>button.onclick=()=>void submit(make('combat.action',{action:button.dataset.combat})));
    root.querySelectorAll<HTMLButtonElement>('[data-battle-cell]').forEach(button=>button.onclick=()=>{const [x,y]=button.dataset.battleCell!.split(',').map(Number);void submit(make('combat.action',{action:'move',x,y}));});
    root.querySelector<HTMLButtonElement>('#demo-restart')!.onclick=async()=>{if(busy)return;busy=true;const result=await app.restart();message=result.ok?'已重新开始同一旅程。':result.error.message;busy=false;draw();};
    root.querySelector<HTMLFormElement>('#demo-seed-form')!.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const seed=root.querySelector<HTMLInputElement>('#demo-seed')!.value;const result=await app.restart({seed});message=result.ok?'新旅程已生成。':result.error.message;busy=false;draw();};
    const onKey=(event:KeyboardEvent)=>{
      if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||busy||s.status!=='active')return;
      const delta:Record<string,[number,number]>={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
      if(delta[event.key]){event.preventDefault();void move(...delta[event.key]);}
    };
    window.addEventListener('keydown',onKey);removeKeys=()=>window.removeEventListener('keydown',onKey);
  }
  draw();return ()=>{removeKeys();app.dispose();};
}
