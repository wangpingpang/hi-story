import {expect,type Page} from '@playwright/test';
import type {AdventureSnapshot} from '../../src/application';
export const SAVE_KEY='hi-story:adventure:world-v2';
export async function state(page:Page):Promise<AdventureSnapshot>{return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).payload,SAVE_KEY);}
export async function open(page:Page,seed:string){await page.goto(`/?view=demo&seed=${seed}`);await expect(page.locator('.adventure-shell')).toBeVisible();return state(page);}
export async function finishTravel(page:Page,target:{x:number;y:number}){
 for(let i=0;i<200;i++){
  const s=await state(page),p=s.runtime.actors[s.playerActorId].position;if(Math.hypot(p.x-target.x,p.y-target.y)<1e-5)return;
  await page.clock.runFor(1000);
 }
 throw Error('Walking did not reach '+JSON.stringify(target));
}
export async function go(page:Page,id:string){const target=(await state(page)).runtime.map.anchors.find(a=>a.id===id)!.position;await page.locator('[data-panel="quests"]').click();await page.locator(`[data-route="${id}"]`).click();await finishTravel(page,target);}
export async function walk(page:Page,target:{x:number;y:number}){
 const s=await state(page),height=s.runtime.visual[`${target.x},${target.y}`].height;
 const client=await page.locator('#adventure-map').evaluate((svg,args)=>{const p=new DOMPoint((args.target.x-args.target.y)*32,(args.target.x+args.target.y)*16-args.height*16).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);return {x:p.x,y:p.y};},{target,height});
 await page.locator('#adventure-map').dispatchEvent('click',{clientX:client.x,clientY:client.y});await finishTravel(page,target);
}
export async function near(page:Page,id:string){
 let s=await state(page),actor=Object.values(s.runtime.actors).find(a=>a.storyNpcId===id)!,p=actor.position;
 if(!s.runtime.visible.includes(`${p.x},${p.y}`)){
  const nearest=s.runtime.map.anchors.filter(a=>a.id!=='reserve').sort((a,b)=>Math.hypot(a.position.x-p.x,a.position.y-p.y)-Math.hypot(b.position.x-p.x,b.position.y-p.y))[0];await go(page,nearest.id);s=await state(page);
 }
 const q=[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}].find(q=>s.runtime.map.cells[q.y]?.[q.x]?.walkable&&!Object.values(s.runtime.actors).some(a=>a.hp>0&&a.position.x===q.x&&a.position.y===q.y));
 if(!q)throw Error('NPC not reachable');await walk(page,q);
}
