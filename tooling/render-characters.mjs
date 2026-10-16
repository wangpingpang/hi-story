import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

async function main(){
  const root=fileURLToPath(new URL('..',import.meta.url));
  const args=process.argv.slice(2),options={seed:'hi-story-20261014',count:'5',out:'docs/examples/assembled',input:undefined,url:undefined};
  for(let i=0;i<args.length;i+=2){const key=args[i].slice(2);if(!args[i].startsWith('--')||!Object.hasOwn(options,key)||!args[i+1])throw Error('参数：--seed、--count、--input、--out、--url');options[key]=args[i+1];}
  const count=Number(options.count);if(!Number.isInteger(count)||count<1||count>100)throw Error('次数须为 1–100 的整数');
  const server=await createServer({root,configFile:false,logLevel:'error',server:{middlewareMode:!!options.url,host:'127.0.0.1',port:0,hmr:false,watch:null},appType:'spa'});
  let browser;
  try{
    const api=await server.ssrLoadModule('/src/modules/characters/index.ts');
    let models;
    if(options.input){const data=JSON.parse(await readFile(resolve(root,options.input),'utf8'));models=Array.isArray(data)?data:Array.isArray(data?.characters)?data.characters:[data];if(!models.length||models.length>100)throw Error('输入须为 1–100 个人物或参数对象');models=models.map(record=>record?.version?record:api.generateCharacterWithParams(record));}
    else models=Array.from({length:count},(_,i)=>api.generateCharacter(`${options.seed}:${i+1}`));
    models.forEach(api.validateGeneratedCharacter);
    if(!options.url)await server.listen();
    const address=server.httpServer?.address();
    const url=options.url??`http://127.0.0.1:${address.port}`;
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
    const page=await browser.newPage();page.on('pageerror',e=>process.stderr.write('Browser: '+e.message+'\n'));page.on('requestfailed',r=>process.stderr.write('Request: '+r.url()+' '+r.failure()?.errorText+'\n'));await page.goto(url+'/?view=story-generator');
    const output=await page.evaluate(async records=>{
      const art=await import('/src/presentation/character-art.ts');await art.loadCharacterArt(records.some(r=>r.appearance.version==='appearance/3')?'appearance/3':'appearance/1');
      const images=records.map(record=>art.assembleCharacterCanvas(record.appearance,record.gender,4).toDataURL('image/png'));
      const c=document.createElement('canvas');c.width=Math.max(600,records.length*294+36);c.height=780;
      const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#ece6dc';ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle='#1f373a';ctx.font='bold 26px "Noto Sans CJK SC", sans-serif';ctx.fillText('HI-STORY · 人物装配结果',32,48);
      ctx.font='15px "Noto Sans CJK SC", sans-serif';ctx.fillText('七部件 PNG 素材装配 · 同一人物数据可重复输出',32,78);
      records.forEach((record,index)=>{
        const x=24+index*294;ctx.fillStyle='#f8f4ee';ctx.fillRect(x,110,278,636);
        ctx.drawImage(art.assembleCharacterCanvas(record.appearance,record.gender),x+23,150,232,464);
        ctx.textAlign='center';ctx.fillStyle='#21383a';ctx.font='bold 21px "Noto Sans CJK SC", sans-serif';ctx.fillText(record.name,x+139,657);
        ctx.font='15px "Noto Sans CJK SC", sans-serif';ctx.fillText(`${record.gender==='female'?'女':'男'} · ${record.age} 岁 · ${record.identity.occupation}`,x+139,687);
        ctx.fillStyle='#69736a';ctx.font='14px "Noto Sans CJK SC", sans-serif';ctx.fillText(record.personality.traits.join(' · '),x+139,717);ctx.textAlign='left';
      });
      return {artVersion:records.every(r=>r.appearance.version===records[0].appearance.version)?art.artVersionFor(records[0].appearance):'mixed',versions:records.map(record=>art.artVersionFor(record.appearance)),images,gallery:c.toDataURL('image/png')};
    },models);
    const directory=resolve(root,options.out);await mkdir(directory,{recursive:true});
    const characters=[];
    for(let i=0;i<models.length;i++){
      const filename=`character-${String(i+1).padStart(2,'0')}.png`;
      await writeFile(resolve(directory,filename),Buffer.from(output.images[i].split(',')[1],'base64'));
      characters.push({...models[i],render:{file:filename,artVersion:output.versions[i],width:576,height:1152}});
    }
    await writeFile(resolve(directory,'gallery.png'),Buffer.from(output.gallery.split(',')[1],'base64'));
    await writeFile(resolve(directory,'characters.json'),JSON.stringify({artVersion:output.artVersion,callCount:characters.length,characters},null,2)+'\n');
    process.stdout.write(JSON.stringify({count:characters.length,artVersion:output.artVersion,directory,files:['gallery.png','characters.json',...characters.map(c=>c.render.file)]},null,2)+'\n');
  }finally{await browser?.close();await server.close();}
}
main().catch(error=>{process.stderr.write((error instanceof Error?error.stack:String(error))+'\n');process.exitCode=1;});
