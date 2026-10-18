import type { AdventureSnapshot } from '../application';
import type { DeepReadonly } from '../contracts';
import { CHARACTER_PLACEHOLDER_URL } from './external-character-models';
import { escapeHtml as html } from './html';
import { scenerySprite,sceneryDefs,type ScenerySprite } from './scenery';
export const TILE_WIDTH=64,TILE_HEIGHT=32,LEVEL_HEIGHT=16;
export function projectIso(x:number,y:number,height=0):{x:number;y:number} {return {x:(x-y)*TILE_WIDTH/2,y:(x+y)*TILE_HEIGHT/2-height*LEVEL_HEIGHT};}
export function unprojectIso(x:number,y:number,height=0):{x:number;y:number} {const h=(y+height*LEVEL_HEIGHT)/(TILE_HEIGHT/2),w=x/(TILE_WIDTH/2);return {x:(w+h)/2,y:(h-w)/2};}
function diamond(x:number,y:number,height:number,color:string,stroke='#456c6333'):string {
 const p=projectIso(x,y,height),bottom=p.y+TILE_HEIGHT/2,h=height*LEVEL_HEIGHT;
 return `${h>.1?`<path d="M${p.x-32},${p.y}l32,16v${h}l-32,-16z" fill="#3d554d"/><path d="M${p.x+32},${p.y}l-32,16v${h}l32,-16z" fill="#293e39"/>`:''}<path d="M${p.x},${p.y-16}l32,16 -32,16 -32,-16z" fill="${color}" stroke="${stroke}" stroke-width=".6"/>`;
}
function tree(x:number,y:number):string {return `<g class="iso-tree"><ellipse cx="${x}" cy="${y+6}" rx="24" ry="9" fill="#071c1844"/><path d="M${x-4},${y+3}v-36h8v36z" fill="#6b503a"/><path d="M${x},${y-88}l-26,46h52z" fill="#325e48"/><path d="M${x},${y-65}l-32,43h64z" fill="#3e7157"/><path d="M${x},${y-49}l-34,39h68z" fill="#478264"/><path d="M${x},${y-87}l3,74 31,3 -34,-59z" fill="#224e3d66"/></g>`;}
function prop(x:number,y:number,type:string):string {
 if(type==='tree')return scenerySprite('oak',x,y,116,134);
 if(type==='wall')return `<path d="M${x-25},${y-8}l30,-15 19,10v-36l-19,-10 -30,15z" fill="#7d8574" stroke="#c4c3a2"/><path d="M${x+5},${y-23}v-36l19,10v36z" fill="#515e55"/><path d="M${x-25},${y-8}v-36l30,-15v36z" fill="#929d89"/>`;
 return scenerySprite('rock',x,y,75,62);
}
const symbols:Record<string,string>={spawn:'营火',notes:'旅行笔记',market:'商道营地',supply:'遗弃营地',shrine:'银月祭坛',cache:'遗迹锁箱',watch:'风蚀哨塔',gate:'坍塌捷径',goal:'暮光塔'};
export function renderIsometricWorld(s:DeepReadonly<AdventureSnapshot>):string {
 const visible=new Set(s.runtime.visible),explored=new Set(s.runtime.explored),entries:{depth:number;order:number;markup:string}[]=[],ground:string[]=[],player=s.runtime.actors[s.playerActorId];
 for(let y=0;y<s.runtime.map.bounds.height;y++)for(let x=0;x<s.runtime.map.bounds.width;x++){
  const k=`${x},${y}`,cell=s.runtime.map.cells[y][x],v=s.runtime.visual[k],seen=explored.has(k),current=visible.has(k),p=projectIso(x,y,v.height),noise=(x*7+y*13)%5;
  const palette=v.material==='stone'?['#899785','#929e8b','#849583','#91a28a','#819783']:v.material==='earth'?['#b5a887','#b0a17f','#c3b191','#afa382','#b8a98a']:v.material==='water'?['#274b4b','#2b5150','#284b49','#315655','#244846']:['#597d52','#658759','#678956','#72915f','#5c8053'];
  const color=!seen?'#243e3d':!current?'#435c4c':palette[noise];
  ground.push(`<g data-point="${x},${y}" class="iso-tile" opacity="${seen?1:.65}">${diamond(x,y,v.height,color,'#364e3922')}<path d="M${p.x},${p.y-16}l32,16 -32,16 -32,-16z" fill="url(#ground-${v.material})" opacity="${current?.85:.3}"/></g>`);
  if(seen&&v.prop)entries.push({depth:x+y,order:1,markup:`<g opacity="${current?1:.25}" pointer-events="none">${prop(p.x,p.y,v.prop)}</g>`});
  // Scenic silhouettes remain non-interactive: no actors or unexplored events are revealed.
  if(!cell.walkable&&!v.prop&&(x*13+y*7)%7===0)entries.push({depth:x+y,order:1,markup:`<g opacity="${current?.85:seen?.35:.12}" pointer-events="none">${scenerySprite((x+y)%2?'fir':'oak',p.x,p.y,110,138)}</g>`});
  if(!cell.walkable&&((x===0&&y===3)||(x===11&&y===0)))entries.push({depth:x+y,order:2,markup:`<g opacity="${current?1:seen?.4:.12}" pointer-events="none">${scenerySprite('cottage',p.x,p.y,160,145)}</g>`});
  if(current&&cell.walkable&&v.material==='grass'&&(x*7+y*11)%9===0)ground.push(`<g pointer-events="none" fill="#d7bd6d"><rect x="${p.x-13}" y="${p.y-3}" width="2" height="2"/><rect x="${p.x+9}" y="${p.y+3}" width="2" height="2"/></g>`);
 }
 for(const a of s.runtime.map.anchors){const key=`${a.position.x},${a.position.y}`;if(!visible.has(key)||!symbols[a.id])continue;const p=projectIso(a.position.x,a.position.y,s.runtime.visual[key].height);let structure='';
  if(a.id==='goal')structure=`<path d="M${p.x-24},${p.y}l24,12 24,-12v-72l-24,-12 -24,12z" fill="#8f9983"/><path d="M${p.x},${p.y+12}v-84l24,-12v84z" fill="#55665d"/><path d="M${p.x-31},${p.y-72}l31,-29 31,29 -31,16z" fill="#3c635b"/><path d="M${p.x-8},${p.y-20}v-18q8,-10 16,0v18z" fill="#30443c"/>`;
  else if(a.id==='market')structure=`<path d="M${p.x-32},${p.y-4}l32,-45 32,45 -32,16z" fill="#b37b53"/><path d="M${p.x},${p.y-49}v61l32,-16z" fill="#805842"/><path d="M${p.x-10},${p.y+5}l10,-32 10,27z" fill="#394b39"/>`;
  else if(a.id==='shrine')structure=`<ellipse cx="${p.x}" cy="${p.y}" rx="24" ry="12" fill="#aec1a4"/><path d="M${p.x-12},${p.y}v-28l12,-7 12,7v28z" fill="#93aca0"/><path d="M${p.x},${p.y-54}l9,17 -9,11 -9,-11z" fill="#a8d9c4" filter="url(#iso-glow)"/>`;
  else if(a.id==='spawn')structure=`<ellipse cx="${p.x}" cy="${p.y}" rx="19" ry="8" fill="#bfa977"/><path d="M${p.x-10},${p.y}q-10,-14 4,-22q-2,12 6,9q12,-10 9,6q-2,8 -19,7" fill="#e9ba63"/>`;
  else if(a.id==='cache')structure=`<path d="M${p.x-16},${p.y-9}l16,-8 16,8v16l-16,8 -16,-8z" fill="#a37c4d"/><path d="M${p.x},${p.y-17}v32l16,-8v-16z" fill="#745a3d"/>`;
  else structure=`<ellipse cx="${p.x}" cy="${p.y}" rx="15" ry="7" fill="#d8c99a"/><path d="M${p.x},${p.y-13}v10" stroke="#384e44" stroke-width="3"/>`;
  const asset:Partial<Record<string,ScenerySprite>>={goal:'tower',market:'tent',shrine:'shrine',supply:'wagon',watch:'tower'};
  if(asset[a.id])structure=scenerySprite(asset[a.id]!,p.x,p.y,a.id==='goal'?165:a.id==='watch'?112:125,a.id==='goal'?205:a.id==='watch'?150:120,true);
  if(['spawn','market','shrine','goal'].includes(a.id))structure=`<ellipse class="world-lantern" cx="${p.x}" cy="${p.y-12}" rx="95" ry="60" fill="url(#lantern-light)" pointer-events="none"/>`+structure;
  const hit=asset[a.id]?`<rect data-landmark-hit x="${p.x-(a.id==='goal'?82.5:62.5)}" y="${p.y-(a.id==='goal'?205:a.id==='watch'?150:120)}" width="${a.id==='goal'?165:125}" height="${(a.id==='goal'?205:a.id==='watch'?150:120)+30}" fill="transparent" pointer-events="all"/>`:'';
  entries.push({depth:a.position.x+a.position.y,order:2,markup:`<g data-anchor="${html(a.id)}" class="iso-landmark">${structure}${hit}<text x="${p.x}" y="${p.y+30}" text-anchor="middle" class="iso-label">${symbols[a.id]}</text></g>`});
 }
 for(const door of Object.values(s.runtime.doors)){if(door.open||!visible.has(`${door.point.x},${door.point.y}`))continue;const p=projectIso(door.point.x,door.point.y,s.runtime.visual[`${door.point.x},${door.point.y}`].height);entries.push({depth:door.point.x+door.point.y,order:3,markup:prop(p.x,p.y,'wall')});}
 for(const a of Object.values(s.runtime.actors)){const key=`${a.position.x},${a.position.y}`;if(!visible.has(key))continue;const p=projectIso(a.position.x,a.position.y,s.runtime.visual[key].height);const image=CHARACTER_PLACEHOLDER_URL;entries.push({depth:a.position.x+a.position.y,order:4,markup:`<g data-actor="${html(a.storyNpcId??'player')}" class="iso-actor ${a.actorId===s.playerActorId?'iso-player':''}" aria-label="${html(a.profile.name)}" role="button" tabindex="0"><ellipse cx="${p.x}" cy="${p.y+4}" rx="14" ry="6" fill="#0b1c2066"/>${a.actorId===s.playerActorId?`<ellipse cx="${p.x}" cy="${p.y+3}" rx="18" ry="9" fill="none" stroke="#e8ce90" stroke-width="2"/>`:''}<image data-character="${html(a.actorId)}" href="${image}" x="${p.x-16}" y="${p.y-61}" width="32" height="64" ${a.hp===0?'opacity=".35" transform="rotate(75 '+p.x+' '+p.y+')"':''}/><text x="${p.x}" y="${p.y-68}" text-anchor="middle" class="iso-name">${html(a.actorId===s.playerActorId?'你':a.profile.name)}${a.hp===0?' · 倒下':''}</text></g>`});}
 // Paint all ground before entities, then sort their feet. Ground no longer covers buildings.
 entries.sort((a,b)=>a.depth-b.depth||a.order-b.order);return `<defs>${sceneryDefs()}</defs><g class="iso-ground">${ground.join('')}</g><g class="iso-depth">${entries.map(e=>e.markup).join('')}</g>`;
}
export function battleSceneOrigin(s:DeepReadonly<AdventureSnapshot>){const p=s.runtime.actors[s.playerActorId].position,h=s.runtime.visual[`${Math.round(p.x)},${Math.round(p.y)}`]?.height??0;return projectIso(p.x-1,p.y-3,h);}
export function renderIsometricBattle(s:DeepReadonly<AdventureSnapshot>,movement:readonly {x:number;y:number;cost:number}[]=[]):string {
 const b=s.runtime.encounter!,result:string[]=[],reachable=new Map(movement.map(p=>[`${p.x},${p.y}`,p.cost]));
 for(let y=0;y<7;y++)for(let x=0;x<9;x++){const blocked=b.obstacles.some(p=>p.x===x&&p.y===y),p=projectIso(x,y);result.push(`<g data-battle-point="${x},${y}" class="iso-tile" role="button" tabindex="0" aria-label="战场 ${x},${y}${reachable.has(`${x},${y}`)?`，移动消耗 ${reachable.get(`${x},${y}`)} 格`:blocked?'，障碍':'，当前不可移动'}">${diamond(x,y,0,blocked?'#263e35dd':reachable.has(`${x},${y}`)?'#a4c58e55':'#1d322f75',reachable.has(`${x},${y}`)?'#e6d2a4aa':'#b2b49735')}${blocked?prop(p.x,p.y,'rock'):''}</g>`);}
 for(const c of [...b.participants].sort((a,b)=>a.position.x+a.position.y-b.position.x-b.position.y)){const a=s.runtime.actors[c.actorId],p=projectIso(c.position.x,c.position.y);result.push(`<g data-battle-actor="${html(c.actorId)}" class="iso-actor" role="button" tabindex="0" aria-label="${html(a.profile.name)}，生命 ${a.hp}/${a.maxHp}"><ellipse cx="${p.x}" cy="${p.y+5}" rx="16" ry="7" fill="none" stroke="${a.actorId===s.playerActorId?'#e6c986':'#cf9983'}" stroke-width="2"/><image data-character="${html(a.actorId)}" href="${CHARACTER_PLACEHOLDER_URL}" x="${p.x-21}" y="${p.y-81}" width="42" height="84" opacity="${a.hp===0?.3:1}"/><text x="${p.x}" y="${p.y-108}" text-anchor="middle" class="iso-name"><tspan x="${p.x}">${html(a.profile.name)}</tspan><tspan x="${p.x}" dy="12" font-size="9">${a.hp}/${a.maxHp}</tspan></text></g>`);}
 const origin=battleSceneOrigin(s);return `<g data-battle-scene transform="translate(${origin.x} ${origin.y})">${result.join('')}</g>`;
}
