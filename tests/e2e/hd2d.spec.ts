import {test,expect} from '@playwright/test';
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
