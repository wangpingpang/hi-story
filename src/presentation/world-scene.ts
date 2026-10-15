import type {AdventureSnapshot} from '../application';
import type {DeepReadonly} from '../contracts';
import {projectIso} from './isometric';
import {drawWorldAsset,drawGroundTexture,loadWorldArt,type WorldAsset} from './world-assets';
import {assembledCharacterUrl} from './character-art';
import {escapeHtml as html} from './html';
import type {Weather} from './environment';
import {AdventureMotionArt} from './adventure-motion-art';
import {composeWorld,groundMaterial,landmarkStyle,occludesPlayer,type ScenicProp} from './world-composition';
export const worldGridKey=(p:{x:number;y:number}):string=>`${Math.round(p.x)},${Math.round(p.y)}`;
const gridKey=worldGridKey;
export function worldHeight(s:DeepReadonly<AdventureSnapshot>,p:{x:number;y:number}):number{return s.runtime.visual[gridKey(p)]?.height??0;}
const labels:Record<string,string>={spawn:'旅人村落',notes:'旅行笔记',market:'商道营地',supply:'林间补给',shrine:'银月祭坛',cache:'遗迹锁箱',watch:'风蚀哨塔',gate:'坍塌捷径',goal:'暮光塔'};
const landmarks:Record<string,WorldAsset>={spawn:'campfire',notes:'sign',market:'market-stall',supply:'wagon',shrine:'altar',cache:'chest',watch:'runestone',gate:'stairs',goal:'tower'};
export function renderWorldHits(s:DeepReadonly<AdventureSnapshot>):string{
 const visible=new Set(s.runtime.visible),parts:string[]=[];
 for(const a of s.runtime.map.anchors){
  if(!visible.has(gridKey(a.position))||!landmarks[a.id])continue;
  const p=projectIso(a.position.x,a.position.y,worldHeight(s,a.position)),v=landmarkStyle(a.id);
  parts.push(`<g data-anchor="${html(a.id)}" class="iso-landmark" role="button" tabindex="0" aria-label="${labels[a.id]}"><rect data-landmark-hit x="${p.x+v.dx-v.width/2}" y="${p.y+v.dy-v.height}" width="${v.width}" height="${v.height+12}" fill="transparent" pointer-events="all"/></g>`);
 }
 for(const a of Object.values(s.runtime.actors)){
  if(!visible.has(gridKey(a.position)))continue;const p=projectIso(a.position.x,a.position.y,worldHeight(s,a.position));
  parts.push(`<g data-actor="${html(a.storyNpcId??'player')}" class="iso-actor ${a.actorId===s.playerActorId?'iso-player':''}" role="button" tabindex="0" aria-label="${html(a.profile.name)}"><rect x="${p.x-18}" y="${p.y-66}" width="36" height="75" fill="transparent" pointer-events="all"/></g>`);
 }
 return parts.join('');
}
/** Cached scenery, fog and camera are presentation only. Runtime owns all positions. */
export class WorldScene{
 readonly motionArt=new AdventureMotionArt();readonly canvas=document.createElement('canvas');
 private s?:DeepReadonly<AdventureSnapshot>;private svg?:SVGSVGElement;
 private camera={x:0,y:0,zoom:1};private target=this.camera;private actor={x:0,y:0};
 private frame=0;private stopped=false;private loaded=false;private ground=document.createElement('canvas');private fog=document.createElement('canvas');private softFog=document.createElement('canvas');private cache='';private fogKey='';
 private weather:Weather='sun';private scenery:ScenicProp[]=[];private route:readonly {x:number;y:number}[]=[];
 private offset={x:0,y:100};private portraits=new Map<string,HTMLImageElement>();private lastTime=0;private dirty=true;
 constructor(){this.canvas.className='world-canvas';this.canvas.setAttribute('aria-hidden','true');void loadWorldArt().then(()=>{this.loaded=true;this.cache='';}).catch(()=>{this.canvas.dataset.error='art-load';});this.frame=requestAnimationFrame(t=>this.paint(t));}
 setRoute(route:readonly {x:number;y:number}[]){this.route=route;this.dirty=true;}
 setState(s:DeepReadonly<AdventureSnapshot>,camera:{x:number;y:number;zoom:number},svg:SVGSVGElement,weather:Weather){
  if(this.s?.runId!==s.runId){this.cache='';this.fogKey='';this.camera={...camera};this.actor={...s.runtime.actors[s.playerActorId].position};}
  this.s=s;this.target=camera;this.svg=svg;this.weather=weather;this.dirty=true;this.motionArt.observe(s);
  for(const a of Object.values(s.runtime.actors)){const url=assembledCharacterUrl(a.profile.appearance,a.profile.gender);if(!this.portraits.has(url)){const image=new Image();image.src=url;this.portraits.set(url,image);}}
 }
 private diamond(ctx:CanvasRenderingContext2D,x:number,y:number){ctx.beginPath();ctx.moveTo(x,y-16.3);ctx.lineTo(x+32.4,y);ctx.lineTo(x,y+16.3);ctx.lineTo(x-32.4,y);ctx.closePath();}
 private buildGround(s:DeepReadonly<AdventureSnapshot>){
  const {width:w,height:h}=s.runtime.map.bounds;this.offset={x:h*32+180,y:300};this.ground.width=(w+h)*32+360;this.ground.height=(w+h)*16+600;
  const ctx=this.ground.getContext('2d')!;ctx.translate(this.offset.x,this.offset.y);
  const patterns=new Map<WorldAsset,CanvasPattern>();
  for(const id of ['forest-floor','wet-earth','moss-stone','leaves','meadow','cobble'] as WorldAsset[]){const tile=document.createElement('canvas');tile.width=tile.height=140;drawGroundTexture(tile.getContext('2d')!,id,0,0,140,140);patterns.set(id,ctx.createPattern(tile,'repeat')!);}
  const cells=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)cells.push({x,y});cells.sort((a,b)=>a.x+a.y-b.x-b.y);
  for(const {x,y}of cells){
   const v=s.runtime.visual[`${x},${y}`],p=projectIso(x,y,v.height);
   for(const [dx,dy,side]of [[1,0,1],[0,1,-1]]){
    const next=s.runtime.visual[`${x+dx},${y+dy}`]?.height??0,difference=(v.height-next)*16;if(difference<=.1)continue;
    ctx.beginPath();ctx.moveTo(p.x,p.y+16);ctx.lineTo(p.x+32*side,p.y);ctx.lineTo(p.x+32*side,p.y+difference);ctx.lineTo(p.x,p.y+16+difference);ctx.closePath();ctx.fillStyle=side===1?'#354238':'#566049';ctx.fill();
    ctx.save();ctx.clip();ctx.strokeStyle='#84916a55';ctx.lineWidth=2;for(let step=8;step<difference;step+=9){ctx.beginPath();ctx.moveTo(p.x-34,p.y+step+16);ctx.lineTo(p.x+34,p.y+step-16);ctx.stroke();}ctx.restore();
   }
   this.diamond(ctx,p.x,p.y);ctx.fillStyle=patterns.get(groundMaterial(s,x,y))!;ctx.fill();ctx.fillStyle=s.runtime.map.cells[y][x].regionId?'#b9b97c16':'#102c2470';ctx.fill();
  }
  for(const region of s.runtime.map.regions){
   const center=s.runtime.map.anchors.find(a=>a.regionId===region.id);if(!center)continue;
   const origin=projectIso(center.position.x,center.position.y,worldHeight(s,center.position));
   for(const t of s.runtime.map.terrain.filter(t=>t.regionId===region.id&&['cottage','apothecary','inn','smithy','well','market-stall'].includes(t.terrainRef))){
    const end=projectIso(t.position.x+.8,t.position.y+1.4,worldHeight(s,t.position));ctx.lineCap='round';ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.quadraticCurveTo(origin.x,end.y,end.x,end.y);ctx.strokeStyle='#a3916655';ctx.lineWidth=29;ctx.stroke();ctx.strokeStyle='#c8b88d55';ctx.lineWidth=16;ctx.stroke();
   }
   if(['home','camp'].includes(region.id)){ctx.save();ctx.beginPath();ctx.ellipse(origin.x,origin.y+5,75,32,0,0,Math.PI*2);ctx.clip();ctx.globalAlpha=.64;ctx.fillStyle=patterns.get('cobble')!;ctx.fillRect(origin.x-80,origin.y-30,160,70);ctx.restore();}
  }
  this.scenery=composeWorld(s);this.fogKey='';
 }
 private buildFog(s:DeepReadonly<AdventureSnapshot>){
  const key=s.runtime.visible.join(';')+':'+s.runtime.explored.length;if(this.fogKey===key)return;this.fogKey=key;
  const scale=.25;this.fog.width=Math.ceil(this.ground.width*scale);this.fog.height=Math.ceil(this.ground.height*scale);
  const c=this.fog.getContext('2d')!;c.scale(scale,scale);c.fillStyle='#0c211bd9';c.fillRect(0,0,this.ground.width,this.ground.height);c.translate(this.offset.x,this.offset.y);c.globalCompositeOperation='destination-out';
  const visible=new Set(s.runtime.visible);
  for(const key of s.runtime.explored){const [x,y]=key.split(',').map(Number),p=projectIso(x,y,s.runtime.visual[key]?.height??0);c.fillStyle=visible.has(key)?'#000':'#0005';c.beginPath();c.ellipse(p.x,p.y-25,54,52,0,0,Math.PI*2);c.fill();}
  this.softFog.width=this.fog.width;this.softFog.height=this.fog.height;const blurred=this.softFog.getContext('2d')!;blurred.filter='blur(4px)';blurred.drawImage(this.fog,0,0);
 }
 private paint(now:number){
  if(this.stopped)return;this.frame=requestAnimationFrame(t=>this.paint(t));const s=this.s;if(!s||!this.svg||!this.canvas.isConnected||this.canvas.hidden)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!this.dirty&&now-this.lastTime<(reduced?150:30))return;
  const dt=Math.min(.05,(now-(this.lastTime||now))/1000);this.lastTime=now;this.dirty=false;const factor=reduced?1:1-Math.exp(-24*dt),a=s.runtime.actors[s.playerActorId];
  for(const k of ['x','y','zoom'] as const)this.camera[k]+=(this.target[k]-this.camera[k])*factor;
  this.actor.x+=(a.position.x-this.actor.x)*factor;this.actor.y+=(a.position.y-this.actor.y)*factor;
  const width=innerWidth,height=innerHeight,dpr=Math.min(2,devicePixelRatio||1);if(this.canvas.width!==width*dpr||this.canvas.height!==height*dpr){this.canvas.width=width*dpr;this.canvas.height=height*dpr;}
  const box=`${this.camera.x-width/this.camera.zoom/2} ${this.camera.y-height/this.camera.zoom/2} ${width/this.camera.zoom} ${height/this.camera.zoom}`;if(this.svg.getAttribute('viewBox')!==box)this.svg.setAttribute('viewBox',box);
  const ctx=this.canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.translate(width/2,height/2);ctx.scale(this.camera.zoom,this.camera.zoom);ctx.translate(-this.camera.x,-this.camera.y);
  const cache=s.runId+':'+this.loaded;if(this.cache!==cache){this.buildGround(s);this.cache=cache;}
  ctx.drawImage(this.ground,-this.offset.x,-this.offset.y);this.buildFog(s);
  const visible=new Set(s.runtime.visible),entries:{depth:number;draw:()=>void}[]=[];
  const onScreen=(p:{x:number;y:number},margin=260)=>Math.abs(p.x-this.camera.x)<width/this.camera.zoom/2+margin&&Math.abs(p.y-this.camera.y)<height/this.camera.zoom/2+margin;
  const player=projectIso(this.actor.x,this.actor.y,worldHeight(s,a.position));let faded=0;
  const hud=document.querySelector<HTMLImageElement>('.actor-hud img');if(hud){const portrait=this.motionArt.portrait(s.playerActorId);if(portrait&&hud.src!==portrait)hud.src=portrait;}
  const prop=(asset:WorldAsset,p:{x:number;y:number},w:number,h:number,solid=true)=>{
   const occluded=solid&&occludesPlayer({...p,width:w,height:h},player);if(occluded)faded++;
   ctx.globalAlpha=occluded?.28:1;ctx.fillStyle='#0c21193d';ctx.beginPath();ctx.ellipse(p.x+8,p.y+2,w*.27,Math.min(14,w*.11),0,0,7);ctx.fill();drawWorldAsset(ctx,asset,p.x,p.y,w,h);ctx.globalAlpha=1;
  };
  for(const t of this.scenery){const p=projectIso(t.x,t.y,worldHeight(s,t));if(onScreen(p))entries.push({depth:t.x+t.y,draw:()=>prop(t.asset,p,t.width,t.height,t.solid)});}
  for(const t of s.runtime.map.terrain){
   const p0={x:t.cells.reduce((n,p)=>n+p.x,0)/t.cells.length,y:t.cells.reduce((n,p)=>n+p.y,0)/t.cells.length},p=projectIso(p0.x,p0.y,worldHeight(s,t.position));if(!onScreen(p))continue;
   const asset=t.terrainRef as WorldAsset,building=['cottage','apothecary','inn','smithy','tower'].includes(asset),w=asset==='lamp'?35:building?175:t.cells.length>1?125:90,h=asset==='lamp'?85:building?215:t.cells.length>1?145:125;
   entries.push({depth:p0.x+p0.y,draw:()=>{prop(asset,p,w,h);if(asset==='lamp'){const glow=ctx.createRadialGradient(p.x,p.y-55,0,p.x,p.y-55,65);glow.addColorStop(0,'#ffd37f44');glow.addColorStop(1,'#ffd37f00');ctx.fillStyle=glow;ctx.fillRect(p.x-65,p.y-120,130,130);}}});
  }
  for(const anchor of s.runtime.map.anchors){
   if(!visible.has(gridKey(anchor.position))||!landmarks[anchor.id])continue;const p=projectIso(anchor.position.x,anchor.position.y,worldHeight(s,anchor.position)),v=landmarkStyle(anchor.id);
   entries.push({depth:anchor.position.x+anchor.position.y-.1,draw:()=>{if(anchor.id==='spawn'){const g=ctx.createRadialGradient(p.x+v.dx,p.y,2,p.x+v.dx,p.y,65);g.addColorStop(0,'#ffcd7744');g.addColorStop(1,'#ffc96600');ctx.fillStyle=g;ctx.fillRect(p.x+v.dx-65,p.y-65,130,130);}prop(landmarks[anchor.id],{x:p.x+v.dx,y:p.y+v.dy},v.width,v.height,false);if(anchor.id!=='spawn'){ctx.font='10px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#173226';ctx.strokeText(labels[anchor.id],p.x+v.dx,p.y+20);ctx.fillStyle='#ead6a4';ctx.fillText(labels[anchor.id],p.x+v.dx,p.y+20);}}});
  }
  for(const door of Object.values(s.runtime.doors)){if(door.open||!visible.has(gridKey(door.point)))continue;const p=projectIso(door.point.x,door.point.y,worldHeight(s,door.point));entries.push({depth:door.point.x+door.point.y+.1,draw:()=>prop('rock-cluster',p,80,75)});}
  if(this.route.length){ctx.strokeStyle='#f2d59899';ctx.lineWidth=1.5;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(player.x,player.y);for(const node of this.route){const p=projectIso(node.x,node.y,worldHeight(s,node));ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.setLineDash([]);const end=this.route.at(-1)!,p=projectIso(end.x,end.y,worldHeight(s,end));ctx.strokeStyle='#f4d494';ctx.beginPath();ctx.ellipse(p.x,p.y,15,7,0,0,7);ctx.stroke();}
  for(const actor of Object.values(s.runtime.actors)){
   if(s.runtime.encounter?.status==='active'&&s.runtime.encounter.participants.some(p=>p.actorId===actor.actorId))continue;
   if(!visible.has(gridKey(actor.position)))continue;const actual=actor.actorId===s.playerActorId?this.actor:actor.position,p=projectIso(actual.x,actual.y,worldHeight(s,actor.position)),url=assembledCharacterUrl(actor.profile.appearance,actor.profile.gender),image=this.portraits.get(url);
   entries.push({depth:actual.x+actual.y+.2,draw:()=>{
    ctx.fillStyle='#0a201b80';ctx.beginPath();ctx.ellipse(p.x,p.y+2,11,5,0,0,7);ctx.fill();if(actor.actorId===s.playerActorId){ctx.strokeStyle='#e8c77ba0';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(p.x,p.y+3,14,6,0,0,7);ctx.stroke();}
    ctx.imageSmoothingEnabled=false;ctx.globalAlpha=actor.hp===0?.35:1;const motion=this.motionArt.frame(actor.actorId,now,this.weather);
    if(motion){ctx.drawImage(motion.image,p.x-48,p.y-82.25,96,96);if(actor.actorId===s.playerActorId){this.canvas.dataset.motion=motion.action;this.canvas.dataset.direction=motion.direction;}}
    else if(image?.complete&&image.naturalWidth)ctx.drawImage(image,p.x-16,p.y-61,32,64);
    ctx.globalAlpha=1;ctx.imageSmoothingEnabled=true;ctx.font='10px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#14281f';const name=actor.actorId===s.playerActorId?'旅人':actor.profile.name;ctx.strokeText(name,p.x,p.y-69);ctx.fillStyle='#f0dfb4';ctx.fillText(name,p.x,p.y-69);
    if(actor.storyNpcId&&actor.hp>0){const near=Math.hypot(actual.x-a.position.x,actual.y-a.position.y)<=1.12;ctx.fillStyle=near?'#eed29a':'#d5d9bc';ctx.font='9px system-ui';ctx.strokeText(near?'[ E ] 交谈':'◇ 交谈',p.x,p.y-83);ctx.fillText(near?'[ E ] 交谈':'◇ 交谈',p.x,p.y-83);}
   }});
  }
  entries.sort((a,b)=>a.depth-b.depth);for(const e of entries)e.draw();
  ctx.drawImage(this.softFog,-this.offset.x,-this.offset.y,this.ground.width,this.ground.height);
  ctx.setTransform(dpr,0,0,dpr,0,0);if(this.weather==='sun'||this.weather==='wind'){ctx.fillStyle='#f4dea155';for(let i=0;i<16;i++){const x=(i*197+(reduced?0:now*.008))%width,y=(i*113+Math.sin(now*.0005+i)*14)%height;ctx.globalAlpha=.25+(i%3)*.12;ctx.fillRect(x,y,1.4,1.4);}ctx.globalAlpha=1;}
  this.canvas.dataset.rendered='true';this.canvas.dataset.art=this.loaded?'ready':'loading';this.canvas.dataset.fog='soft';this.canvas.dataset.scenery=String(this.scenery.length);this.canvas.dataset.faded=String(faded);
 }
 dispose(){this.stopped=true;cancelAnimationFrame(this.frame);this.canvas.remove();this.motionArt.reset();}
}
export function drawMinimap(canvas:HTMLCanvasElement,s:DeepReadonly<AdventureSnapshot>):void{
 const c=canvas.getContext('2d')!,w=s.runtime.map.bounds.width,h=s.runtime.map.bounds.height,k=Math.min(120/w,100/h);c.clearRect(0,0,128,108);c.fillStyle='#112c2b';c.fillRect(0,0,128,108);
 const explored=new Set(s.runtime.explored);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(explored.has(`${x},${y}`)){c.fillStyle=s.runtime.map.cells[y][x].walkable?'#8d9a6d':'#355148';c.fillRect(4+x*k,4+y*k,k,k);}
 const a=s.runtime.actors[s.playerActorId].position;c.fillStyle='#ffe1a2';c.beginPath();c.arc(4+a.x*k,4+a.y*k,2.5,0,7);c.fill();
}
