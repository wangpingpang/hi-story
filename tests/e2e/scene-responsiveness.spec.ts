import {test,expect} from '@playwright/test';
import {state} from './world-navigation';

// Real time is intentional: a paused/fake clock cannot reveal a saturated UI thread.
test('慢速设备仍可响应：静态场景复用、真实移动停止、菜单和刷新恢复',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.addInitScript(()=>{
  const probe={frames:0,draws:0,gaps:[] as number[],last:performance.now()};
  Object.assign(window,{sceneProbe:probe});
  setInterval(()=>{const now=performance.now();probe.gaps.push(now-probe.last);probe.last=now;},50);
  const draw=CanvasRenderingContext2D.prototype.drawImage,clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.drawImage=function(...args:any[]){if(this.canvas instanceof HTMLCanvasElement&&this.canvas.classList.contains('world-canvas'))probe.draws++;return Reflect.apply(draw,this,args);};
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas instanceof HTMLCanvasElement&&this.canvas.classList.contains('world-canvas')&&args[0]===0&&args[1]===0)probe.frames++;return clear.apply(this,args);};
 });
 await page.goto('?view=demo&seed=v040-visual');await page.locator('.world-canvas[data-art="ready"]').waitFor();
 await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await page.waitForTimeout(2400);
 await expect(page.locator('.world-canvas')).toHaveAttribute('data-scenery-cache','static-layer');
 await page.evaluate(()=>{const p=(window as any).sceneProbe;p.frames=p.draws=0;p.gaps=[];p.last=performance.now();});
 await page.waitForTimeout(2600);
 const idle=await page.evaluate(()=>{const p=(window as any).sceneProbe;return {frames:p.frames,imageCalls:p.draws,meanImageCalls:p.draws/p.frames,maxHeartbeatGap:Math.max(...p.gaps),liveProps:Number((document.querySelector('.world-canvas') as HTMLElement).dataset.liveProps)};});
 expect(idle.frames).toBeGreaterThan(8);expect(idle.meanImageCalls).toBeLessThan(90);expect(idle.maxHeartbeatGap).toBeLessThan(250);
 const before=await state(page);await page.locator('#adventure-map').focus();await page.keyboard.down('d');await page.waitForTimeout(650);await page.keyboard.up('d');await page.waitForTimeout(250);await page.keyboard.down('s');await page.waitForTimeout(650);await page.keyboard.up('s');await page.waitForTimeout(300);
 const moved=await state(page);expect(moved.revision).toBeGreaterThan(before.revision);expect(moved.runtime.actors[moved.playerActorId].position).not.toEqual(before.runtime.actors[before.playerActorId].position);
 await page.waitForTimeout(350);expect((await state(page)).runtime.actors[moved.playerActorId].position).toEqual(moved.runtime.actors[moved.playerActorId].position);
 const clickStart=Date.now();await page.locator('[data-panel="inventory"]').click();await expect(page.getByRole('dialog')).toBeVisible();const menuLatency=Date.now()-clickStart;expect(menuLatency).toBeLessThan(1500);
 await page.locator('[data-panel="settings"]').click();await page.locator('#adventure-save').click();const saved=await state(page);
 await page.screenshot({path:`/tmp/${info.project.name}-scene-responsive.png`});
 await page.goto('?view=demo');await page.locator('.world-canvas[data-art="ready"]').waitFor();expect((await state(page)).runtime).toEqual(saved.runtime);expect(errors).toEqual([]);
 await info.attach('responsiveness',{body:JSON.stringify({cpuSlowdown:4,viewport:info.project.use.viewport,idle,menuLatency,moveRevisions:moved.revision-before.revision,errors}),contentType:'application/json'});
});
