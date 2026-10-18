import {test,expect,type Page} from '@playwright/test';
import {open,state,near} from './world-navigation';
async function centered(page:Page,battle=false){
 await page.clock.runFor(50);
 const s=await state(page),selector=battle?`[data-battle-actor="${s.playerActorId}"] ellipse`:'[data-actor="player"] rect';
 const point=await page.locator(selector).evaluate((el,battle)=>{
  // The imported sprite canvas changes dimensions between actions. The ground
  // marker remains at ground y + 5; the camera follows the body at y - 38.
  const x=battle?Number(el.getAttribute('cx')):Number(el.getAttribute('x'))+Number(el.getAttribute('width'))/2;
  const y=battle?Number(el.getAttribute('cy'))-43:Number(el.getAttribute('y'))+34;
  const p=new DOMPoint(x,y).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);
  return {x:p.x,y:p.y,cx:innerWidth/2,cy:innerHeight/2};
 },battle);
 expect(Math.abs(point.x-point.cx)).toBeLessThan(.1);expect(Math.abs(point.y-point.cy)).toBeLessThan(.1);
}
test.beforeEach(async({page})=>{await page.clock.install();await page.clock.pauseAt(new Date());});
test('人物在移动的每帧保持居中，拖动不脱离，缩放和屏幕变化仍居中',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,'v040-visual');await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await centered(page);
 const initial=await state(page);await page.locator('#adventure-map').focus();
 for(const keys of [['d'],['s'],['a'],['w'],['d','s'],['a','w']]){for(const key of keys)await page.keyboard.down(key);for(let n=0;n<4;n++)await centered(page);for(const key of keys)await page.keyboard.up(key);await centered(page);}
 const before=await state(page);expect(before.revision).toBeGreaterThan(initial.revision);
 const {width,height}=info.project.use.viewport!;await page.mouse.move(width/2,height/2);await page.mouse.down();await page.mouse.move(width/2+75,height/2+50,{steps:5});await page.mouse.up();await centered(page);await page.clock.runFor(300);expect((await state(page)).runtime.actors[before.playerActorId].position).toEqual(before.runtime.actors[before.playerActorId].position);
 await page.getByRole('button',{name:'放大地图'}).click();for(let i=0;i<4;i++)await centered(page);await page.setViewportSize({width:width+40,height:height+40});await centered(page);await page.setViewportSize({width,height});await centered(page);
 const down=page.locator('[data-move="0,1"]');await down.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:1});for(let i=0;i<4;i++)await centered(page);await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1})));await centered(page);
 await page.screenshot({path:`/tmp/${info.project.name}-player-camera.png`});expect(errors).toEqual([]);
});
test('自动步行和战术移动同样跟随人物，退出战斗后恢复世界人物中心',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await open(page,'v030-after-battle-0');await near(page,'npc-0');await centered(page);await page.locator('[data-panel="interaction"]').click();await page.locator('[data-npc="npc-0"]').click();await page.locator('[data-fight="npc-0"]').click();await page.getByRole('button',{name:'继续冒险',exact:true}).click();await page.clock.runFor(150);await centered(page,true);
 const cell=page.getByRole('button',{name:/战场.*移动消耗 1 格/}).first();await cell.focus();await page.keyboard.press('Enter');await page.clock.runFor(150);await centered(page,true);
 await page.locator('[data-combat="flee"]').click();await page.getByRole('button',{name:'继续冒险',exact:true}).click();expect((await state(page)).runtime.encounter!.status).toBe('fled');await page.clock.runFor(150);await centered(page);
});
