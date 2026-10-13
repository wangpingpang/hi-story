import {test,expect} from '@playwright/test';
test('故事工坊：死亡联动、主线闭环和移动布局',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?view=story-generator');
 await expect(page.getByRole('heading',{name:'随机故事工坊'})).toBeVisible();
 await expect(page.locator('[data-option]')).toHaveCount(18);
 await page.locator('[data-option="attack:npc-0"]').click();
 await page.getByRole('button',{name:'结算：目标死亡'}).click();
 await expect(page.locator('[data-option="ask:npc-0"]')).toHaveCount(0);
 await expect(page.getByText(/委托人死亡，原委托终止/)).toBeVisible();
 await page.locator('[data-option="notes"]').click();
 await page.locator('[data-option="buy"]').click();
 await page.locator('[data-option="resolve"]').click();
 await expect(page.getByText(/^你完成了目标/)).toBeVisible();
 await expect(page.locator('[data-option]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
