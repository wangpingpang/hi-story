import {test,expect} from '@playwright/test';
import {open,state} from './world-navigation';
const position=(s:Awaited<ReturnType<typeof state>>)=>s.runtime.actors[s.playerActorId].position;
test.beforeEach(async({page})=>{await page.clock.install();await page.clock.pauseAt(new Date());});
test('连续行走保留地图和 HUD 节点，停止输入后不继续移动',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,'v040-visual');await page.getByRole('button',{name:'关闭浮层',exact:true}).click();
 await expect.poll(async()=>{await page.clock.runFor(50);return page.locator('.world-canvas').getAttribute('data-art');}).toBe('ready');
 await page.locator('#adventure-map').evaluate(el=>(el as HTMLElement).dataset.retained='yes');await page.locator('.actor-hud').evaluate(el=>(el as HTMLElement).dataset.retained='yes');
 await page.locator('#adventure-map').focus();await page.keyboard.down('d');await page.clock.runFor(300);await page.keyboard.up('d');await page.clock.runFor(50);
 expect(position(await state(page)).x).toBeCloseTo(6.96);await expect(page.locator('#adventure-map')).toHaveAttribute('data-retained','yes');await expect(page.locator('.actor-hud')).toHaveAttribute('data-retained','yes');
 const before=await state(page);await page.clock.runFor(500);expect(position(await state(page))).toEqual(position(before));
 await expect(page.locator('.world-canvas')).toHaveAttribute('data-fog','soft');expect(Number(await page.locator('.world-canvas').getAttribute('data-scenery'))).toBeGreaterThan(300);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`docs/evidence/${info.project.name}-v040-world.png`});expect(errors).toEqual([]);
});
test('点击 NPC 实际步行至相邻处，交谈与检定只结算一次，刷新保留结果',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await open(page,'v040-visual');await page.getByRole('button',{name:'关闭浮层',exact:true}).click();const initial=await state(page);
 await page.locator('[data-actor="npc-0"]').dispatchEvent('click');
 for(let i=0;i<30&&!await page.locator('[data-choice="persuade"]:enabled').count();i++)await page.clock.runFor(200);
 const near=await state(page),p=near.runtime.actors[near.playerActorId].position,npc=Object.values(near.runtime.actors).find(a=>a.storyNpcId==='npc-0')!;
 expect(Math.hypot(p.x-npc.position.x,p.y-npc.position.y)).toBeLessThanOrEqual(1.12);expect(p).not.toEqual(initial.runtime.actors[initial.playerActorId].position);await expect(page.locator('[data-choice="persuade"]')).toBeEnabled();
 await page.screenshot({path:`docs/evidence/${info.project.name}-v040-dialogue.png`});await page.locator('[data-choice="persuade"]').click();await expect(page.getByRole('button',{name:'继续冒险',exact:true})).toBeVisible();const rolled=await state(page);expect(rolled.runtime.checks.length).toBe(near.runtime.checks.length+1);await page.getByRole('button',{name:'继续冒险',exact:true}).click();await page.locator('#dice-review').click();await page.getByRole('button',{name:'继续冒险',exact:true}).click();expect((await state(page)).runtime.checks).toEqual(rolled.runtime.checks);
 await page.goto('/?view=demo');expect((await state(page)).runtime).toEqual(rolled.runtime);await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await page.locator('#adventure-map').focus();await page.keyboard.press('e');await expect(page.locator('[data-choice="insight"]')).toBeVisible();
});
test('Esc 取消靠近人物；触摸方向键持续行走并在松开后停止',async({page})=>{
 await open(page,'v040-visual');await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await page.locator('[data-actor="npc-0"]').dispatchEvent('click');await page.clock.runFor(100);await page.keyboard.press('Escape');const stopped=await state(page);await page.clock.runFor(1000);expect(position(await state(page))).toEqual(position(stopped));await expect(page.locator('.adventure-panel')).toHaveCount(0);
 const down=page.locator('[data-move="0,1"]');await down.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch'});await page.clock.runFor(200);await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,pointerType:'touch'})));const moved=await state(page);expect(position(moved)).not.toEqual(position(stopped));await page.clock.runFor(500);expect(position(await state(page))).toEqual(position(moved));
});
