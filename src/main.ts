import './presentation/style.css';

async function boot() {
 const params=new URLSearchParams(location.search),route=params.get('view');
 const root=document.querySelector<HTMLElement>('#app')!;
 if(route==='character-library'||route==='character-generator'||route==='character-motion'){
  const {mountCharacterLibrary}=await import('./presentation/character-library');
  document.title='人物素材馆 · hi-story';await mountCharacterLibrary(root);return;
 }
 if(!route||route==='demo'){
  const [{createAdventureApplication},{mountAdventure},{createBrowserSavePort}]=await Promise.all([
   import('./application'),import('./presentation/adventure'),import('./infrastructure/adventure-save'),
  ]);
  let storage;try{storage=createBrowserSavePort(localStorage);}catch{storage=undefined;}
  const app=createAdventureApplication({storage}),seed=params.get('seed');
  const continued=await app.continueSaved();
  if(continued.ok&&seed&&app.query().snapshot?.seed!==seed){const result=await app.restart({seed});if(!result.ok)throw Error(result.error.message);}
  else if(!continued.ok){const result=await app.initialize({seed:seed||'hi-story-v010'});if(!result.ok)throw Error(result.error.message);}
  document.title='暮光山谷 · hi-story v0.5.0';mountAdventure(root,app);return;
 }
 // Historical demos are loaded only when explicitly opened.
 if(route==='equipment-book'){
  const {mountEquipmentBook}=await import('./presentation/equipment-book');
  await mountEquipmentBook(root);document.title='旅人的衣橱 · hi-story';return;
 }
 if(route==='story-generator'){
  const [{StoryStudio},{renderStoryStudio}]=await Promise.all([import('./application/story-studio'),import('./presentation/story-studio')]);
  const studio=new StoryStudio('hi-story:story:001');
  const draw=()=>renderStoryStudio(root,studio,draw);draw();return;
 }
 const {loadCharacterArt}=await import('./presentation/character-art');await loadCharacterArt('appearance/1');
 if(route==='demo-legacy'){
  const [{createGameApplication},{mountDemo}]=await Promise.all([import('./application'),import('./presentation/demo')]);
  const app=createGameApplication(),result=await app.initialize({seed:params.get('seed')||'hi-story-demo'});
  if(!result.ok)throw Error(result.error.message);
  document.title='生成与探索 Demo · hi-story';mountDemo(root,app);return;
 }
 const [{Game},{choiceCommand},{render}]=await Promise.all([import('./application/game'),import('./input'),import('./presentation')]);
 const game=new Game();let busy=false;
 function draw(focus=false,message=''){
  const view=game.query();
  render(root,view,id=>{
   if(busy)return;busy=true;
   const result=game.execute(choiceCommand(view,id));
   root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>button.disabled=true);
   const runId=view.adventure.runId;
   setTimeout(()=>{if(game.query().adventure.runId!==runId)return;busy=false;draw(true,result.ok?'':result.reason);},240);
  },()=>{busy=false;game.restart();draw(true);},message);
  if(focus)root.querySelector<HTMLElement>('h2')?.focus();
 }
 draw();
}
boot().catch(error=>{
 const root=document.querySelector<HTMLElement>('#app')!;
 root.innerHTML='<main><p role="alert"></p><button type="button">重新加载</button></main>';
 root.querySelector('p')!.textContent=error instanceof Error?`旅程加载失败：${error.message}`:'旅程加载失败，请重新加载页面。';
 root.querySelector('button')!.onclick=()=>location.reload();
});
