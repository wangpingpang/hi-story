import { generateCharacterWithParams } from '../application/character-motion';
import { mountCharacterMotionStudio } from './character-motion-studio';
import { escapeHtml as escape } from './html';

export async function mountCharacterDemo(root:HTMLElement):Promise<()=>void>{
 let unmount:(()=>void)|undefined;
 let busy=false,disposed=false;
 const newSeed=()=>`traveler-${crypto.randomUUID()}`;

 async function show(seed:string):Promise<void>{
  if(busy||disposed)return;
  // Validate before replacing the displayed character, so an invalid seed is reversible.
  const character=generateCharacterWithParams({seed,appearanceVersion:'appearance/3'});
  busy=true;
  try{
   unmount?.();
   unmount=await mountCharacterMotionStudio(root,{appearance:character.appearance,gender:character.gender});
   if(disposed){unmount();return;}
   document.title='随机人物模型 · hi-story';
   root.querySelector('h1')!.textContent='下一位旅人，会是谁。';
   root.querySelector('.motion-heading p:last-child')!.textContent='生成一位完整人物，看看穿戴、八方向与动作中的样子。';
   root.querySelector('.edition')!.innerHTML='随机人物模型<br>原素材 · 实时装配';
   root.querySelector('.motion-heading')!.insertAdjacentHTML('afterend',`
    <section class="card demo-profile" aria-label="随机人物资料">
     <div class="demo-identity"><p class="eyebrow">A NEW FACE · A NEW STORY</p><h2>${escape(character.name)}</h2><p>${character.age} 岁 · ${escape(character.identity.occupation)}</p><div class="demo-traits">${character.personality.traits.map(trait=>`<span>${escape(trait)}</span>`).join('')}</div></div>
     <div class="demo-background"><p>${escape(character.identity.background)}</p><p><strong>此行所愿</strong> ${escape(character.motivation)}</p><p class="muted">喜欢：${escape(character.preferences?.likes.join('、')??'未设定')} · 不喜欢：${escape(character.preferences?.dislikes.join('、')??'未设定')}</p></div>
     <div class="demo-generate"><button type="button" data-demo-next>↻ 随机下一位旅人</button><form data-demo-seed-form><label>人物种子<input name="seed" maxlength="128" required value="${escape(seed)}" autocomplete="off" spellcheck="false"></label><button type="submit">按种子生成</button></form><p class="muted">同一种子可复现初始人物。下方可继续调整外观与动作。</p></div>
    </section>`);
   const next=()=>{void show(newSeed()).catch(report);};
   root.querySelector<HTMLButtonElement>('[data-demo-next]')!.onclick=next;
   root.querySelector<HTMLButtonElement>('[data-random]')!.onclick=next;
   root.querySelector<HTMLFormElement>('[data-demo-seed-form]')!.onsubmit=event=>{
    event.preventDefault();
    const input=root.querySelector<HTMLInputElement>('[name="seed"]')!;
    void show(input.value.trim()).catch(report);
   };
   const address=new URL(location.href);address.searchParams.set('view','character-demo');address.searchParams.set('seed',seed);address.hash='';history.replaceState(null,'',address);
  }finally{busy=false;}
 }
 function report(error:unknown){const status=root.querySelector<HTMLElement>('[data-status]');if(status)status.textContent=error instanceof Error?error.message:'生成人物失败，请重试。';}
 const seed=new URLSearchParams(location.search).get('seed');
 try{await show(seed??newSeed());}catch(error){if(!seed)throw error;await show(newSeed());report(error);}
 return()=>{disposed=true;unmount?.();};
}
