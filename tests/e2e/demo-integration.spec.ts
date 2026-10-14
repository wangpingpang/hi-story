import { test, expect } from '@playwright/test';
import { openDemo, walk, encounter } from './demo-route';

const failures=new WeakMap<object,string[]>();
test.beforeEach(({page})=>{
  const errors:string[]=[];failures.set(page,errors);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>errors.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
});
test.afterEach(({page})=>expect(failures.get(page)).toEqual([]));

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
  const fixture=await openDemo(page,'battle-browser');await encounter(page,fixture);
  await expect(page.getByRole('button',{name:'向下',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'战斗格 2,2',exact:true}).click();
  await expect(page.getByRole('heading',{name:'战斗 · 第2回合',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'脱离战斗',exact:true}).click();
  await expect(page.locator('.demo-battle')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'向下',exact:true})).toBeEnabled();
});

test('实际探索、购买、抵达与完成目标的整局闭环',async({page},info)=>{
  const fixture=await openDemo(page,'browser-complete');
  await page.getByRole('button',{name:'研究已经存在的笔记',exact:false}).click();
  const market=fixture.snapshot.runtime.map.anchors.find(a=>a.id==='market')!.position;
  await walk(page,fixture,market);
  await page.getByRole('button',{name:/支付5金币取得/}).click();
  await expect(page.getByText('物资 已取得',{exact:false})).toBeVisible();
  await walk(page,fixture,fixture.snapshot.runtime.map.anchors.find(a=>a.id==='goal')!.position);
  await page.getByRole('button',{name:/目标地点完成/}).click();
  await expect(page.getByRole('status')).toContainText('你完成了目标');
  await expect(page.getByRole('button',{name:'向下',exact:true})).toBeDisabled();
  await page.screenshot({path:`docs/evidence/${info.project.name}-demo-complete.png`,fullPage:true});
});

test('真实骰子战斗胜利更新NPC与后续选项',async({page},info)=>{
  const fixture=await openDemo(page,'victory');await encounter(page,fixture);
  const npc=fixture.snapshot.story.npcs[0];
  for(const coordinate of ['2,2','3,2'])await page.getByRole('button',{name:`战斗格 ${coordinate}`,exact:true}).click();
  for(let i=0;i<30&&await page.locator('.demo-battle').count();i++)await page.getByRole('button',{name:'攻击',exact:true}).click();
  await expect(page.locator('.demo-battle')).toHaveCount(0);
  await expect(page.getByText(`${npc.name}死亡，互动和委托重新检查。`,{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:`询问${npc.name}的经历与线索`,exact:false})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'向下',exact:true})).toBeEnabled();
  await page.screenshot({path:`docs/evidence/${info.project.name}-demo-victory.png`,fullPage:true});
});

test('战败结束主线，重开恢复人物与初始迷雾',async({page})=>{
  const fixture=await openDemo(page,'defeat');
  const map=await page.locator('#demo-map').innerHTML();await encounter(page,fixture);
  for(let i=0;i<100&&await page.locator('.demo-battle').count();i++)await page.getByRole('button',{name:'防御',exact:true}).click();
  await expect(page.getByRole('button',{name:'向下',exact:true})).toBeDisabled();
  await expect(page.locator('.demo-tasks li').filter({hasText:fixture.snapshot.story.goal})).toContainText('失败');
  await page.getByRole('button',{name:'同种子重新开始',exact:true}).click();
  await expect(page.getByText('生命 20/20',{exact:false})).toBeVisible();
  expect(await page.locator('#demo-map').innerHTML()).toBe(map);
});

test('方向键移动和输入框编辑互不干扰',async({page})=>{
  await openDemo(page,'keyboard-demo');
  await page.locator('#demo-map').focus();await page.keyboard.press('ArrowDown');
  await expect(page.getByText('坐标 3, 4 ·',{exact:false})).toBeVisible();
  await page.getByLabel('旅程种子').focus();await page.keyboard.press('ArrowDown');
  await expect(page.getByText('坐标 3, 4 ·',{exact:false})).toBeVisible();
});
