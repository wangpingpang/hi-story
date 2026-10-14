import {test,expect} from '@playwright/test';
test.setTimeout(45000);
test('新建筑可从画面点击，沿真实路线步行抵达并打开互动',async({page})=>{
 await page.goto('/?view=demo&seed=hd2d-building');await expect(page.locator('.adventure-shell')).toBeVisible();
 const s=await page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:v010')!).payload),target=s.runtime.map.anchors.find((a:any)=>a.id==='market').position,start=s.runtime.actors[s.playerActorId].position;
 const occupied=new Set(Object.values(s.runtime.actors).filter((a:any)=>a.actorId!==s.playerActorId&&a.hp>0).map((a:any)=>`${a.position.x},${a.position.y}`));
 const queue=[{p:start,path:[] as {x:number;y:number}[]}],seen=new Set([`${start.x},${start.y}`]);let path:{x:number;y:number}[]=[];
 for(let i=0;i<queue.length;i++){const {p,path:route}=queue[i];if(Math.abs(p.x-target.x)+Math.abs(p.y-target.y)===1){path=route;break;}for(const q of [{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]){const k=`${q.x},${q.y}`;if(!seen.has(k)&&!occupied.has(k)&&s.runtime.map.cells[q.y]?.[q.x]?.walkable){seen.add(k);queue.push({p:q,path:[...route,q]});}}}
 expect(path.length).toBeGreaterThan(0);let p=start;for(const q of path){await page.getByRole('button',{name:q.x>p.x?'向右':q.x<p.x?'向左':q.y>p.y?'向下':'向上',exact:true}).click();await expect(page.locator('.position-label')).toContainText(`坐标 ${q.x}, ${q.y}`);p=q;}
 await expect(page.locator('[data-move="0,1"]')).toBeEnabled();await page.getByRole('button',{name:'关闭浮层',exact:true}).click();
 // A clipped SVG image's outer group bbox can include unpainted atlas space; click the real building region.
 const building=page.locator('[data-anchor="market"] [data-landmark-hit]');await expect(building).toBeVisible();await building.click();await expect(page.locator('.position-label')).toContainText(`坐标 ${target.x}, ${target.y}`);await expect(page.getByRole('heading',{name:'附近的相遇',exact:true})).toBeVisible();
});
test('HD-2D 场景素材与天气浮层可用，天气不改存档',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
 await page.goto('/?view=demo&seed=hd2d-scene');await expect(page.locator('.adventure-shell')).toHaveAttribute('data-version','0.2.0');
 await expect(page.locator('[data-scenery="cottage"]')).not.toHaveCount(0);await expect(page.locator('.iso-ground')).toBeVisible();
 await page.locator('[data-panel="settings"]').click();const before=await page.evaluate(()=>localStorage.getItem('hi-story:adventure:v010'));
 for(const weather of ['rain','snow','mist','sun']){await page.locator(`[data-weather="${weather}"]`).click();await expect(page.locator('.adventure-shell')).toHaveClass(new RegExp(`weather-${weather}`));expect(await page.evaluate(()=>localStorage.getItem('hi-story:adventure:v010'))).toBe(before);}
 await page.getByRole('button',{name:'关闭浮层',exact:true}).click();await page.screenshot({path:`docs/evidence/${info.project.name}-v020-hd2d.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('职业选择、技能入口、真实休息与刷新恢复',async({page})=>{
 await page.goto('/?view=demo&seed=hd2d-profession');await page.locator('[data-panel="settings"]').click();await page.getByLabel('职业规则（新旅程启用）').selectOption('wizard');await page.getByRole('button',{name:'生成新旅程',exact:true}).click();
 await expect(page.locator('.actor-hud')).toContainText('法师');await expect(page.locator('[data-profession-skill]')).not.toHaveCount(0);await page.locator('[data-rest="short"]').click();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:v010')!).payload);expect(before.story.time).toBe(1);await page.reload();await expect(page.locator('.actor-hud')).toContainText('法师');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:v010')!).payload);expect(after.runtime.actors[after.playerActorId].profession).toEqual(before.runtime.actors[before.playerActorId].profession);
 await page.locator('[data-panel="inventory"]').click();await page.getByText('装备素材图鉴',{exact:false}).click();await expect(page.locator('.equipment-gallery figure')).toHaveCount(6);
 await page.locator('[data-panel="settings"]').click();await page.getByLabel('职业规则（新旅程启用）').selectOption('');await page.getByRole('button',{name:'生成新旅程',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hi-story:adventure:v010')!).payload.runtime.professionVersion)).toBeUndefined();
});
