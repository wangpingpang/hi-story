import { test,expect } from '@playwright/test';
test('PNG parts, female rig, new garments and transparent export',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?view=character-generator');
  const image=page.locator('.portrait-stage svg image');await expect(image).toHaveAttribute('href',/^data:image\/png;base64,/);
  const male=await image.getAttribute('href');await page.getByLabel('身体类型').selectOption('female');const female=await image.getAttribute('href');expect(female).not.toBe(male);
  await page.locator('#style-top').selectOption('wrap');await page.locator('#style-pants').selectOption('long-skirt');await expect(page.getByRole('img',{name:/交叠式上衣.*长裙/})).toBeVisible();
  const awaiting=page.waitForEvent('download');await page.getByRole('button',{name:'导出人物 PNG ↓'}).click();const download=await awaiting;
  expect(download.suggestedFilename()).toBe('hi-story-character.png');const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(chunk);const data=Buffer.concat(chunks);
  expect([...data.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(data.readUInt32BE(16)).toBe(576);expect(data.readUInt32BE(20)).toBe(1152);
  const alpha=await page.evaluate(async href=>{const im=new Image();im.src=href;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let opaque=0,transparent=0,partial=0;for(let i=3;i<d.length;i+=4){if(d[i]===0)transparent++;else if(d[i]===255)opaque++;else partial++;}return {opaque,transparent,partial};},await image.getAttribute('href') as string);
  expect(alpha.opaque).toBeGreaterThan(5000);expect(alpha.transparent).toBeGreaterThan(15000);expect(alpha.partial).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
