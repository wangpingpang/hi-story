import {test,expect,type Page} from './fixtures';
import {createServer} from 'vite';
import type {AdventureSnapshot} from '../../src/application';
let server:Awaited<ReturnType<typeof createServer>>;
let factory:typeof import('../../src/application');
test.beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});factory=await server.ssrLoadModule('/src/application/index.ts') as typeof import('../../src/application');});
test.afterAll(async()=>{await server.close();});
const errors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const found:string[]=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));page.on('console',e=>{if(e.type()==='error')found.push(e.text());});page.on('requestfailed',r=>found.push(r.url()));});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function state(page:Page):Promise<AdventureSnapshot> {return page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:v010')!).payload);}
async function open(page:Page,seed:string){await page.goto(`/?view=demo&seed=${seed}`);await expect(page.locator('.adventure-shell')).toBeVisible();return state(page);}
async function panel(page:Page,id:string){await page.locator(`[data-panel="${id}"]`).click();}
async function walk(page:Page,target:{x:number;y:number}){
 const s=await state(page),start=s.runtime.actors[s.playerActorId].position,occupied=new Set(Object.values(s.runtime.actors).filter(a=>a.actorId!==s.playerActorId&&a.hp>0).map(a=>`${a.position.x},${a.position.y}`));
 const queue=[{p:start,path:[] as {x:number;y:number}[]}],seen=new Set([`${start.x},${start.y}`]);let path:{x:number;y:number}[]|undefined;
 for(let i=0;i<queue.length;i++){const {p,path:route}=queue[i];if(p.x===target.x&&p.y===target.y){path=route;break;}for(const q of [{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]){const k=`${q.x},${q.y}`;if(!seen.has(k)&&!occupied.has(k)&&s.runtime.map.cells[q.y]?.[q.x]?.walkable){seen.add(k);queue.push({p:q,path:[...route,q]});}}}if(!path)throw Error('Fixture path unavailable');
 let p=start;for(const q of path){const name=q.x>p.x?'向右':q.x<p.x?'向左':q.y>p.y?'向下':'向上';await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('.position-label')).toContainText(`坐标 ${q.x}, ${q.y}`);p=q;}
}
async function go(page:Page,id:string){await walk(page,(await state(page)).runtime.map.anchors.find(a=>a.id===id)!.position);}
async function near(page:Page,id:string){const s=await state(page),p=Object.values(s.runtime.actors).find(a=>a.storyNpcId===id)!.position;for(const q of [{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]){if(!s.runtime.map.cells[q.y]?.[q.x]?.walkable||Object.values(s.runtime.actors).some(a=>a.hp>0&&a.position.x===q.x&&a.position.y===q.y))continue;try{await walk(page,q);return;}catch{}}throw Error('NPC not reachable');}
async function choose(page:Page,template:string,choice:string,npcId?:string){await panel(page,'interaction');if(npcId)await page.locator(`[data-npc="${npcId}"]`).click();const s=await state(page),e=s.things.events.find(e=>e.templateId===template&&e.npcId===npcId&&e.status!=='settled')!;await page.locator(`[data-event="${e.id}"][data-choice="${choice}"]`).click();}
async function plotSeed(id:string){for(let i=0;i<30;i++){const app=factory.createAdventureApplication();await app.initialize({seed:`browser-v010-${i}`});const s=app.query().snapshot!;app.dispose();if(s.story.plotId===id)return s.seed;}throw Error('Plot seed missing');}
async function checkSeed(skill:string,dc:number,want:boolean,mode='normal'){
 const rules=await server.ssrLoadModule('/src/modules/runtime/index.ts') as typeof import('../../src/modules/runtime');
 for(let i=0;i<100;i++){const app=factory.createAdventureApplication();await app.initialize({seed:`check-browser-${i}`});const s=structuredClone(app.query().snapshot!) as AdventureSnapshot;app.dispose();if(rules.rollSkill(s.runtime,s.playerActorId,skill as any,dc,'probe',mode as any).result.success===want)return s.seed;}throw Error('Check seed not found');
}
const modal=(page:Page)=>page.getByRole('dialog',{name:'骰子检定反馈',exact:true});
async function social(page:Page,success:boolean){await open(page,await checkSeed('persuasion',12,success));await near(page,'npc-0');await choose(page,'social-persuade','persuade','npc-0');}
async function skip(page:Page){await page.getByRole('button',{name:'跳过动画',exact:true}).click();await expect(page.getByRole('button',{name:'继续冒险',exact:true})).toBeVisible();}
async function close(page:Page){await page.getByRole('button',{name:'继续冒险',exact:true}).click();await expect(modal(page)).toHaveCount(0);await expect(page.locator('.adventure-shell')).toHaveAttribute('aria-busy','false');}
for(const success of [true,false])test(`真实${success?'成功':'失败'}检定分阶段揭晓、公式与结果一致`,async({page},info)=>{
 await social(page,success);await expect(modal(page)).toBeVisible();await expect(page.locator('.dice-feedback-host')).toHaveAttribute('data-phase','rolling');await expect(modal(page).locator('.die-svg text')).toHaveText('?');await expect(modal(page).locator('.dice-formula')).toHaveCount(0);
 const saved=await state(page),check=saved.runtime.checks.at(-1)!;expect(check.success).toBe(success);await expect(modal(page).locator('.dice-actor')).toContainText(saved.story.npcs.find(n=>n.id==='npc-0')!.name);const position=saved.runtime.actors[saved.playerActorId].position;await page.keyboard.press('ArrowDown');expect((await state(page)).runtime.actors[saved.playerActorId].position).toEqual(position);
 await expect(page.locator('.dice-feedback-host')).toHaveAttribute('data-phase','result');await expect(modal(page).locator('h3')).toContainText(success?'检定成功':'检定失败');await expect(modal(page).locator('.dice-formula')).toContainText(`= ${check.total} / DC ${check.dc}`);await expect(modal(page).locator('.die-svg text')).toHaveText(String(check.dice[0]));
 expect(await modal(page).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.screenshot({path:`../qa-dice/${info.project.name}-${success?'success':'failure'}.png`});await expect(modal(page)).toHaveCount(0);expect((await state(page)).runtime).toEqual(saved.runtime);await expect(page.locator('#adventure-map')).toBeFocused();
});
test('优势两骰、采用与舍弃、物品后果均来自真实结果',async({page})=>{
 await open(page,await checkSeed('arcana',12,true,'advantage'));await go(page,'shrine');const before=await state(page);await choose(page,'shrine','study');await skip(page);const after=await state(page),check=after.runtime.checks.at(-1)!;expect(check.mode).toBe('advantage');await expect(modal(page).locator('.die-wrap')).toHaveCount(2);await expect(modal(page).locator('.discarded')).toHaveCount(1);await expect(modal(page)).toContainText('优势 · 取较高值');await expect(modal(page).locator('.dice-consequences')).toContainText('火把 -1');expect(after.things.inventory.torch).toBe(before.things.inventory.torch-1);await close(page);expect((await state(page)).things).toEqual(after.things);
});
test('跳过保留结果，回看不重掷、无再次结算、焦点可返回',async({page})=>{
 await social(page,true);const committed=await state(page);await skip(page);await page.waitForTimeout(2400);await expect(modal(page)).toBeVisible();await page.keyboard.press('Tab');await expect(modal(page).getByRole('button')).toBeFocused();await close(page);await expect(page.locator('#adventure-map')).toBeFocused();await page.getByRole('button',{name:'回看最近骰子结果'}).click();await expect(modal(page)).toContainText('本次全部结果');expect(await modal(page).locator('.dice-tray').first().evaluate(e=>getComputedStyle(e).animationName)).toBe('none');await page.waitForTimeout(2300);await expect(modal(page)).toBeVisible();await page.keyboard.press('Escape');await expect(modal(page)).toHaveCount(0);expect(await state(page)).toEqual(committed);
});
test('动画期间刷新保留已提交结果且不重播',async({page})=>{
 await social(page,false);await expect(page.locator('.dice-feedback-host')).toHaveAttribute('data-phase','rolling');const committed=await state(page);await page.reload();await expect(page.locator('.adventure-shell')).toBeVisible();await expect(modal(page)).toHaveCount(0);const restored=await state(page);expect(restored.runtime).toEqual(committed.runtime);expect(restored.things).toEqual(committed.things);expect(restored.runId).not.toBe(committed.runId);await expect(page.locator('.dice-result')).toContainText('失败');
});
test('三种样式与音效偏好保存，设置不改变冒险随机状态',async({page})=>{
 await open(page,'dice-prefs');const before=await state(page);await panel(page,'settings');await expect(page.locator('#dice-sound')).not.toBeChecked();for(const theme of ['ivory','obsidian','jade']){await page.locator(`[data-dice-theme="${theme}"]`).click();await expect(page.locator(`[data-dice-theme="${theme}"]`)).toHaveAttribute('aria-pressed','true');}
 await page.locator('[data-dice-theme="obsidian"]').click();await page.locator('#dice-sound').check();expect((await state(page)).runtime).toEqual(before.runtime);await page.reload();await panel(page,'settings');await expect(page.locator('[data-dice-theme="obsidian"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#dice-sound')).toBeChecked();await social(page,true);await expect(page.locator('.dice-feedback-host')).toHaveAttribute('data-theme','obsidian');await skip(page);await close(page);
});
test('减少动态效果直接显示结果，Escape可关闭',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await social(page,true);await expect(modal(page)).toContainText('本次全部结果');await expect(page.locator('.dice-feedback-host')).toHaveAttribute('data-phase','result');expect(await modal(page).locator('.die-wrap').first().evaluate(e=>getComputedStyle(e).animationName)).toBe('none');const committed=await state(page);await page.keyboard.press('Escape');await expect(modal(page)).toHaveCount(0);expect(await state(page)).toEqual(committed);
});
test('战斗先攻、移动及后续攻击都使用结构化真实骰子',async({page})=>{
 await open(page,'dice-real-battle');await near(page,'npc-0');await panel(page,'interaction');await page.locator('[data-npc="npc-0"]').click();await page.locator('[data-fight="npc-0"]').click();await skip(page);const started=await state(page),battle=started.runtime.encounter!;expect(battle.rolls!.some(r=>r.kind==='initiative')).toBe(true);expect(battle.rolls!.some(r=>r.kind==='movement')).toBe(true);await expect(modal(page).locator('.die-d4')).not.toHaveCount(0);await expect(modal(page).locator('.dice-card')).toHaveCount(battle.rolls!.length);for(const r of battle.rolls!)await expect(modal(page).locator(`[data-roll-id="${r.id}"] .dice-formula`)).toContainText(`= ${r.total}`);await close(page);
 await page.locator('[data-combat="end"]').click();await skip(page);const after=await state(page),newRolls=after.runtime.encounter!.rolls!.filter(r=>r.sequence>battle.rollSequence!);await expect(modal(page).locator('.dice-card')).toHaveCount(newRolls.length);expect(newRolls.some(r=>r.kind==='attack')).toBe(true);for(const r of newRolls)await expect(modal(page).locator(`[data-roll-id="${r.id}"] .dice-formula`)).toContainText(`= ${r.total}`);await close(page);await page.getByRole('button',{name:'回看最近骰子结果'}).click();await expect(modal(page).locator('.dice-card')).toHaveCount(newRolls.length);await close(page);expect((await state(page)).runtime).toEqual(after.runtime);
});
