import {test,expect} from '@playwright/test';
import {state} from './world-navigation';

const canvas='[data-cl-canvas]',preference='hi-story:character-model:molibaike-v1';

test('人物名册、真实动画、八向预览和暂停在桌面与窄屏可用',async({page},info)=>{
 const errors:string[]=[],requested:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requested.push(request.url()));
 await page.goto('?view=character-library');await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');
 await expect(page.getByRole('heading',{name:'每一位，都有自己的姿态。'})).toBeVisible();
 await expect(page.locator('[data-cl-model]')).toHaveCount(28);await expect(page.locator('[data-cl-action]')).toHaveCount(19);await expect(page.locator('[data-cl-direction]')).toHaveCount(8);
 expect(requested.filter(url=>/\/action-\d+\.webp/.test(url))).toHaveLength(1);
 expect(requested.some(url=>/character-parts|female-parts|characters\/v3\//.test(url))).toBe(false);
 await page.getByLabel('搜索人物').fill('卡兹');await expect(page.locator('[data-cl-model]')).toHaveCount(1);
 await page.getByLabel('搜索人物').fill('不存在的旅人');await expect(page.locator('.cl-empty')).toHaveText('没有找到这位人物。试试其他名字。');
 await page.getByLabel('搜索人物').fill('');await page.getByRole('button',{name:'行走',exact:true}).click();
 await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');
 for(const direction of ['0','1','2','3','4','5','6','7']){
  await page.locator(`[data-cl-direction="${direction}"]`).click();
  await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');await expect(page.locator(canvas)).toHaveAttribute('data-direction',direction);
 }
 const opaque=await page.locator(canvas).evaluate(element=>{const c=element as HTMLCanvasElement,data=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i])count++;return count;});
 expect(opaque).toBeGreaterThan(2000);
 await page.locator('[data-cl-pause]').click();const frozen=await page.locator(canvas).getAttribute('data-time');await page.waitForTimeout(220);expect(await page.locator(canvas).getAttribute('data-time')).toBe(frozen);
 await expect(page.locator('[data-cl-pause]')).toHaveText('▶ 播放');await page.locator('[data-cl-pause]').click();await expect.poll(()=>page.locator(canvas).getAttribute('data-time')).not.toBe(frozen);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`test-results/character-library-${info.project.name}.png`,fullPage:true});expect(errors).toEqual([]);
});

test('快速换人物时，较早的加载结果不能覆盖最后选择',async({page})=>{
 let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/role-1216/manifest.json',async route=>{await held;await route.continue();});
 await page.goto('?view=character-library');await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');
 await page.getByRole('button',{name:'预览阿咪',exact:true}).click();await expect(page.locator(canvas)).toHaveAttribute('data-model','role-1216');
 await page.getByRole('button',{name:'预览艾露',exact:true}).click();await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');
 release();await page.waitForTimeout(350);await expect(page.locator(canvas)).toHaveAttribute('data-model','role-1312');await expect(page.locator('[data-cl-name]')).toHaveText('艾露');
 await expect(page.getByRole('button',{name:'预览艾露',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('图集读取失败能重试，且不会显示上一个人物残帧',async({page})=>{
 let fail=true;await page.route('**/role-1024/action-0.webp',async route=>{if(fail){fail=false;await route.fulfill({status:503,body:'temporary failure'});}else await route.continue();});
 await page.goto('?view=character-library');await expect(page.locator(canvas)).toHaveAttribute('data-ready','error');
 await expect(page.locator('[data-cl-use]')).toBeDisabled();await expect(page.locator('[data-cl-status]')).toContainText('加载失败');
 await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');await expect(page.locator('[data-cl-use]')).toBeEnabled();
});

for(const route of ['character-generator','character-motion'])test(`旧入口 ${route} 已切换人物素材馆`,async({page})=>{
 await page.goto(`?view=${route}`);await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');await expect(page).toHaveTitle('人物素材馆 · hi-story');
 await expect(page.getByLabel('生成种子',{exact:true})).toHaveCount(0);await expect(page.getByLabel('身体类型',{exact:true})).toHaveCount(0);await expect(page.locator('[data-cl-model]')).toHaveCount(28);
});

test('选择旅人仅改变外观，返回后冒险位置和人物资料保留',async({page})=>{
 await page.goto('?view=demo&seed=character-library-save');await page.locator('.world-canvas[data-art="ready"]').waitFor();const before=await state(page);
 const saved=await page.evaluate(()=>localStorage.getItem('hi-story:adventure:world-v2'));
 await page.goto('?view=character-library');await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');
 await page.getByRole('button',{name:'预览阿咪',exact:true}).click();await expect(page.locator(canvas)).toHaveAttribute('data-ready','ready');
 expect(await page.evaluate(()=>localStorage.getItem('hi-story:adventure:world-v2'))).toBe(saved);
 await page.getByRole('button',{name:'作为旅人，返回旅程',exact:false}).click();await page.locator('.world-canvas[data-art="ready"]').waitFor();
 expect(await page.evaluate(key=>localStorage.getItem(key),preference)).toBe('role-1216');
 const after=await state(page);expect(after.seed).toBe(before.seed);expect(after.runtime).toEqual(before.runtime);expect(after.story).toEqual(before.story);
});
