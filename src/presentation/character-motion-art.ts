import { ACTIONS, WEAPONS, SPELLS, EXPRESSIONS, APPEARANCE_SLOTS, appearanceCatalogFor, type Action, type Direction, type Weapon, type Spell, type Expression, type Appearance, type AppearanceSlot, type Gender } from '../application/character-motion';
import type { DeepReadonly } from '../contracts';
import { materialTexture, materialView, loadDirectionalMaterials } from './directional-materials';
import { sampleRigPose } from './motion-clips';
export { loadDirectionalMaterials };
export const MOTION_ART_VERSION='character-motion-art/1';
export const MOTION_FRAME={width:384,height:384,anchor:{x:192,y:329}} as const;
export interface MotionRenderOptions { action?:Action;direction?:Direction;progress?:number;weapon?:Weapon;spell?:Spell;expression?:Expression;layers?:readonly AppearanceSlot[];effects?:boolean }
const radians=(a:number)=>a*Math.PI/180;
const fits:Record<string,[number,number]>={slim:[.90,1],balanced:[1,1],broad:[1.12,1],stocky:[1.14,.94],tall:[.94,1.12],compact:[.98,.86],muscular:[1.14,1.04],heavy:[1.25,1]};
const hairShapes:Record<string,[number,number,number]>={crop:[74,52,-80],bob:[79,93,-81],long:[82,125,-81],ponytail:[78,115,-82],bun:[75,80,-97],mohawk:[72,73,-96],curly:[82,76,-84],braids:[80,124,-82],swept:[75,61,-87],'braided-bun':[80,78,-94],wavy:[84,124,-82],undercut:[76,65,-88]};
const skirts=new Set(['skirt','long-skirt','pleated','culottes']);
function canvas(){const c=document.createElement('canvas');c.width=384;c.height=384;return c;}
function ctxOf(c:HTMLCanvasElement){const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.imageSmoothingEnabled=false;return ctx;}
function alphaBounds(c:HTMLCanvasElement){const d=ctxOf(c).getImageData(0,0,384,384).data;let left=384,top=384,right=-1,bottom=-1;for(let y=0;y<384;y++)for(let x=0;x<384;x++)if(d[(y*384+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return {left,top,right,bottom};}
function expression(ctx:CanvasRenderingContext2D,emotion:Expression,direction:Direction,color:string){
 if(['N','NE','NW'].includes(direction))return;
 ctx.save();ctx.translate(0,12);
 const profile=direction==='E'||direction==='W',eyeX=profile?[19]:[-12,12];
 ctx.fillStyle=color;ctx.strokeStyle='#26312d';ctx.lineWidth=2;ctx.lineCap='square';
 const line=(x1:number,y1:number,x2:number,y2:number)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
 for(const x of eyeX){
  if(emotion==='sleepy'){ctx.fillRect(x-3,-42,6,2);line(x-4,-43,x+4,-43);}
  else if(['asleep','pain','elated'].includes(emotion))line(x-3,-42,x+3,-42+(emotion==='elated'?-2:1));
  else if(['surprised','fear'].includes(emotion)){ctx.strokeRect(x-3,-46,6,7);ctx.fillRect(x,-43,2,3);}
  else {const height=emotion==='sick'||emotion==='focused'?2:4;ctx.fillStyle='#f0dfbd';ctx.fillRect(x-3,-44,6,height);ctx.fillStyle=color;ctx.fillRect(x-1,-44,3,height);}
  if(emotion==='angry'||emotion==='focused')line(x-4,-50+(x<0?-2:2),x+4,-50+(x<0?2:-2));
  else if(['sad','pain','fear'].includes(emotion))line(x-4,-50+(x<0?2:-2),x+4,-50+(x<0?-2:2));
 }
 const mouthX=profile?19:0;
 if(['happy','elated'].includes(emotion)){line(mouthX-5,-25,mouthX,-22);line(mouthX,-22,mouthX+5,-25);}
 else if(['surprised','fear'].includes(emotion))ctx.strokeRect(mouthX-2,-26,4,6);
 else if(['sad','pain','sick'].includes(emotion)){line(mouthX-5,-23,mouthX,-26);line(mouthX,-26,mouthX+5,-23);}
 else line(mouthX-4,-24,mouthX+4,-24);
 ctx.restore();
}
// Constrain the source rectangle about its grip; never slide a weapon out of the hand.
function held(ctx:CanvasRenderingContext2D,im:HTMLCanvasElement,w:number,h:number):void {
 const m=ctx.getTransform(),origin=m.transformPoint({x:0,y:0});let scale=1;
 for(const x of [-w/2,w/2])for(const y of [-h*.85,h*.15]){
  const p=m.transformPoint({x,y}),dx=p.x-origin.x,dy=p.y-origin.y;
  if(dx>0)scale=Math.min(scale,(376-origin.x)/dx);if(dx<0)scale=Math.min(scale,(8-origin.x)/dx);
  if(dy>0)scale=Math.min(scale,(376-origin.y)/dy);if(dy<0)scale=Math.min(scale,(8-origin.y)/dy);
 }
 scale=Math.max(.05,Math.min(1,scale));ctx.drawImage(im,-w*scale/2,-h*scale*.85,w*scale,h*scale);
}
function drawRaw(model:DeepReadonly<Appearance>,gender:Gender,options:MotionRenderOptions,groundOffset=0):HTMLCanvasElement {
 const c=canvas(),ctx=ctxOf(c),action=options.action??'stand',direction=options.direction??'S',p=options.progress??0,weapon=options.weapon??'unarmed',spell=options.spell??'arcane',pose=sampleRigPose(action,p,weapon,spell);
 const [fitX,fitY]=fits[model.parts.body.styleId],view=materialView(direction),profile=view.column===2,width=profile?.68:view.column===1||view.column===3?.9:1;
 const layers=options.layers??APPEARANCE_SLOTS,has=(s:AppearanceSlot)=>layers.includes(s);
 const texture=(slot:AppearanceSlot)=>materialTexture(slot,model.parts[slot].styleId,slot==='face'?model.parts.body.color:model.parts[slot].color,gender,direction)!;
 const body=texture('body'),top=texture('top'),pants=texture('pants'),shoes=texture('shoes');
 ctx.save();ctx.translate(192,239+groundOffset);if(view.mirror)ctx.scale(-1,1);ctx.translate(pose.x,pose.y);ctx.rotate(radians(pose.body));ctx.scale(fitX*width,fitY);
 function patch(im:HTMLCanvasElement,sx:number,sy:number,sw:number,sh:number,x:number,y:number,w:number,h:number){ctx.drawImage(im,im.width*sx,im.height*sy,im.width*sw,im.height*sh,x,y,w,h);}
 function drawLimb(side:'left'|'right',leg:boolean,front:boolean){
  const sign=side==='left'?-1:1,angle=leg?side==='left'?pose.leftLeg:pose.rightLeg:side==='left'?pose.leftArm:pose.rightArm,bend=leg?side==='left'?pose.leftKnee:pose.rightKnee:side==='left'?pose.leftElbow:pose.rightElbow;
  const x=sign*(leg?13:29),y=leg?0:-65,length=leg?42:35,thickness=leg?23:20;
  ctx.save();if(profile&&!front)ctx.globalAlpha=.78;ctx.translate(x,y);ctx.rotate(radians(angle));
  const sx=leg?(side==='left'?.22:.51):profile?.30:side==='left'?.12:.65,sw=leg?.27:profile?.42:.23;
  if(has('body'))patch(body,sx,leg?.47:.10,sw,leg?.25:.27,-thickness/2,-3,thickness,length+5);
  if(leg&&has('pants')&&!skirts.has(model.parts.pants.styleId))patch(pants,side==='left'?0:.5,0,.5,.53,-thickness/2-1,-5,thickness+2,length+8);
  if(!leg&&has('top')&&model.parts.top.styleId!=='tank')patch(top,profile?.2:side==='left'?0:.74,.24,profile?.6:.26,.70,-12,-4,24,length+8);
  ctx.translate(0,length);ctx.rotate(radians(bend));
  if(has('body'))patch(body,leg?sx:profile?.30:side==='left'?0:.77,leg?.71:.32,leg?sw:profile?.42:.23,leg?.25:.29,-thickness/2+1,-3,thickness-2,length+7);
  if(leg&&has('pants')&&!skirts.has(model.parts.pants.styleId)&&model.parts.pants.styleId!=='shorts')patch(pants,side==='left'?0:.5,.48,.5,.52,-thickness/2-1,-5,thickness+2,length+8);
  if(!leg&&has('top')&&!['tank','vest','tunic','wrap','shirt'].includes(model.parts.top.styleId))patch(top,side==='left'?0:.74,.48,.26,.48,-10,-4,20,length+5);
  ctx.translate(0,length);
  if(leg&&has('shoes'))patch(shoes,side==='left'?0:.5,0,.5,1,-15,-28,30,35);
  if(!leg&&has('accessory')&&['gloves','bracers'].includes(model.parts.accessory.styleId)){const im=texture('accessory');patch(im,side==='left'?0:.5,0,.5,1,-10,model.parts.accessory.styleId==='gloves'?-12:-25,20,28);}
  const holdingSide=side==='right';
  if(!leg&&holdingSide&&options.effects!==false&&weapon!=='unarmed'&&['attack','heavy-attack','combat-ready','block'].includes(action)){
   const im=materialTexture('weapon',weapon,'#ffffff',gender,direction)!;const size=({dagger:45,sword:83,greatsword:104,axe:80,mace:70,spear:115,bow:92,crossbow:70,staff:109} as Record<string,number>)[weapon];if(weapon!=='bow'&&weapon!=='crossbow')ctx.rotate(Math.PI);held(ctx,im,weapon==='bow'||weapon==='crossbow'?42:weapon==='axe'?34:23,size);
  }
  if(!leg&&side==='left'&&options.effects!==false&&action==='block'){const im=materialTexture('weapon','shield','#ffffff',gender,direction)!;held(ctx,im,51,51);}
  ctx.restore();
 }
 const back=profile?'left':'right',front=profile?'right':'left';
 drawLimb(back,false,false);drawLimb(back,true,false);drawLimb(front,true,true);
 if(has('body'))patch(body,.25,0,.5,.52,-27,-85,54,89);
 if(has('pants')&&skirts.has(model.parts.pants.styleId)){const length=model.parts.pants.styleId==='long-skirt'?96:model.parts.pants.styleId==='culottes'?82:70;ctx.save();ctx.rotate(radians(pose.cloth));ctx.drawImage(pants,-35,-5,70,length);ctx.restore();}
 if(has('top'))patch(top,.22,0,.56,1,-32,-83,64,92);
 if(has('accessory')&&model.parts.accessory.styleId==='cloak'){const im=texture('accessory');ctx.drawImage(im,-43,-84,86,104);}
 drawLimb(front,false,true);
 if(has('accessory')&&['scarf','satchel','pendant','pouch','belt'].includes(model.parts.accessory.styleId)){
  const sizes:Record<string,[number,number,number,number]>={scarf:[-33,-91,66,60],satchel:[-38,-68,76,76],pendant:[-17,-82,34,40],pouch:[5,-18,35,35],belt:[-34,-16,68,24]};ctx.drawImage(texture('accessory'),...sizes[model.parts.accessory.styleId]);
 }
 ctx.save();ctx.translate(pose.turn,-83);ctx.rotate(radians(pose.head));ctx.scale(1/(fitX),1/fitY);
 if(has('face')){ctx.drawImage(texture('face'),-30,-67,60,73);expression(ctx,options.expression??'neutral',direction,model.parts.face.color);}
 if(has('hair')){const [w,h,y]=hairShapes[model.parts.hair.styleId];ctx.drawImage(texture('hair'),-w/2,y-10,w,h);}
 if(has('accessory')&&['glasses','earring','headband'].includes(model.parts.accessory.styleId)){
  const boxes:Record<string,[number,number,number,number]>={glasses:[-25,-49,50,20],earring:[24,-43,12,23],headband:[-33,-68,66,30]};if(view.column<3)ctx.drawImage(texture('accessory'),...boxes[model.parts.accessory.styleId]);
 }
 ctx.restore();ctx.restore();
 if(options.effects!==false){
  const wave=Math.sin(p*Math.PI),centerX=192+(view.mirror?-1:1)*(55+wave*15),centerY=171;
  if(action==='cast'){
   const colors:Record<Spell,string>={fire:'#ec8750',frost:'#9fdce4',lightning:'#eada8e',healing:'#9fc69a',ward:'#99bbdf',summon:'#b5a0d4',arcane:'#d8a5d7'};ctx.strokeStyle=colors[spell];ctx.fillStyle=colors[spell];ctx.lineWidth=4;
   if(spell==='lightning'){ctx.beginPath();ctx.moveTo(centerX,90);ctx.lineTo(centerX-12,135);ctx.lineTo(centerX+9,131);ctx.lineTo(centerX-5,180);ctx.stroke();}
   else if(spell==='healing'){ctx.fillRect(centerX-3,centerY-15,6,30);ctx.fillRect(centerX-15,centerY-3,30,6);}
   else if(spell==='ward'||spell==='summon'){ctx.beginPath();ctx.ellipse(192,spell==='ward'?207:326,48+wave*12,spell==='ward'?80:15,0,0,Math.PI*2);ctx.stroke();}
   else if(spell==='frost'){for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(centerX,centerY);ctx.lineTo(centerX+Math.cos(a)*23*wave,centerY+Math.sin(a)*23*wave);ctx.stroke();}}
   else {ctx.beginPath();ctx.arc(centerX,centerY,8+wave*17,0,Math.PI*2);ctx.stroke();if(spell==='fire')ctx.fillRect(centerX-4,centerY-9,8,18);}
  }
  if(action.startsWith('hit-')){ctx.strokeStyle=action==='hit-spell'?'#caa2e7':'#efb57a';ctx.lineWidth=3;for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(192+Math.cos(a)*28*wave,206+Math.sin(a)*28*wave);ctx.lineTo(192+Math.cos(a)*45*wave,206+Math.sin(a)*45*wave);ctx.stroke();}}
 }
 return c;
}
export function renderCharacterMotionFrame(model:DeepReadonly<Appearance>,gender:Gender='female',options:MotionRenderOptions={}):HTMLCanvasElement {
 const catalog=appearanceCatalogFor(model.version);if(!['male','female'].includes(gender))throw Error('身体类型无效');
 for(const slot of APPEARANCE_SLOTS)if(!catalog[slot].styles.some(s=>s.id===model.parts[slot]?.styleId)||!catalog[slot].colors.some(c=>c===model.parts[slot]?.color))throw Error('外观数据无效');
 if(options.action!==undefined&&!Object.hasOwn(ACTIONS,options.action))throw Error('动作无效');
 if(options.weapon!==undefined&&!WEAPONS.includes(options.weapon)||options.spell!==undefined&&!SPELLS.includes(options.spell)||options.expression!==undefined&&!Object.hasOwn(EXPRESSIONS,options.expression))throw Error('武器、法术或表情无效');
 if(options.layers!==undefined&&(!Array.isArray(options.layers)||options.layers.some(slot=>!APPEARANCE_SLOTS.includes(slot))))throw Error('导出图层无效');
 const ground=drawRaw(model,gender,{...options,layers:APPEARANCE_SLOTS,effects:false});const b=alphaBounds(ground);const offset=329-b.bottom;
 const c=drawRaw(model,gender,options,offset),ctx=ctxOf(c),pixels=ctx.getImageData(0,0,384,384),data=pixels.data;
 for(let i=0;i<data.length;i+=4){if(data[i+3]<128)data.fill(0,i,i+4);else data[i+3]=255;}ctx.putImageData(pixels,0,0);return c;
}
export function renderCharacterMotionStrip(model:DeepReadonly<Appearance>,gender:Gender='female',options:MotionRenderOptions={},frames=8):HTMLCanvasElement {
 if(!Number.isInteger(frames)||frames<2||frames>32)throw Error('帧数须为2至32的整数');const c=canvas();c.width=384*frames;const ctx=ctxOf(c);const loop=ACTIONS[options.action??'stand'].loop;
 for(let i=0;i<frames;i++)ctx.drawImage(renderCharacterMotionFrame(model,gender,{...options,progress:loop?i/frames:i/(frames-1)}),i*384,0);return c;
}
