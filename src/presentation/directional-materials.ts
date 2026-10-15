import type { AppearanceSlot, Gender, Direction } from '../application/character-motion';
import manifest from './character-materials-v3.json';
export const MATERIAL_VERSION=manifest.version;
interface SheetSpec {file:string;width:number;height:number;regions:Record<string,number[][]>}
const specs=manifest.sheets as unknown as Record<string,SheetSpec>;
const sheets=new Map<string,HTMLImageElement>(),textures=new Map<string,HTMLCanvasElement>();
let loading:Promise<void>|undefined;
export function materialView(direction:Direction):{column:number;mirror:boolean} {
 const view={S:0,SE:1,E:2,NE:3,N:4,NW:3,W:2,SW:1}[direction];if(view===undefined)throw Error('方向无效');return {column:view,mirror:['NW','W','SW'].includes(direction)};
}
export function loadDirectionalMaterials():Promise<void> {
 if(sheets.size===Object.keys(specs).length)return Promise.resolve();if(loading)return loading;
 loading=Promise.all(Object.entries(specs).map(([key,spec])=>new Promise<void>((resolve,reject)=>{
  const im=new Image();im.onload=()=>{if(im.width!==spec.width||im.height!==spec.height){reject(Error(`素材尺寸不匹配：${key}`));return;}sheets.set(key,im);resolve();};im.onerror=()=>reject(Error(`方向素材加载失败：${key}`));im.src=new URL(`${import.meta.env.BASE_URL}assets/characters/v3/${spec.file}`,document.baseURI).href;
 }))).then(()=>{}).catch(error=>{loading=undefined;throw error;});return loading;
}
export function materialRegistration(slot:AppearanceSlot|'weapon',style:string,gender:Gender,direction:Direction) {
 if(slot==='accessory'&&style==='none')return null;
 const key=slot==='body'?(gender==='female'&&style==='stocky'?'body-female-stocky':`body-${gender}`):slot==='weapon'?'weapons':slot;
 const view=materialView(direction),crop=specs[key]?.regions[style]?.[view.column];if(!crop)throw Error(`缺少素材：${key}/${style}/${direction}`);
 return {key,crop,mirror:view.mirror};
}
function removeFragments(data:Uint8ClampedArray,w:number,h:number):void {
 const visited=new Uint8Array(w*h),queue=new Int32Array(w*h),components:number[][]=[];
 for(let start=0;start<w*h;start++){
  if(visited[start]||!data[start*4+3])continue;
  let head=0,tail=1;queue[0]=start;visited[start]=1;const part:number[]=[];
  while(head<tail){const p=queue[head++];part.push(p);const x=p%w,y=Math.floor(p/w);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const q=ny*w+nx;if(!visited[q]&&data[q*4+3]){visited[q]=1;queue[tail++]=q;}}}
  components.push(part);
 }
 const threshold=Math.max(5,Math.max(0,...components.map(c=>c.length))*.012);
 for(const part of components)if(part.length<threshold)for(const p of part)data.fill(0,p*4,p*4+4);
}
export function materialTexture(slot:AppearanceSlot|'weapon',style:string,color:string,gender:Gender,direction:Direction):HTMLCanvasElement|null {
 const region=materialRegistration(slot,style,gender,direction);if(!region)return null;
 const key=JSON.stringify([region.key,style,color,materialView(direction).column]);const cached=textures.get(key);if(cached)return cached;
 const image=sheets.get(region.key);if(!image)throw Error('方向素材尚未加载');
 const [x,y,w,h]=region.crop,c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,x,y,w,h,0,0,w,h);
 const pixels=ctx.getImageData(0,0,w,h),d=pixels.data,target=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b),l=(r*.2126+g*.7152+b*.0722)/255;
  if(d[i+3]<180||(max>230&&min<35&&(r>g*1.7||g>r*2))){d.fill(0,i,i+4);continue;}d[i+3]=255;
  const skin=slot==='body'||slot==='face';
  const tint=slot!=='weapon'&&(slot==='hair'||(skin?r>g*1.08&&g>b*1.1:max-min>18&&!(r>g*1.1&&g>b*1.4)&&!(r>190&&g>145&&b<100)));
  if(tint&&l>.12){const shade=Math.max(.28,Math.min(1.35,l/(skin?.62:.36)));for(let n=0;n<3;n++)d[i+n]=Math.min(255,Math.round(target[n]*shade));}
 }
 removeFragments(d,w,h);ctx.putImageData(pixels,0,0);
 if(textures.size>=256)textures.delete(textures.keys().next().value!);textures.set(key,c);return c;
}
