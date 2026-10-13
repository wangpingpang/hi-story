import { Game } from './application/game';
import { choiceCommand } from './input';
import { render } from './presentation';
import './presentation/style.css';
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
draw();
