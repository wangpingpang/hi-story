import { ACTIONS, WEAPONS, SPELLS, EXPRESSIONS, APPEARANCE_SLOTS, appearanceCatalogFor, type Action, type Direction, type Weapon, type Spell, type Expression, type Appearance, type AppearanceSlot, type Gender } from '../application/character-motion';
import type { DeepReadonly } from '../contracts';
import { materialTexture, materialView, loadDirectionalMaterials as loadMaterials, footwearPiece } from './directional-materials';
import { sampleRigPose } from './motion-clips';
import { loadLegacyArt } from './legacy-character-materials';
import { renderOriginalCharacter } from './legacy-character-rig';
import { registeredDirectionalFace } from './registered-head';
import { BODY_FITS, TOP_SLEEVES, HAIR_BOXES, SHOE_HEIGHTS } from './character-fit';
export function loadDirectionalMaterials():Promise<void> { return Promise.all([loadMaterials(),loadLegacyArt()]).then(()=>{}); }
export const MOTION_ART_VERSION='character-motion-art/3';
export const MOTION_FRAME={width:384,height:384,anchor:{x:192,y:329}} as const;
export interface MotionRenderOptions { action?:Action;direction?:Direction;progress?:number;weapon?:Weapon;spell?:Spell;expression?:Expression;layers?:readonly AppearanceSlot[];effects?:boolean }
const radians=(a:number)=>a*Math.PI/180;
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
 const fit=BODY_FITS[model.parts.body.styleId],[fitX,fitY]=fit.scale,view=materialView(direction),profile=view.column===2,width=profile?.68:view.column===1||view.column===3?.9:1;
 const layers=options.layers??APPEARANCE_SLOTS,has=(s:AppearanceSlot)=>layers.includes(s);
 const texture=(slot:AppearanceSlot)=>materialTexture(slot,model.parts[slot].styleId,slot==='face'?model.parts.body.color:model.parts[slot].color,gender,direction)!;
 const body=texture('body'),top=texture('top'),pants=texture('pants'),shoes=texture('shoes');
 ctx.save();ctx.translate(192,239+groundOffset);if(view.mirror)ctx.scale(-1,1);ctx.translate(pose.x,pose.y);ctx.rotate(radians(pose.body));ctx.scale(fitX*width,fitY);
 function patch(im:HTMLCanvasElement,sx:number,sy:number,sw:number,sh:number,x:number,y:number,w:number,h:number){ctx.drawImage(im,im.width*sx,im.height*sy,im.width*sw,im.height*sh,x,y,w,h);}
 // A solid joint contour under the original texture prevents alpha gaps at bending seams.
 function capsule(x:number,y:number,w:number,h:number,color:string,outline=true){
  ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(w/2,h/2));ctx.fillStyle=color;ctx.fill();
  if(outline){ctx.strokeStyle='#373b34';ctx.lineWidth=1.5;ctx.stroke();}
 }
 function segment(im:HTMLCanvasElement,crop:[number,number,number,number],w:number,length:number,color:string){
  capsule(-w/2,-5,w,length+10,color);ctx.save();ctx.beginPath();ctx.roundRect(-w/2,-5,w,length+10,w/2);ctx.clip();patch(im,...crop,-w/2,-5,w,length+10);ctx.restore();
 }
 function headTransform(){ctx.translate(pose.turn,-83);ctx.rotate(radians(pose.head));ctx.scale(1/fitX,1/fitY);}
 const hair=texture('hair'),[hairW,hairH,hairY]=HAIR_BOXES[model.parts.hair.styleId];
 function drawHair(){ctx.drawImage(hair,-hairW/2,hairY,hairW,hairH);}
 if(has('hair')){ctx.save();headTransform();if(profile){ctx.beginPath();ctx.rect(-100,-180,110,400);ctx.clip();}drawHair();ctx.restore();}
 // The neck is a rig joint, not the accidental transparent padding of a source crop.
 if(has('body'))capsule(-9,-94,18,26,model.parts.body.color);
 function drawLimb(side:'left'|'right',leg:boolean,front:boolean){
  const sign=side==='left'?-1:1;
  let angle=leg?side==='left'?pose.leftLeg:pose.rightLeg:side==='left'?pose.leftArm:pose.rightArm;
  let bend=leg?side==='left'?pose.leftKnee:pose.rightKnee:side==='left'?pose.leftElbow:pose.rightElbow;
  let upper=leg?42:35,lower=leg?42:35;
  if(leg&&action==='sit'){
   if(profile){angle=-88;bend=88;upper=35;lower=34;}
   else if(view.column===1||view.column===3){angle=-40+sign*7;bend=-angle;upper=27;lower=34;}
   else {angle=-sign*9;bend=-angle;upper=18;lower=34;}
  }
  const x=sign*(leg?fit.hip:fit.shoulder),y=leg?0:-65,thickness=leg?fit.thigh:fit.arm;
  ctx.save();ctx.translate(x,y);ctx.rotate(radians(angle));
  const sx=leg?(side==='left'?.22:.51):profile?.30:side==='left'?.12:.65,sw=leg?.27:profile?.42:.23;
  if(has('body'))segment(body,[sx,leg?.47:.10,sw,leg?.25:.27],thickness,upper,model.parts.body.color);
  const trousers=leg&&has('pants')&&!skirts.has(model.parts.pants.styleId),sleeves=!leg&&has('top')?TOP_SLEEVES[model.parts.top.styleId]:'none';
  if(trousers)segment(pants,[side==='left'?0:.5,0,.5,.53],thickness+4,upper,model.parts.pants.color);
  if(sleeves!=='none')segment(top,[profile?.2:side==='left'?0:.74,.24,profile?.6:.26,.70],thickness+5,upper,model.parts.top.color);
  ctx.translate(0,upper);ctx.rotate(radians(bend));
  const lowerWidth=leg?fit.calf:fit.arm-2;
  if(has('body'))segment(body,[leg?sx:profile?.30:side==='left'?0:.77,leg?.71:.32,leg?sw:profile?.42:.23,leg?.25:.29],lowerWidth,lower,model.parts.body.color);
  if(trousers&&model.parts.pants.styleId!=='shorts')segment(pants,[side==='left'?0:.5,.48,.5,.52],lowerWidth+4,lower,model.parts.pants.color);
  if(sleeves==='full')segment(top,[profile?.2:side==='left'?0:.74,.48,profile?.6:.26,.48],lowerWidth+5,lower-7,model.parts.top.color);
  // The elbow/knee cap overlaps both segments, preserving contact through rotation.
  if(has('body'))capsule(-lowerWidth/2,-lowerWidth/2,lowerWidth,lowerWidth,model.parts.body.color,false);
  if(trousers&&model.parts.pants.styleId!=='shorts')capsule(-(lowerWidth+4)/2,-(lowerWidth+4)/2,lowerWidth+4,lowerWidth+4,model.parts.pants.color,false);
  if(sleeves==='full')capsule(-(lowerWidth+5)/2,-(lowerWidth+5)/2,lowerWidth+5,lowerWidth+5,model.parts.top.color,false);
  ctx.translate(0,lower);
  if(leg&&has('shoes')){const shoeW=fit.calf+12,shoeH=SHOE_HEIGHTS[model.parts.shoes.styleId];ctx.drawImage(footwearPiece(shoes,side),-shoeW/2,7-shoeH,shoeW,shoeH);}
  if(!leg&&has('accessory')&&['gloves','bracers'].includes(model.parts.accessory.styleId)){const im=texture('accessory'),w=lowerWidth+4;patch(im,side==='left'?0:.5,0,.5,1,-w/2,model.parts.accessory.styleId==='gloves'?-15:-27,w,28);}
  const holdingSide=side==='right';
  if(!leg&&holdingSide&&options.effects!==false&&weapon!=='unarmed'&&['attack','heavy-attack','combat-ready','block'].includes(action)){
   const im=materialTexture('weapon',weapon,'#ffffff',gender,direction)!;const size=({dagger:45,sword:83,greatsword:104,axe:80,mace:70,spear:115,bow:92,crossbow:70,staff:109} as Record<string,number>)[weapon];if(weapon!=='bow'&&weapon!=='crossbow')ctx.rotate(Math.PI);held(ctx,im,weapon==='bow'||weapon==='crossbow'?42:weapon==='axe'?34:23,size);
  }
  if(!leg&&side==='left'&&options.effects!==false&&action==='block'){const im=materialTexture('weapon','shield','#ffffff',gender,direction)!;held(ctx,im,51,51);}
  ctx.restore();
 }
 const back=profile?'left':'right',front=profile?'right':'left';
 drawLimb(back,false,false);drawLimb(back,true,false);drawLimb(front,true,true);
 function torsoPath(extra=0){ctx.beginPath();ctx.moveTo(-13-extra,-85);ctx.lineTo(13+extra,-85);ctx.lineTo(fit.shoulder+extra,-70);ctx.lineTo(fit.waist+extra,8);ctx.lineTo(-fit.waist-extra,8);ctx.lineTo(-fit.shoulder-extra,-70);ctx.closePath();}
 function torso(im:HTMLCanvasElement,clothing:boolean){const extra=clothing?3:0,w=2*(Math.max(fit.shoulder,fit.waist)+extra);ctx.save();torsoPath(extra);ctx.fillStyle=clothing?model.parts.top.color:model.parts.body.color;ctx.fill();ctx.strokeStyle='#373b34';ctx.lineWidth=1.5;ctx.stroke();ctx.clip();if(clothing)patch(im,.22,0,.56,1,-w/2,-85,w,95);else patch(im,.25,0,.5,.52,-w/2,-85,w,94);ctx.restore();}
 if(has('body'))torso(body,false);
 if(has('pants')){
  if(skirts.has(model.parts.pants.styleId)){const length=action==='sit'?59:model.parts.pants.styleId==='long-skirt'?96:model.parts.pants.styleId==='culottes'?82:70,w=2*(fit.waist+8);ctx.save();ctx.rotate(radians(pose.cloth));ctx.drawImage(pants,-w/2,-7,w,length);ctx.restore();}
  else {const w=2*(fit.waist+2);ctx.fillStyle=model.parts.pants.color;ctx.fillRect(-w/2,-7,w,24);patch(pants,0,0,1,.24,-w/2,-8,w,27);}
 }
 if(has('top'))torso(top,true);
 if(has('accessory')&&model.parts.accessory.styleId==='cloak'){const im=texture('accessory'),w=2*(fit.shoulder+12);ctx.drawImage(im,-w/2,-84,w,104);}
 drawLimb(front,false,true);
 if(has('accessory')&&['scarf','satchel','pendant','pouch','belt'].includes(model.parts.accessory.styleId)){
  const style=model.parts.accessory.styleId;
  if(style==='satchel'){
   ctx.strokeStyle='#3b3026';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-fit.shoulder+7,-76);ctx.lineTo(fit.waist-5,8);ctx.stroke();ctx.strokeStyle=model.parts.accessory.color;ctx.lineWidth=3;ctx.stroke();
   ctx.drawImage(texture('accessory'),fit.waist-18,-16,33,42);
  }else {const sizes:Record<string,[number,number,number,number]>={scarf:[-fit.shoulder-4,-91,2*(fit.shoulder+4),60],pendant:[-17,-82,34,40],pouch:[fit.waist-18,-18,35,35],belt:[-fit.waist-5,-16,2*(fit.waist+5),24]};ctx.drawImage(texture('accessory'),...sizes[style]);}
 }
 ctx.save();headTransform();
 if(has('face')){ctx.drawImage(registeredDirectionalFace(texture('face'),hair,[hairW,hairH,hairY]),-96,-96);expression(ctx,options.expression??'neutral',direction,model.parts.face.color);}
 if(has('hair')){
  ctx.save();if(view.column<3){ctx.beginPath();ctx.rect(-90,-180,180,142);if(profile)ctx.rect(-90,-38,90,130);ctx.clip();}drawHair();ctx.restore();
 }
 if(has('accessory')&&['glasses','earring','headband'].includes(model.parts.accessory.styleId)){
  const boxes:Record<string,[number,number,number,number]>={glasses:[-25,-42,50,20],earring:[[26,-22,-8,18,26][view.column],-32,8,17],headband:[-33,-68,66,30]};if(view.column<4||model.parts.accessory.styleId!=='glasses')ctx.drawImage(texture('accessory'),...boxes[model.parts.accessory.styleId]);
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
 if(options.direction!==undefined)materialView(options.direction);
 if(options.progress!==undefined&&(!Number.isFinite(options.progress)||options.progress<0||options.progress>1))throw Error('动作进度无效');
 if(options.action!==undefined&&!Object.hasOwn(ACTIONS,options.action))throw Error('动作无效');
 if(options.weapon!==undefined&&!WEAPONS.includes(options.weapon)||options.spell!==undefined&&!SPELLS.includes(options.spell)||options.expression!==undefined&&!Object.hasOwn(EXPRESSIONS,options.expression))throw Error('武器、法术或表情无效');
 if(options.layers!==undefined&&(!Array.isArray(options.layers)||options.layers.some(slot=>!APPEARANCE_SLOTS.includes(slot))))throw Error('导出图层无效');
 if(model.version!=='appearance/3'&&(options.direction??'S')==='S')return renderOriginalCharacter(model,gender,options);
 const ground=drawRaw(model,gender,{...options,layers:APPEARANCE_SLOTS,effects:false});const b=alphaBounds(ground);const offset=329-b.bottom;ground.width=0;
 const c=drawRaw(model,gender,options,offset),ctx=ctxOf(c),pixels=ctx.getImageData(0,0,384,384),data=pixels.data;
 for(let i=0;i<data.length;i+=4){if(data[i+3]<128)data.fill(0,i,i+4);else data[i+3]=255;}ctx.putImageData(pixels,0,0);return c;
}
export function renderCharacterMotionStrip(model:DeepReadonly<Appearance>,gender:Gender='female',options:MotionRenderOptions={},frames=8):HTMLCanvasElement {
 if(!Number.isInteger(frames)||frames<2||frames>32)throw Error('帧数须为2至32的整数');const c=canvas();c.width=384*frames;const ctx=ctxOf(c);const loop=ACTIONS[options.action??'stand'].loop;
 for(let i=0;i<frames;i++)ctx.drawImage(renderCharacterMotionFrame(model,gender,{...options,progress:loop?i/frames:i/(frames-1)}),i*384,0);return c;
}
