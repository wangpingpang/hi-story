import { StoryStudio } from './application/story-studio';
import { renderStoryStudio } from './presentation/story-studio';
import { Game } from './application/game';
import { choiceCommand } from './input';
import { render } from './presentation';
import './presentation/style.css';
import { loadCharacterArt, assembleCharacterCanvas, artVersionFor } from './presentation/character-art';
import { CharacterStudio } from './application/character-studio';
import { renderCharacterStudio } from './presentation/character-studio';
import { mountCharacterMotionStudio } from './presentation/character-motion-studio';
async function boot() {
 const route=new URLSearchParams(location.search).get('view');
 if(route==='character-motion'){await mountCharacterMotionStudio(document.querySelector<HTMLElement>('#app')!);return;}
 if(route!=='story-generator')await loadCharacterArt(route==='character-generator'?'appearance/3':'appearance/1');
const game=new Game();const root=document.querySelector<HTMLElement>('#app')!;
let busy=false;
function draw(focus=false,message=''){
 const view=game.query();
 render(root,view,id=>{
  if(busy)return;busy=true;
  const result=game.execute(choiceCommand(view,id));
  // Keep the original buttons locked through the double-click interval.
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(b=>b.disabled=true);
  const runId=view.adventure.runId;
  setTimeout(()=>{if(game.query().adventure.runId!==runId)return;busy=false;draw(true,result.ok?'':result.reason);},240);
 },()=>{busy=false;game.restart();draw(true);},message);
 if(focus)root.querySelector<HTMLElement>('h2')?.focus();
}
if (new URLSearchParams(location.search).get('view') === 'character-generator') {
 document.title = '人物工坊 · hi-story';
 const studio = new CharacterStudio('hi-story:traveler:001');
 const update = (action:()=>void, message:string) => { try { action(); drawStudio(message); } catch(error) { drawStudio(error instanceof Error ? error.message : '生成失败'); } };
 function drawStudio(message='') {
  renderCharacterStudio(root,studio.query(),{
   generate: seed=>update(()=>studio.generate(seed ?? crypto.randomUUID()),'新组合已生成，锁定部件已保留。'),
   reroll: slot=>update(()=>studio.reroll(slot,crypto.randomUUID()),'已重抽该部件，其余部件保持原样。'),
   gender: gender=>update(()=>studio.setGender(gender),'身体类型已切换。'),
   exportPng: ()=>{const canvas=assembleCharacterCanvas(studio.query().model,studio.query().gender,4);canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='hi-story-character.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');},
   lock: (slot,locked)=>update(()=>studio.lock(slot,locked),locked?'部件已锁定。':'部件已解锁。'),
   select: (slot,part)=>update(()=>studio.setPart(slot,part),'样式已更新。'),
   export: ()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({...studio.query().model,gender:studio.query().gender,artVersion:artVersionFor(studio.query().model)},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='hi-story-character.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    drawStudio('人物 JSON 已导出。');
   },
  },message);
 }
 drawStudio();
} else if (new URLSearchParams(location.search).get('view') === 'story-generator') {
 const studio = new StoryStudio('hi-story:story:001');
 const drawStory = () => renderStoryStudio(root, studio, drawStory);
 drawStory();
} else draw();
}
boot().catch(()=>{const root=document.querySelector<HTMLElement>('#app')!;root.innerHTML='<main><p role="alert">人物素材加载失败，请重新加载页面。</p><button type="button">重新加载</button></main>';root.querySelector('button')!.onclick=()=>location.reload();});
