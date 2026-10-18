import type {AdventureSnapshot} from '../application';
import type {DeepReadonly} from '../contracts';
import {projectIso,battleSceneOrigin} from './isometric';
import {drawWorldAsset,drawGroundTexture,loadWorldArt,type WorldAsset} from './world-assets';
import {escapeHtml as html} from './html';
import type {Weather} from './environment';
import {AdventureMotionArt} from './adventure-motion-art';
import {composeWorld,groundMaterial,landmarkStyle,occludesPlayer,type ScenicProp} from './world-composition';
export const worldGridKey=(p:{x:number;y:number}):string=>`${Math.round(p.x)},${Math.round(p.y)}`;
const gridKey=worldGridKey;
export function worldHeight(s:DeepReadonly<AdventureSnapshot>,p:{x:number;y:number}):number{return s.runtime.visual[gridKey(p)]?.height??0;}
/** Follow the rendered body, so sprite interpolation never creates camera drift. */
export function playerCameraFocus(s:DeepReadonly<AdventureSnapshot>,rendered=s.runtime.actors[s.playerActorId].position,battleRendered?:{x:number;y:number}){
 const battle=s.runtime.encounter;
 if(battle?.status==='active'){const origin=battleSceneOrigin(s),p=battleRendered??battle.participants[0].position,screen=projectIso(p.x,p.y);return {x:origin.x+screen.x,y:origin.y+screen.y-38};}
 const p=projectIso(rendered.x,rendered.y,worldHeight(s,s.runtime.actors[s.playerActorId].position));return {x:p.x,y:p.y-32};
}
const labels:Record<string,string>={spawn:'旅人村落',notes:'旅行笔记',market:'商道营地',supply:'林间补给',shrine:'银月祭坛',cache:'遗迹锁箱',watch:'风蚀哨塔',gate:'坍塌捷径',goal:'暮光塔'};
const landmarks:Record<string,WorldAsset>={spawn:'campfire',notes:'sign',market:'market-stall',supply:'wagon',shrine:'altar',cache:'chest',watch:'runestone',gate:'stairs',goal:'tower'};
interface SceneProp {asset:WorldAsset;p:{x:number;y:number};width:number;height:number;depth:number;solid:boolean}
interface SceneRect {x:number;y:number;width:number;height:number}
const intersects=(a:SceneRect,b:SceneRect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const propRect=(t:SceneProp):SceneRect=>t.asset==='lamp'?{x:t.p.x-65,y:t.p.y-120,width:130,height:130}:{x:t.p.x-t.width/2-12,y:t.p.y-t.height-2,width:t.width+24,height:t.height+34};
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
 private battleFocus?:{x:number;y:number};
 private frame=0;private stopped=false;private loaded=false;private artPending=true;private ground=document.createElement('canvas');private fog=document.createElement('canvas');private softFog=document.createElement('canvas');private cache='';private fogKey='';
 private propImages=new Map<string,HTMLCanvasElement>();
 private props:SceneProp[]=[];private sceneryLayer=document.createElement('canvas');
 private weather:Weather='sun';private scenery:ScenicProp[]=[];private route:readonly {x:number;y:number}[]=[];
 private offset={x:0,y:100};private lastTime=0;private paintCost=0;private dirty=true;
 constructor(){this.canvas.className='world-canvas';this.canvas.setAttribute('aria-hidden','true');this.canvas.dataset.art='loading';void loadWorldArt().then(()=>{this.loaded=true;this.cache='';this.propImages.clear();}).catch(()=>{this.canvas.dataset.error='art-load';}).finally(()=>{this.artPending=false;this.dirty=true;});this.frame=requestAnimationFrame(t=>this.paint(t));}
 setRoute(route:readonly {x:number;y:number}[]){this.route=route;this.dirty=true;}
 setBattleFocus(point:{x:number;y:number}|undefined){if(this.battleFocus?.x===point?.x&&this.battleFocus?.y===point?.y)return;this.battleFocus=point;this.dirty=true;if(this.s&&this.svg?.isConnected)this.syncView(this.s);}
 setState(s:DeepReadonly<AdventureSnapshot>,camera:{x:number;y:number;zoom:number},svg:SVGSVGElement,weather:Weather){
  if(this.s?.runId!==s.runId){this.cache='';this.fogKey='';this.camera={...camera};this.actor={...s.runtime.actors[s.playerActorId].position};}
  this.s=s;this.target=camera;this.svg=svg;this.weather=weather;this.dirty=true;this.motionArt.observe(s);this.syncView(s);
 }
 private syncView(s:DeepReadonly<AdventureSnapshot>){
  const a=s.runtime.actors[s.playerActorId],focus=playerCameraFocus(s,this.actor,this.battleFocus);this.camera.x=focus.x;this.camera.y=focus.y;
  const svg=this.svg!,box=`${this.camera.x-innerWidth/this.camera.zoom/2} ${this.camera.y-innerHeight/this.camera.zoom/2} ${innerWidth/this.camera.zoom} ${innerHeight/this.camera.zoom}`;if(svg.getAttribute('viewBox')!==box)svg.setAttribute('viewBox',box);
  const hit=svg.querySelector<SVGGElement>('[data-actor="player"]');if(hit){const displayed=projectIso(this.actor.x,this.actor.y,worldHeight(s,a.position)),actual=projectIso(a.position.x,a.position.y,worldHeight(s,a.position)),transform=`translate(${displayed.x-actual.x} ${displayed.y-actual.y})`;if(hit.getAttribute('transform')!==transform)hit.setAttribute('transform',transform);}
 }
 /** Rasterize atlas crops and ground shadows once, rather than for every tree every frame. */
 private propImage(asset:WorldAsset,w:number,h:number){
  const key=`${asset}:${w}:${h}`;let image=this.propImages.get(key);if(image)return image;
  image=document.createElement('canvas');image.width=Math.ceil(w+24);image.height=Math.ceil(h+34);
  const c=image.getContext('2d')!;c.translate(image.width/2,h+2);c.fillStyle='#0c21193d';c.beginPath();c.ellipse(8,2,w*.27,Math.min(14,w*.11),0,0,7);c.fill();drawWorldAsset(c,asset,0,0,w,h);
  this.propImages.set(key,image);return image;
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
  const props:SceneProp[]=this.scenery.map(t=>({asset:t.asset,p:projectIso(t.x,t.y,worldHeight(s,t)),width:t.width,height:t.height,depth:t.x+t.y,solid:t.solid}));
  for(const t of s.runtime.map.terrain){
   const x=t.cells.reduce((n,p)=>n+p.x,0)/t.cells.length,y=t.cells.reduce((n,p)=>n+p.y,0)/t.cells.length,asset=t.terrainRef as WorldAsset,building=['cottage','apothecary','inn','smithy','tower'].includes(asset);
   props.push({asset,p:projectIso(x,y,worldHeight(s,t.position)),width:asset==='lamp'?35:building?175:t.cells.length>1?125:90,height:asset==='lamp'?85:building?215:t.cells.length>1?145:125,depth:x+y,solid:true});
  }
  this.props=props.sort((a,b)=>a.depth-b.depth);this.sceneryLayer.width=this.ground.width;this.sceneryLayer.height=this.ground.height;
  const layer=this.sceneryLayer.getContext('2d')!;layer.translate(this.offset.x,this.offset.y);
  for(const t of this.props){const image=this.propImage(t.asset,t.width,t.height);layer.drawImage(image,t.p.x-image.width/2,t.p.y-t.height-2);this.lamp(layer,t);}
 }
 private lamp(ctx:CanvasRenderingContext2D,t:SceneProp){if(t.asset!=='lamp')return;const p=t.p,glow=ctx.createRadialGradient(p.x,p.y-55,0,p.x,p.y-55,65);glow.addColorStop(0,'#ffd37f44');glow.addColorStop(1,'#ffd37f00');ctx.fillStyle=glow;ctx.fillRect(p.x-65,p.y-120,130,130);}
 private drawLayer(ctx:CanvasRenderingContext2D,image:HTMLCanvasElement,x:number,y:number,w=image.width,h=image.height){
  // Crop explicitly before scaling: software/mobile canvases otherwise rasterize the full world.
  const halfW=innerWidth/this.camera.zoom/2,halfH=innerHeight/this.camera.zoom/2,left=Math.max(x,this.camera.x-halfW-2),top=Math.max(y,this.camera.y-halfH-2),right=Math.min(x+w,this.camera.x+halfW+2),bottom=Math.min(y+h,this.camera.y+halfH+2);
  if(right<=left||bottom<=top)return;ctx.drawImage(image,(left-x)*image.width/w,(top-y)*image.height/h,(right-left)*image.width/w,(bottom-top)*image.height/h,left,top,right-left,bottom-top);
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
  if(this.stopped)return;this.frame=requestAnimationFrame(t=>this.paint(t));const s=this.s;if(!s||!this.svg||!this.canvas.isConnected||this.canvas.hidden||document.hidden||this.artPending)return;
  const a=s.runtime.actors[s.playerActorId],moving=Math.hypot(a.position.x-this.actor.x,a.position.y-this.actor.y)>.00001||Math.abs(this.target.zoom-this.camera.zoom)>.00001;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,interval=Math.max(reduced?150:moving||this.dirty?30:120,this.paintCost*2);
  if(now-this.lastTime<interval)return;const started=performance.now(),warm=this.cache===s.runId+':'+this.loaded;
  const dt=Math.min(.05,(now-(this.lastTime||now))/1000);this.lastTime=now;this.dirty=false;const factor=reduced?1:1-Math.exp(-24*dt);
  const approach=(value:number,target:number)=>Math.abs(target-value)<.00001?target:value+(target-value)*factor;
  this.camera.zoom=approach(this.camera.zoom,this.target.zoom);
  this.actor.x=approach(this.actor.x,a.position.x);this.actor.y=approach(this.actor.y,a.position.y);
  this.syncView(s);
  const width=innerWidth,height=innerHeight,dpr=Math.min(2,devicePixelRatio||1);if(this.canvas.width!==width*dpr||this.canvas.height!==height*dpr){this.canvas.width=width*dpr;this.canvas.height=height*dpr;}
  const ctx=this.canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.translate(width/2,height/2);ctx.scale(this.camera.zoom,this.camera.zoom);ctx.translate(-this.camera.x,-this.camera.y);
  const cache=s.runId+':'+this.loaded;if(this.cache!==cache){this.buildGround(s);this.cache=cache;}
  this.drawLayer(ctx,this.ground,-this.offset.x,-this.offset.y);this.buildFog(s);
  const visible=new Set(s.runtime.visible),entries:{depth:number;draw:()=>void}[]=[];
  const onScreen=(p:{x:number;y:number},margin=260)=>Math.abs(p.x-this.camera.x)<width/this.camera.zoom/2+margin&&Math.abs(p.y-this.camera.y)<height/this.camera.zoom/2+margin;
  const player=projectIso(this.actor.x,this.actor.y,worldHeight(s,a.position));let faded=0;
  for(const image of document.querySelectorAll<HTMLImageElement>('[data-actor-portrait]')){const id=image.dataset.actorPortrait!,portrait=this.motionArt.portrait(id);if(image.src!==portrait)image.src=portrait;image.dataset.characterModel=this.motionArt.modelId(id);image.dataset.characterStatus=this.motionArt.portraitStatus(id);image.title=image.dataset.characterStatus==='error'?'人物素材暂缺，正在自动重试':'';}
  const prop=(asset:WorldAsset,p:{x:number;y:number},w:number,h:number,solid=true,c=ctx)=>{
   const occluded=solid&&occludesPlayer({...p,width:w,height:h},player);if(occluded)faded++;
   const image=this.propImage(asset,w,h);c.globalAlpha=occluded?.28:1;c.drawImage(image,p.x-image.width/2,p.y-h-2);c.globalAlpha=1;
  };
  const regions:SceneRect[]=[],actorFrames=new Map<string,ReturnType<AdventureMotionArt['frame']>>();
  for(const actor of Object.values(s.runtime.actors)){
   if(!visible.has(gridKey(actor.position))||s.runtime.encounter?.status==='active'&&s.runtime.encounter.participants.some(t=>t.actorId===actor.actorId))continue;
   const actual=actor.actorId===s.playerActorId?this.actor:actor.position,p=projectIso(actual.x,actual.y,worldHeight(s,actor.position)),frame=this.motionArt.frame(actor.actorId,now,this.weather);actorFrames.set(actor.actorId,frame);regions.push({x:p.x-54,y:p.y-100,width:108,height:120});if(frame)regions.push({x:p.x-frame.pivot[0]/4-2,y:p.y-frame.pivot[1]/4-2,width:frame.image.width/4+4,height:frame.image.height/4+4});
  }
  for(const anchor of s.runtime.map.anchors){if(!visible.has(gridKey(anchor.position))||!landmarks[anchor.id])continue;const p=projectIso(anchor.position.x,anchor.position.y,worldHeight(s,anchor.position)),v=landmarkStyle(anchor.id);regions.push({x:p.x+v.dx-Math.max(v.width/2+12,70),y:p.y+v.dy-Math.max(v.height+2,70),width:Math.max(v.width+24,140),height:Math.max(v.height+34,140)});}
  for(const door of Object.values(s.runtime.doors)){if(!door.open&&visible.has(gridKey(door.point))){const p=projectIso(door.point.x,door.point.y,worldHeight(s,door.point));regions.push({x:p.x-52,y:p.y-77,width:104,height:109});}}
  for(const t of this.props)if(t.solid&&occludesPlayer({...t.p,width:t.width,height:t.height},player))regions.push(propRect(t));
  for(const t of this.props)if(onScreen(t.p)&&regions.some(r=>intersects(r,propRect(t))))entries.push({depth:t.depth,draw:()=>{prop(t.asset,t.p,t.width,t.height,t.solid);this.lamp(ctx,t);}});
  for(const anchor of s.runtime.map.anchors){
   if(!visible.has(gridKey(anchor.position))||!landmarks[anchor.id])continue;const p=projectIso(anchor.position.x,anchor.position.y,worldHeight(s,anchor.position)),v=landmarkStyle(anchor.id);
   entries.push({depth:anchor.position.x+anchor.position.y-.1,draw:()=>{if(anchor.id==='spawn'){const g=ctx.createRadialGradient(p.x+v.dx,p.y,2,p.x+v.dx,p.y,65);g.addColorStop(0,'#ffcd7744');g.addColorStop(1,'#ffc96600');ctx.fillStyle=g;ctx.fillRect(p.x+v.dx-65,p.y-65,130,130);}prop(landmarks[anchor.id],{x:p.x+v.dx,y:p.y+v.dy},v.width,v.height,false);if(anchor.id!=='spawn'){ctx.font='10px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#173226';ctx.strokeText(labels[anchor.id],p.x+v.dx,p.y+20);ctx.fillStyle='#ead6a4';ctx.fillText(labels[anchor.id],p.x+v.dx,p.y+20);}}});
  }
  for(const door of Object.values(s.runtime.doors)){if(door.open||!visible.has(gridKey(door.point)))continue;const p=projectIso(door.point.x,door.point.y,worldHeight(s,door.point));entries.push({depth:door.point.x+door.point.y+.1,draw:()=>prop('rock-cluster',p,80,75)});}
  const drawRoute=()=>{if(this.route.length){ctx.strokeStyle='#f2d59899';ctx.lineWidth=1.5;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(player.x,player.y);for(const node of this.route){const p=projectIso(node.x,node.y,worldHeight(s,node));ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.setLineDash([]);const end=this.route.at(-1)!,p=projectIso(end.x,end.y,worldHeight(s,end));ctx.strokeStyle='#f4d494';ctx.beginPath();ctx.ellipse(p.x,p.y,15,7,0,0,7);ctx.stroke();}};
  for(const actor of Object.values(s.runtime.actors)){
   if(s.runtime.encounter?.status==='active'&&s.runtime.encounter.participants.some(p=>p.actorId===actor.actorId))continue;
   if(!visible.has(gridKey(actor.position)))continue;const actual=actor.actorId===s.playerActorId?this.actor:actor.position,p=projectIso(actual.x,actual.y,worldHeight(s,actor.position));
   entries.push({depth:actual.x+actual.y+.2,draw:()=>{
    ctx.fillStyle='#0a201b80';ctx.beginPath();ctx.ellipse(p.x,p.y+2,11,5,0,0,7);ctx.fill();if(actor.actorId===s.playerActorId){ctx.strokeStyle='#e8c77ba0';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(p.x,p.y+3,14,6,0,0,7);ctx.stroke();}
    ctx.imageSmoothingEnabled=false;ctx.globalAlpha=actor.hp===0?.35:1;const motion=actorFrames.get(actor.actorId);
    if(motion){ctx.drawImage(motion.image,p.x-motion.pivot[0]/4,p.y-motion.pivot[1]/4,motion.image.width/4,motion.image.height/4);if(actor.actorId===s.playerActorId){this.canvas.dataset.motion=motion.action;this.canvas.dataset.direction=motion.direction;this.canvas.dataset.characterModel=motion.modelId;this.canvas.dataset.characterStatus=motion.status;this.canvas.dataset.sourceAction=String(motion.sourceAction);}if(motion.status==='error'){ctx.fillStyle='#f0ce9e';ctx.font='9px system-ui';ctx.textAlign='center';ctx.fillText('素材暂缺 · 自动重试',p.x,p.y+15);}}
    ctx.globalAlpha=1;ctx.imageSmoothingEnabled=true;ctx.font='10px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#14281f';const name=actor.actorId===s.playerActorId?'旅人':actor.profile.name;ctx.strokeText(name,p.x,p.y-69);ctx.fillStyle='#f0dfb4';ctx.fillText(name,p.x,p.y-69);
    if(actor.storyNpcId&&actor.hp>0){const near=Math.hypot(actual.x-a.position.x,actual.y-a.position.y)<=1.12;ctx.fillStyle=near?'#eed29a':'#d5d9bc';ctx.font='9px system-ui';ctx.strokeText(near?'[ E ] 交谈':'◇ 交谈',p.x,p.y-83);ctx.fillText(near?'[ E ] 交谈':'◇ 交谈',p.x,p.y-83);}
   }});
  }
  drawRoute();this.drawLayer(ctx,this.sceneryLayer,-this.offset.x,-this.offset.y);
  if(regions.length){
   // Repaint only actor/interaction rectangles through the original depth order. The cached
   // background is erased here, so foreground trees can actually fade rather than double-draw.
   ctx.save();ctx.beginPath();for(const r of regions)ctx.rect(r.x,r.y,r.width,r.height);ctx.clip();
   ctx.clearRect(this.camera.x-width/this.camera.zoom/2,this.camera.y-height/this.camera.zoom/2,width/this.camera.zoom,height/this.camera.zoom);
   this.drawLayer(ctx,this.ground,-this.offset.x,-this.offset.y);drawRoute();entries.sort((a,b)=>a.depth-b.depth);for(const e of entries)e.draw();ctx.restore();
  }
  this.drawLayer(ctx,this.softFog,-this.offset.x,-this.offset.y,this.ground.width,this.ground.height);
  ctx.setTransform(dpr,0,0,dpr,0,0);if(this.weather==='sun'||this.weather==='wind'){ctx.fillStyle='#f4dea155';for(let i=0;i<16;i++){const x=(i*197+(reduced?0:now*.008))%width,y=(i*113+Math.sin(now*.0005+i)*14)%height;ctx.globalAlpha=.25+(i%3)*.12;ctx.fillRect(x,y,1.4,1.4);}ctx.globalAlpha=1;}
  this.canvas.dataset.rendered='true';this.canvas.dataset.art=this.loaded?'ready':'loading';this.canvas.dataset.fog='soft';this.canvas.dataset.scenery=String(this.scenery.length);this.canvas.dataset.faded=String(faded);this.canvas.dataset.sceneryCache='static-layer';this.canvas.dataset.liveProps=String(entries.length);
  if(warm)this.paintCost=this.paintCost*.75+Math.min(60,performance.now()-started)*.25;
 }
 dispose(){this.stopped=true;cancelAnimationFrame(this.frame);this.canvas.remove();this.props=[];this.sceneryLayer.width=this.sceneryLayer.height=1;this.propImages.clear();this.motionArt.reset();}
}
export function drawMinimap(canvas:HTMLCanvasElement,s:DeepReadonly<AdventureSnapshot>):void{
 const c=canvas.getContext('2d')!,w=s.runtime.map.bounds.width,h=s.runtime.map.bounds.height,k=Math.min(120/w,100/h);c.clearRect(0,0,128,108);c.fillStyle='#112c2b';c.fillRect(0,0,128,108);
 const explored=new Set(s.runtime.explored);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(explored.has(`${x},${y}`)){c.fillStyle=s.runtime.map.cells[y][x].walkable?'#8d9a6d':'#355148';c.fillRect(4+x*k,4+y*k,k,k);}
 const a=s.runtime.actors[s.playerActorId].position;c.fillStyle='#ffe1a2';c.beginPath();c.arc(4+a.x*k,4+a.y*k,2.5,0,7);c.fill();
}
