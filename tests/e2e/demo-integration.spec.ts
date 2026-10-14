import { test, expect } from '@playwright/test';

test('探索入口、移动、阅读、重开和窄屏布局',async({page})=>{
  await page.goto('/?view=demo&seed=browser-demo');
  await expect(page.getByRole('heading',{name:'世界地图',exact:true})).toBeVisible();
  await expect(page.getByText('坐标 3, 3 ·', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:'研究已经存在的笔记',exact:false}).click();
  await expect(page.getByText('线索 已取得 ·', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:'向下',exact:true}).click();
  await expect(page.getByText('坐标 3, 4 ·', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:'同种子重新开始',exact:true}).click();
  await expect(page.getByText('坐标 3, 3 ·', {exact:false})).toBeVisible();
  await expect(page.getByText('线索 未取得 ·', {exact:false})).toBeVisible();
  await page.locator('#demo-seed').fill('browser-second');
  await page.getByRole('button',{name:'生成新旅程',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('新旅程已生成。');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('NPC交互、真实战斗和逃离',async({page})=>{
  await page.goto('/?view=demo&seed=battle-browser');
  await expect(page.getByRole('heading',{name:'世界地图',exact:true})).toBeVisible();
  for(const direction of ['向右','向下','向下','向下'])await page.getByRole('button',{name:direction,exact:true}).click();
  await expect(page.getByText('坐标 4, 6 ·', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:/攻击.*交由战斗结算/}).first().click();
  await expect(page.getByRole('heading',{name:'战斗 · 第1回合',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'向下',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'战斗格 2,2',exact:true}).click();
  await expect(page.getByRole('heading',{name:'战斗 · 第2回合',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'脱离战斗',exact:true}).click();
  await expect(page.locator('.demo-battle')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'向下',exact:true})).toBeEnabled();
});
