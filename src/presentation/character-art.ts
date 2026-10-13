import type { DeepReadonly } from '../contracts';
import { appearanceCatalogFor, appearanceSlots, type Appearance, type Gender, type AppearanceSlot } from '../application/character-studio';
import { artRegion, ART_SIZE, ART_VERSION, type ArtRegion } from './character-art-layout';
export { ART_SIZE, ART_VERSION } from './character-art-layout';

let sheets:Record<'common'|'female',HTMLImageElement>|undefined;
let loading:Promise<void>|undefined;
const textures=new Map<string,HTMLCanvasElement>();
const assembled=new Map<string,string>();
function canvas(width:number,height:number) { const c=document.createElement('canvas');c.width=width;c.height=height;return c; }
function context(c:HTMLCanvasElement) { const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('浏览器无法创建人物画布');ctx.imageSmoothingEnabled=false;return ctx; }
export function loadCharacterArt():Promise<void> {
  if(sheets)return Promise.resolve();
  if(loading)return loading;
  const load=(file:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('人物图片素材加载失败'));image.src=new URL(`${import.meta.env.BASE_URL}assets/characters/${file}`,document.baseURI).href;});
  loading=Promise.all([load('character-parts-v1.png'),load('female-parts-v1.png')]).then(([common,female])=>{sheets={common,female};}).catch(error=>{loading=undefined;throw error;});
  return loading;
}
function hsv(r:number,g:number,b:number) {
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=d===0?0:max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;
  return {h,s:max===0?0:d/max,v:max/255,l:(r*.2126+g*.7152+b*.0722)/255};
}
function tintable(material:ArtRegion['material'],slot:AppearanceSlot,style:string,h:number,s:number,v:number,l:number) {
  if(l<.12)return false;
  if(material==='skin')return h<65&&s>.13;
  if(material==='hair')return true;
  if(material==='metal')return l>.22;
  if(slot==='top'&&style==='shirt')return h<70&&s<.55&&v>.3;
  if((slot==='top'&&(style==='tunic'||style==='coat'))||(slot==='pants'&&(style==='loose'||style==='long-skirt')))return h>85&&h<260&&s>.08;
  if(h>35&&h<75&&s>.5&&v>.65)return false;
  if(slot==='shoes'&&style==='cloth')return l>.18;
  return s>.12&&(h<70||h>330);
}
function removeStrayComponents(data:Uint8ClampedArray,width:number,height:number) {
  const visited=new Uint8Array(width*height),queue=new Int32Array(width*height),components:number[][]=[];
  for(let start=0;start<visited.length;start++){
    if(visited[start]||data[start*4+3]===0)continue;
    let head=0,tail=1;queue[0]=start;visited[start]=1;const component:number[]=[];
    while(head<tail){
      const index=queue[head++],x=index%width,y=Math.floor(index/width);component.push(index);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const next=ny*width+nx;if(!visited[next]&&data[next*4+3]){visited[next]=1;queue[tail++]=next;}
      }
    }
    components.push(component);
  }
  const minimum=Math.max(12,Math.max(0,...components.map(c=>c.length))*.06);
  for(const component of components)if(component.length<minimum)for(const index of component)data.fill(0,index*4,index*4+4);
}
function texture(slot:AppearanceSlot,style:string,color:string,gender:Gender,region:ArtRegion):HTMLCanvasElement {
  const key=JSON.stringify([slot,style,color,gender]);const cached=textures.get(key);if(cached)return cached;
  if(!sheets)throw Error('人物素材尚未加载');
  const [x,y,w,h]=region.crop,c=canvas(w,h),ctx=context(c);ctx.drawImage(sheets[region.sheet],x,y,w,h,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h),data=pixels.data;
  const target=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
    if(data[i+3]<48||(max>245&&min<8&&max-min>245)){data[i]=data[i+1]=data[i+2]=data[i+3]=0;continue;}
    data[i+3]=255;
    const tone=hsv(r,g,b);
    if(tintable(region.material,slot,style,tone.h,tone.s,tone.v,tone.l)){
      const base=region.material==='skin'?.67:region.material==='hair'?.36:.42;
      const shade=Math.min(1.35,Math.max(.25,tone.l/base));
      for(let channel=0;channel<3;channel++)data[i+channel]=Math.round(Math.min(255,target[channel]*shade));
    }
  }
  removeStrayComponents(data,w,h);
  ctx.putImageData(pixels,0,0);
  if(textures.size>=192)textures.delete(textures.keys().next().value!);textures.set(key,c);return c;
}
export function assembleCharacterCanvas(model:DeepReadonly<Appearance>,gender:Gender='male',scale=1):HTMLCanvasElement {
  if(!['male','female'].includes(gender)||!Number.isInteger(scale)||scale<1||scale>8)throw Error('人物装配参数无效');
  const catalogs=appearanceCatalogFor(model.version);
  for(const slot of appearanceSlots){const part=model.parts[slot];if(!part||!catalogs[slot].styles.some(s=>s.id===part.styleId)||!catalogs[slot].colors.some(c=>c===part.color))throw Error('人物外观数据无效');}
  const c=canvas(ART_SIZE.width,ART_SIZE.height),ctx=context(c);
  const fit={slim:.94,balanced:1,broad:1.06,stocky:1.10}[model.parts.body.styleId]??1;
  const draw=(slot:AppearanceSlot)=>{
    const part=model.parts[slot],region=artRegion(slot,part.styleId,gender);if(!region)return;
    const color=slot==='face'?model.parts.body.color:part.color;
    let [x,y,w,h]=region.target;
    if(['top','pants','shoes'].includes(slot)){w*=fit;x=72-w/2;}
    ctx.drawImage(texture(slot,part.styleId,color,gender,region),Math.round(x),Math.round(y),Math.round(w),Math.round(h));
  };
  if(['long','ponytail','bob'].includes(model.parts.hair.styleId))draw('hair');
  draw('body');draw('pants');draw('shoes');draw('top');draw('face');draw('hair');
  ctx.fillStyle=model.parts.face.color;ctx.fillRect(61,57,3,2);ctx.fillRect(81,57,3,2);
  draw('accessory');
  if(scale===1)return c;
  const enlarged=canvas(c.width*scale,c.height*scale);context(enlarged).drawImage(c,0,0,enlarged.width,enlarged.height);return enlarged;
}
export function assembledCharacterUrl(model:DeepReadonly<Appearance>,gender:Gender='male'):string {
  const key=JSON.stringify([ART_VERSION,gender,model.version,model.parts]);const cached=assembled.get(key);if(cached)return cached;
  const url=assembleCharacterCanvas(model,gender).toDataURL('image/png');
  if(assembled.size>=64)assembled.delete(assembled.keys().next().value!);assembled.set(key,url);return url;
}
