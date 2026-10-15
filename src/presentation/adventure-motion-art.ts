import {AdventureMotion} from '../application/adventure-motion';
import type {AdventureSnapshot} from '../application';
import type {DeepReadonly} from '../contracts';
import {loadDirectionalMaterials,renderCharacterMotionFrame} from './character-motion-art';
/** Bounded frame cache shared by world and tactical presentations. */
export class AdventureMotionArt {
 readonly motion=new AdventureMotion();
 ready=false;
 private frames=new Map<string,HTMLCanvasElement>();
 private urls=new WeakMap<HTMLCanvasElement,string>();
 constructor(){void loadDirectionalMaterials().then(()=>{this.ready=true;}).catch(()=>{/* Standing portrait remains available. */});}
 observe(s:DeepReadonly<AdventureSnapshot>){this.motion.observe(s,performance.now());}
 frame(id:string,now:number,weather='sun'){
  if(!this.ready)return;const f=this.motion.frame(id,now,weather==='snow'?'cold':weather==='mist'?'dark':'normal');if(!f)return;
  const phase=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.floor(f.progress*8)%8,key=JSON.stringify([id,f.appearance,f.gender,f.action,f.direction,f.weapon,f.spell,f.expression,phase]);
  let image=this.frames.get(key);if(!image){image=renderCharacterMotionFrame(f.appearance,f.gender,{...f,progress:phase/8});this.frames.set(key,image);if(this.frames.size>128)this.frames.delete(this.frames.keys().next().value!);}
  return {image,action:f.action,direction:f.direction,expression:f.expression};
 }
 url(image:HTMLCanvasElement){let url=this.urls.get(image);if(!url){url=image.toDataURL('image/png');this.urls.set(image,url);}return url;}
 reset(){this.frames.clear();this.urls=new WeakMap();}
}
