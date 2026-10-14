import { expect, type Page } from '@playwright/test';
import { createGameApplication, type RunSnapshot } from '../../src/application';
import type { Point } from '../../src/modules/world';

export interface DemoFixture { snapshot: RunSnapshot; position: Point }
export async function openDemo(page: Page, seed: string): Promise<DemoFixture> {
  const app=createGameApplication();const result=await app.initialize({seed});
  if(!result.ok)throw Error(result.error.message);
  const snapshot=structuredClone(app.query().snapshot!) as RunSnapshot;app.dispose();
  await page.goto(`/?view=demo&seed=${encodeURIComponent(seed)}`);
  await expect(page.getByRole('heading',{name:'世界地图',exact:true})).toBeVisible();
  return {snapshot,position:{...snapshot.runtime.actors[snapshot.playerActorId].position}};
}
// Plan from a separate deterministic domain instance; all browser actions still use actual controls.
export function route(fixture:DemoFixture,target:Point):Point[] {
  const {snapshot:s,position:start}=fixture;
  const blocked=new Set(Object.values(s.runtime.actors).filter(a=>a.actorId!==s.playerActorId&&a.hp>0).map(a=>`${a.position.x},${a.position.y}`));
  const queue:{p:Point;path:Point[]}[]=[{p:start,path:[]}],seen=new Set([`${start.x},${start.y}`]);
  for(let i=0;i<queue.length;i++){
    const {p,path}=queue[i];if(p.x===target.x&&p.y===target.y)return path;
    for(const q of [{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]){
      const key=`${q.x},${q.y}`;
      if(!seen.has(key)&&!blocked.has(key)&&s.runtime.map.cells[q.y]?.[q.x]?.walkable){seen.add(key);queue.push({p:q,path:[...path,q]});}
    }
  }throw Error('Browser fixture target is unreachable');
}
export async function walk(page:Page,fixture:DemoFixture,target:Point):Promise<void> {
  for(const point of route(fixture,target)){
    const name=point.x>fixture.position.x?'向右':point.x<fixture.position.x?'向左':point.y>fixture.position.y?'向下':'向上';
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.getByText(`坐标 ${point.x}, ${point.y} ·`,{exact:false})).toBeVisible();fixture.position={...point};
  }
}
export async function encounter(page:Page,fixture:DemoFixture):Promise<void> {
  const npc=Object.values(fixture.snapshot.runtime.actors).find(a=>a.storyNpcId==='npc-0')!;
  const p=npc.position,map=fixture.snapshot.runtime.map,region=map.cells[p.y][p.x].regionId;
  const adjacent=[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]
    .filter(q=>map.cells[q.y]?.[q.x]?.regionId===region)
    .flatMap(q=>{try{return [{p:q,path:route(fixture,q)}];}catch{return [];}}).sort((a,b)=>a.path.length-b.path.length);
  await walk(page,fixture,adjacent[0].p);
  await page.getByRole('button',{name:`攻击${npc.profile.name}（交由战斗结算）`,exact:false}).click();
  await expect(page.getByRole('heading',{name:'战斗 · 第1回合',exact:true})).toBeVisible();
}
