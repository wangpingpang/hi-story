import type { AdventureSnapshot } from '../application';
import type { DeepReadonly } from '../contracts';
import { projectIso } from './isometric';
import { drawWorldAsset,drawGroundTexture,loadWorldArt,type WorldAsset } from './world-assets';
import { assembledCharacterUrl } from './character-art';
import { escapeHtml as html } from './html';
import type { Weather } from './environment';
export const worldGridKey=(p:{x:number;y:number}):string=>`${Math.round(p.x)},${Math.round(p.y)}`;
const gridKey=worldGridKey;

export function worldHeight(s:DeepReadonly<AdventureSnapshot>,p:{x:number;y:number}):number{return s.runtime.visual[gridKey(p)]?.height??0;}
const labels:Record<string,string>={spawn:'旅人村落',notes:'旅行笔记',market:'商道营地',supply:'林间补给',shrine:'银月祭坛',cache:'遗迹锁箱',watch:'风蚀哨塔',gate:'坍塌捷径',goal:'暮光塔'};
const landmarks:Record<string,WorldAsset>={spawn:'campfire',notes:'sign',market:'market-stall',supply:'wagon',shrine:'altar',cache:'chest',watch:'runestone',gate:'stairs',goal:'tower'};
export function renderWorldHits(s:DeepReadonly<AdventureSnapshot>):string{
 const visible=new Set(s.runtime.visible),parts:string[]=[];
 for(const a of Object.values(s.runtime.actors)){
  if(!visible.has(gridKey(a.position)))continue;const p=projectIso(a.position.x,a.position.y,worldHeight(s,a.position));
  parts.push(`<g data-actor="${html(a.storyNpcId??'player')}" class="iso-actor ${a.actorId===s.playerActorId?'iso-player':''}" role="button" tabindex="0" aria-label="${html(a.profile.name)}"><rect x="${p.x-18}" y="${p.y-66}" width="36" height="75" fill="transparent" pointer-events="all"/></g>`);
 }
 for(const a of s.runtime.map.anchors){if(!visible.has(gridKey(a.position))||!landmarks[a.id])continue;const p=projectIso(a.position.x,a.position.y,worldHeight(s,a.position)),h=a.id==='goal'?180:100;
  parts.push(`<g data-anchor="${html(a.id)}" class="iso-landmark" role="button" tabindex="0" aria-label="${labels[a.id]}"><rect data-landmark-hit x="${p.x-55}" y="${p.y-h}" width="110" height="${h+20}" fill="transparent" pointer-events="all"/></g>`);
 }return parts.join('');
}

/** Presentation cache only. Runtime positions are the only movement authority. */
export class WorldScene {
 readonly canvas=document.createElement('canvas');
 private s?:DeepReadonly<AdventureSnapshot>;private svg?:SVGSVGElement;
 private camera={x:0,y:0,zoom:1};private target=this.camera;private actor={x:0,y:0};
 private frame=0;private stopped=false;private loaded=false;private ground=document.createElement('canvas');private cache='';
 private weather:Weather='sun';
 private offset={x:0,y:100};private portraits=new Map<string,HTMLImageElement>();private lastTime=0;private dirty=true;
 constructor(){this.canvas.className='world-canvas';this.canvas.setAttribute('aria-hidden','true');void loadWorldArt().then(()=>{this.loaded=true;this.cache='';}).catch(()=>{this.canvas.dataset.error='art-load';});this.frame=requestAnimationFrame(t=>this.paint(t));}
 setState(s:DeepReadonly<AdventureSnapshot>,camera:{x:number;y:number;zoom:number},svg:SVGSVGElement,weather:Weather){
  if(this.s?.runId!==s.runId){this.cache='';this.camera={...camera};this.actor={...s.runtime.actors[s.playerActorId].position};}
  this.s=s;this.target=camera;this.svg=svg;this.weather=weather;this.dirty=true;
  for(const a of Object.values(s.runtime.actors)){const url=assembledCharacterUrl(a.profile.appearance,a.profile.gender);if(!this.portraits.has(url)){const image=new Image();image.src=url;this.portraits.set(url,image);}}
 }
 private diamond(ctx:CanvasRenderingContext2D,x:number,y:number,color:string){ctx.beginPath();ctx.moveTo(x,y-16);ctx.lineTo(x+32,y);ctx.lineTo(x,y+16);ctx.lineTo(x-32,y);ctx.closePath();ctx.fillStyle=color;ctx.fill();}
 private buildGround(s:DeepReadonly<AdventureSnapshot>){
  const w=s.runtime.map.bounds.width,h=s.runtime.map.bounds.height;this.offset={x:h*32+100,y:120};this.ground.width=(w+h)*32+200;this.ground.height=(w+h)*16+220;
  const ctx=this.ground.getContext('2d')!;ctx.translate(this.offset.x,this.offset.y);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const v=s.runtime.visual[`${x},${y}`],p=projectIso(x,y,v.height),color=({grass:'#63845a',stone:'#89907b',earth:'#aa9873',water:'#234644'} as const)[v.material];
   if(v.height>0){ctx.fillStyle='#384c40';ctx.beginPath();ctx.moveTo(p.x-32,p.y);ctx.lineTo(p.x,p.y+16);ctx.lineTo(p.x+32,p.y);ctx.lineTo(p.x+32,p.y+16*v.height);ctx.lineTo(p.x,p.y+16+16*v.height);ctx.lineTo(p.x-32,p.y+16*v.height);ctx.fill();}
   this.diamond(ctx,p.x,p.y,color);ctx.save();ctx.clip();ctx.globalAlpha=v.material==='water'?.5:.75;
   const texture:WorldAsset=v.material==='grass'?((x*3+y)%5===0?'dry-grass':'meadow'):v.material==='stone'?'moss-stone':v.material==='earth'?'sand':'deep-water';drawGroundTexture(ctx,texture,p.x-32,p.y-16,64,32);ctx.restore();
  }
 }
 private paint(now:number){
  if(this.stopped)return;this.frame=requestAnimationFrame(t=>this.paint(t));const s=this.s;if(!s||!this.svg||!this.canvas.isConnected)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced&&!this.dirty&&now-this.lastTime<150)return;
  const dt=Math.min(.05,(now-(this.lastTime||now))/1000);this.lastTime=now;this.dirty=false;
  const factor=reduced?1:1-Math.exp(-18*dt),a=s.runtime.actors[s.playerActorId];
  for(const k of ['x','y','zoom'] as const)this.camera[k]+=(this.target[k]-this.camera[k])*factor;
  this.actor.x+=(a.position.x-this.actor.x)*factor;this.actor.y+=(a.position.y-this.actor.y)*factor;
  const width=innerWidth,height=innerHeight,dpr=Math.min(2,devicePixelRatio||1);if(this.canvas.width!==width*dpr||this.canvas.height!==height*dpr){this.canvas.width=width*dpr;this.canvas.height=height*dpr;}
  const box=`${this.camera.x-width/this.camera.zoom/2} ${this.camera.y-height/this.camera.zoom/2} ${width/this.camera.zoom} ${height/this.camera.zoom}`;if(this.svg.getAttribute('viewBox')!==box)this.svg.setAttribute('viewBox',box);
  const ctx=this.canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.translate(width/2,height/2);ctx.scale(this.camera.zoom,this.camera.zoom);ctx.translate(-this.camera.x,-this.camera.y);
  const cache=s.seed+':'+s.runtime.map.bounds.width+':'+this.loaded;if(this.cache!==cache){this.buildGround(s);this.cache=cache;}
  ctx.drawImage(this.ground,-this.offset.x,-this.offset.y);
  const explored=new Set(s.runtime.explored),visible=new Set(s.runtime.visible),entries:{depth:number;draw:()=>void}[]=[];
  const onScreen=(p:{x:number;y:number},margin=200)=>Math.abs(p.x-this.camera.x)<width/this.camera.zoom/2+margin&&Math.abs(p.y-this.camera.y)<height/this.camera.zoom/2+margin;
  for(let y=0;y<s.runtime.map.bounds.height;y++)for(let x=0;x<s.runtime.map.bounds.width;x++){
   const k=`${x},${y}`,v=s.runtime.visual[k],p=projectIso(x,y,v.height);if(!onScreen(p,60))continue;
   if(!visible.has(k)){ctx.globalAlpha=explored.has(k)?.48:.96;this.diamond(ctx,p.x,p.y,'#132d2c');ctx.globalAlpha=1;}
   else if(s.runtime.map.cells[y][x].walkable&&v.material==='grass'&&(x*7+y*11)%17===0)entries.push({depth:x+y-.4,draw:()=>drawWorldAsset(ctx,(x+y)%2?'wildflowers':'fern',p.x+14,p.y+3,28,23)});
  }
  for(const t of s.runtime.map.terrain){if(!explored.has(gridKey(t.position)))continue;const cells=t.cells,p0={x:cells.reduce((n,p)=>n+p.x,0)/cells.length,y:cells.reduce((n,p)=>n+p.y,0)/cells.length},p=projectIso(p0.x,p0.y,worldHeight(s,t.position));if(!onScreen(p))continue;const asset=t.terrainRef as WorldAsset;
   entries.push({depth:p0.x+p0.y,draw:()=>{ctx.globalAlpha=visible.has(gridKey(t.position))?1:.35;drawWorldAsset(ctx,asset,p.x,p.y,asset==='lamp'?45:cells.length>1?155:90,asset==='lamp'?88:cells.length>1?165:130);ctx.globalAlpha=1;}});
  }
  for(const a of s.runtime.map.anchors){if(!visible.has(gridKey(a.position))||!landmarks[a.id])continue;const p=projectIso(a.position.x,a.position.y,worldHeight(s,a.position));entries.push({depth:a.position.x+a.position.y,draw:()=>{
   if(['spawn','market','goal','shrine'].includes(a.id)){const g=ctx.createRadialGradient(p.x,p.y-12,2,p.x,p.y-12,85);g.addColorStop(0,'#ffcd773b');g.addColorStop(1,'#ffc96600');ctx.fillStyle=g;ctx.fillRect(p.x-85,p.y-97,170,170);}
   drawWorldAsset(ctx,landmarks[a.id],p.x,p.y,a.id==='goal'?150:95,a.id==='goal'?185:110);ctx.font='10px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#17382d';ctx.strokeText(labels[a.id],p.x,p.y+21);ctx.fillStyle='#ead6a4';ctx.fillText(labels[a.id],p.x,p.y+21);
  }});}
  for(const door of Object.values(s.runtime.doors)){if(door.open||!visible.has(gridKey(door.point)))continue;const p=projectIso(door.point.x,door.point.y,worldHeight(s,door.point));entries.push({depth:door.point.x+door.point.y+.1,draw:()=>drawWorldAsset(ctx,'rock-cluster',p.x,p.y,80,75)});}
  for(const actor of Object.values(s.runtime.actors)){if(!visible.has(gridKey(actor.position)))continue;const actual=actor.actorId===s.playerActorId?this.actor:actor.position,p=projectIso(actual.x,actual.y,worldHeight(s,actor.position)),url=assembledCharacterUrl(actor.profile.appearance,actor.profile.gender),image=this.portraits.get(url);
   entries.push({depth:actual.x+actual.y+.2,draw:()=>{ctx.fillStyle='#0a201b70';ctx.beginPath();ctx.ellipse(p.x,p.y+2,13,6,0,0,Math.PI*2);ctx.fill();if(actor.actorId===s.playerActorId){ctx.strokeStyle='#e8c77b';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y+3,17,8,0,0,Math.PI*2);ctx.stroke();}ctx.imageSmoothingEnabled=false;ctx.globalAlpha=actor.hp===0?.35:1;if(image?.complete&&image.naturalWidth)ctx.drawImage(image,p.x-16,p.y-61,32,64);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=true;ctx.font='10px system-ui';ctx.textAlign='center';ctx.strokeStyle='#17382d';ctx.lineWidth=3;ctx.strokeText(actor.actorId===s.playerActorId?'你':actor.profile.name,p.x,p.y-67);ctx.fillStyle='#f0dfb4';ctx.fillText(actor.actorId===s.playerActorId?'你':actor.profile.name,p.x,p.y-67);}});
  }
  entries.sort((a,b)=>a.depth-b.depth);for(const e of entries)e.draw();
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=this.weather==='mist'?.16:.06;
  const overlay:WorldAsset=({sun:'sun-rays',rain:'rain-streaks',snow:'snowflakes',mist:'mist',wind:'wind-leaves'} as const)[this.weather];
  const drift=reduced?0:(now/1000*(this.weather==='wind'?35:8))%160;
  for(let i=0;i<3;i++)drawWorldAsset(ctx,overlay,width*(i+.5)/3+drift-80,height*.8,width*.65,height*.85);
  ctx.globalAlpha=1;
  this.canvas.dataset.rendered='true';this.canvas.dataset.art=this.loaded?'ready':'loading';
 }
 dispose(){this.stopped=true;cancelAnimationFrame(this.frame);this.canvas.remove();}
}

export function drawMinimap(canvas:HTMLCanvasElement,s:DeepReadonly<AdventureSnapshot>):void{
 const c=canvas.getContext('2d')!,w=s.runtime.map.bounds.width,h=s.runtime.map.bounds.height,k=Math.min(120/w,100/h);c.clearRect(0,0,128,108);c.fillStyle='#112c2b';c.fillRect(0,0,128,108);
 const explored=new Set(s.runtime.explored);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(explored.has(`${x},${y}`)){c.fillStyle=s.runtime.map.cells[y][x].walkable?'#8d9a6d':'#355148';c.fillRect(4+x*k,4+y*k,k,k);}
 const a=s.runtime.actors[s.playerActorId].position;c.fillStyle='#ffe1a2';c.beginPath();c.arc(4+a.x*k,4+a.y*k,2.5,0,7);c.fill();
}
