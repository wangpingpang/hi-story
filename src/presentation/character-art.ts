import type { DeepReadonly } from '../contracts';
import { appearanceCatalogFor, appearanceSlots, type Appearance, type Gender } from '../application/character-studio';
import { ART_SIZE, ART_VERSION } from './character-art-layout';
import { loadDirectionalMaterials, renderCharacterMotionFrame, MOTION_ART_VERSION } from './character-motion-art';
import { loadLegacyArt } from './legacy-character-materials';
import { renderOriginalCharacter } from './legacy-character-rig';
export { ART_SIZE, ART_VERSION } from './character-art-layout';
const assembled=new Map<string,string>();
function canvas(width:number,height:number) { const c=document.createElement('canvas');c.width=width;c.height=height;return c; }
function context(c:HTMLCanvasElement) { const ctx=c.getContext('2d')!;ctx.imageSmoothingEnabled=false;return ctx; }
export function loadCharacterArt(version:string='appearance/1'):Promise<void> {
  return version==='appearance/3'?loadDirectionalMaterials():loadLegacyArt();
}
export function assembleCharacterCanvas(model:DeepReadonly<Appearance>,gender:Gender='male',scale=1):HTMLCanvasElement {
  if(!['male','female'].includes(gender)||!Number.isInteger(scale)||scale<1||scale>8)throw Error('人物装配参数无效');
  const catalogs=appearanceCatalogFor(model.version);
  for(const slot of appearanceSlots){const part=model.parts[slot];if(!part||!catalogs[slot].styles.some(s=>s.id===part.styleId)||!catalogs[slot].colors.some(c=>c===part.color))throw Error('人物外观数据无效');}
  const frame=model.version==='appearance/3'?renderCharacterMotionFrame(model,gender):renderOriginalCharacter(model,gender,{effects:false});
  const result=canvas(ART_SIZE.width*scale,ART_SIZE.height*scale);
  const pixels=context(frame).getImageData(0,0,384,384).data;let left=384,top=384,right=0,bottom=0;
  for(let y=0;y<384;y++)for(let x=0;x<384;x++)if(pixels[(y*384+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const width=right-left+1,height=bottom-top+1,fit=Math.min(1,136/width,272/height),w=Math.round(width*fit),h=Math.round(height*fit);
  context(result).drawImage(frame,left,top,width,height,Math.round(72-w/2)*scale,(280-h)*scale,w*scale,h*scale);frame.width=0;return result;
}

export function assembledCharacterUrl(model:DeepReadonly<Appearance>,gender:Gender='male'):string {
  const key=JSON.stringify([artVersionFor(model),gender,model.version,model.parts]);const cached=assembled.get(key);if(cached)return cached;
  const url=assembleCharacterCanvas(model,gender).toDataURL('image/png');
  if(assembled.size>=64)assembled.delete(assembled.keys().next().value!);assembled.set(key,url);return url;
}
export function artVersionFor(model:DeepReadonly<Appearance>):string {return model.version==='appearance/3'?MOTION_ART_VERSION:ART_VERSION;}
