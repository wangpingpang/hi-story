import {test as base,expect,chromium} from '@playwright/test';
export {expect};
export type {Page} from '@playwright/test';
// Some constrained Linux browsers only support one context per process.
// Keep normal CI/browser reuse unchanged unless explicitly selected.
export const test=process.env.CHROMIUM_SINGLE_PROCESS==='1'?base.extend({page:async({baseURL,viewport,isMobile,hasTouch,reducedMotion,locale,colorScheme,deviceScaleFactor,launchOptions},use)=>{
 const browser=await chromium.launch(launchOptions);
 try{const context=await browser.newContext({baseURL,viewport,isMobile,hasTouch,reducedMotion,locale,colorScheme,deviceScaleFactor});await use(await context.newPage());}finally{await browser.close();}
}}):base;
