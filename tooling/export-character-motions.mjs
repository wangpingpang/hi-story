import { mkdir,writeFile,readFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const opts={out:'docs/examples/motion-v1',seed:'hi-story:motion:001',quick:'no',gifs:'yes'};
for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i].slice(2),v=process.argv[i+1];if(!Object.hasOwn(opts,k)||!v)throw Error('参数：--out、--seed、--quick yes|no、--gifs yes|no');opts[k]=v;}
for(const key of ['quick','gifs'])if(!['yes','no'].includes(opts[key]))throw Error(`${key} 须为 yes 或 no`);
const directory=resolve(root,opts.out),partsDir=resolve(root,'public/assets/characters/v3/walk');
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser;const temporary=await mkdtemp(resolve(tmpdir(),'hi-story-motions-'));
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/?view=story-generator`);
 const api=await server.ssrLoadModule('/src/modules/characters/index.ts');
 const character=api.generateCharacterWithParams({seed:opts.seed,gender:'female',appearanceVersion:'appearance/3',appearanceParts:{hair:{styleId:'crop',color:'#614436'},body:{styleId:'balanced',color:'#dfb18c'},face:{styleId:'oval'},top:{styleId:'shirt',color:'#587b72'},pants:{styleId:'straight'},shoes:{styleId:'riding'},accessory:{styleId:'none'}}});
 await page.evaluate(async record=>{const art=await import('/src/presentation/character-motion-art.ts');await art.loadDirectionalMaterials();window.__motionArt=art;window.__motionCharacter=record;},character);
 const coverage=await page.evaluate(async catalog=>{
  const materials=await import('/src/presentation/directional-materials.ts');let count=0;
  for(const gender of ['male','female'])for(const [slot,definition] of Object.entries(catalog))for(const style of definition.styles)for(const direction of ['S','SE','E','NE','N','NW','W','SW']){
   if(slot==='accessory'&&style.id==='none')continue;
   const texture=materials.materialTexture(slot,style.id,definition.colors[0],gender,direction),data=texture.getContext('2d').getImageData(0,0,texture.width,texture.height).data;
   if(!data.some((value,index)=>index%4===3&&value>0))throw Error(`Empty material ${gender}/${slot}/${style.id}/${direction}`);count++;
  }return count;
 },api.appearanceCatalogFor('appearance/3'));
 const artVersion=await page.evaluate(()=>window.__motionArt.MOTION_ART_VERSION);
 const assets=[];await mkdir(directory,{recursive:true});await mkdir(resolve(directory,'clips'),{recursive:true});
 async function writeImage(name,kind,configuration,path=resolve(directory,name)){
  const data=await page.evaluate(({kind,configuration})=>{
   const art=window.__motionArt,record=window.__motionCharacter;const c=document.createElement('canvas');
   const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
   const render=(o,model=record.appearance)=>art.renderCharacterMotionFrame(model,record.gender,o);
   if(kind==='walk'||kind==='part'){
    c.width=c.height=1536;ctx.imageSmoothingEnabled=false;const dirs=['S','SE','E','NE','N','NW','W','SW'];
    const model=structuredClone(record.appearance);if(kind==='part')model.parts[configuration.slot].styleId=configuration.style;
    for(let row=0;row<8;row++)for(let f=0;f<8;f++)ctx.drawImage(render({action:'walk',direction:dirs[row],progress:f/8,...(kind==='part'?{layers:[configuration.slot],effects:false}:{})},model),f*192,row*192,192,192);
   }else if(kind==='strip'){const strip=art.renderCharacterMotionStrip(record.appearance,record.gender,configuration);c.width=1536;c.height=192;ctx.imageSmoothingEnabled=false;ctx.drawImage(strip,0,0,1536,192);}
   else if(kind==='expressions'){
    const entries=Object.entries(configuration);c.width=1200;c.height=400;ctx.fillStyle='#e9e5da';ctx.fillRect(0,0,c.width,c.height);ctx.textAlign='center';
    entries.forEach(([expression,label],i)=>{const x=i%6*200,y=Math.floor(i/6)*200;ctx.fillStyle='#f7f3e9';ctx.fillRect(x+6,y+6,188,188);const frame=render({expression,action:'stand',progress:0});ctx.drawImage(frame,142,63,100,112,x+25,y+12,150,168);ctx.fillStyle='#304c42';ctx.font='15px "Noto Sans CJK SC",sans-serif';ctx.fillText(label,x+100,y+188);});
   }else if(kind==='gallery'){
    const {clips,progress,title,columns}=configuration,rows=Math.ceil(clips.length/columns);c.width=columns*192;c.height=rows*221+58;ctx.fillStyle='#e8e4da';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#244a3e';ctx.font='bold 20px "Noto Sans CJK SC",sans-serif';ctx.fillText(title,18,35);
    clips.forEach((clip,i)=>{const x=i%columns*192,y=58+Math.floor(i/columns)*221;ctx.fillStyle='#f8f5ed';ctx.fillRect(x+4,y+4,184,213);ctx.drawImage(render({...clip,progress}),x,y+1,192,192);ctx.fillStyle='#314d40';ctx.font='13px "Noto Sans CJK SC",sans-serif';ctx.textAlign='center';ctx.fillText(clip.label,x+96,y+207);ctx.textAlign='left';});
   }
   return c.toDataURL('image/png');
  },{kind,configuration});
  const bytes=Buffer.from(data.split(',')[1],'base64');await writeFile(path,bytes);return {file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 const clips=[];
 for(const [action,meta] of Object.entries(api.ACTIONS))if(!['walk','attack','heavy-attack','cast'].includes(action))clips.push({action,label:meta.label});
 for(const action of ['attack','heavy-attack'])for(const weapon of api.WEAPONS)clips.push({action,weapon,label:`${action==='attack'?'普攻':'重击'} / ${weapon}`});
 for(const spell of api.SPELLS)clips.push({action:'cast',spell,label:`施法 / ${spell}`});
 assets.push(await writeImage('walk-8-directions.png','walk',{}));
 if(opts.quick!=='yes')for(const clip of clips){const name=`clips/${clip.action}${clip.weapon?'-'+clip.weapon:clip.spell?'-'+clip.spell:''}.png`;const config={...clip,direction:'SE',expression:['sleep','dead'].includes(clip.action)?'asleep':['fall','downed'].includes(clip.action)||clip.action.startsWith('hit-')?'pain':['stand','stand-relaxed','stand-alert','talk','wave','point','nod','shake-head','sit','lean','lie'].includes(clip.action)?'neutral':'focused'};assets.push({...await writeImage(name,'strip',config),clip:config});}
 const partAssets=[];
 if(opts.quick!=='yes'){
  await mkdir(partsDir,{recursive:true});for(const slot of ['top','pants','shoes'])for(const style of api.appearanceCatalogFor('appearance/3')[slot].styles){const name=`${slot}-${style.id}.png`;partAssets.push({...await writeImage(name,'part',{slot,style:style.id},resolve(partsDir,name)),slot,styleId:style.id,frames:64});}
  await writeFile(resolve(partsDir,'manifest.json'),JSON.stringify({version:'character-walk-materials/1',frame:{width:192,height:192,anchor:{x:96,y:164.5}},directions:api.DIRECTIONS,framesPerDirection:8,durationMs:800,materials:partAssets},null,2)+'\n');
 }
 assets.push(await writeImage('expressions.png','expressions',api.EXPRESSIONS));
 const gallerySets=[
  {name:'walk-preview',columns:4,title:'八向移动 · 服装与鞋同步',clips:api.DIRECTIONS.map(direction=>({action:'walk',direction,label:direction}))},
  {name:'combat-preview',columns:4,title:'战斗动作 · 武器与法术',clips:[{action:'attack',weapon:'unarmed',label:'空手'},{action:'attack',weapon:'sword',label:'单手剑'},{action:'heavy-attack',weapon:'axe',label:'斧重击'},{action:'attack',weapon:'spear',label:'长矛'},{action:'attack',weapon:'bow',label:'弓'},{action:'cast',spell:'fire',label:'火焰'},{action:'cast',spell:'frost',label:'冰霜'},{action:'cast',spell:'healing',label:'治疗'},{action:'hit-weapon',label:'武器受击'},{action:'hit-spell',label:'法术受击'},{action:'block',weapon:'sword',label:'格挡'},{action:'dodge',label:'闪避'}].map(clip=>({...clip,direction:'SE',expression:'focused'}))},
  {name:'rest-preview',columns:3,title:'日常与休息 · 站姿、手势、坐卧',clips:['stand-relaxed','talk','wave','nod','sit','lean','lie','sleep','downed'].map(action=>({action,label:api.ACTIONS[action].label,expression:action==='sleep'?'asleep':action==='downed'?'pain':'neutral'}))},
 ];
 for(const set of gallerySets){assets.push(await writeImage(set.name+'.png','gallery',{...set,progress:.4}));if(opts.gifs==='yes'){
  const files=[];for(let f=0;f<12;f++){const path=resolve(temporary,`${set.name}-${f}.png`);await writeImage('temp.png','gallery',{...set,progress:f/12},path);files.push(path);}
  const path=resolve(directory,set.name+'.gif');execFileSync('python3',[resolve(root,'tooling/encode-character-previews.py'),path,...files]);const bytes=await readFile(path);assets.push({file:set.name+'.gif',bytes:bytes.length,frames:12,sha256:createHash('sha256').update(bytes).digest('hex')});
 }}
 await page.goto(`http://127.0.0.1:${port}/?view=character-motion`);await page.getByRole('heading',{name:'每一步，都有神情。'}).waitFor();await page.getByRole('button',{name:'暂停',exact:true}).click();await page.screenshot({path:resolve(directory,'studio-desktop.png'),fullPage:true});await page.setViewportSize({width:375,height:812});await page.screenshot({path:resolve(directory,'studio-narrow.png'),fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 const manifest={version:'character-motion-examples/1',artVersion,frame:{width:192,height:192,anchor:{x:96,y:164.5}},character,verifiedMaterials:coverage,nonwalkVariants:clips.length,walkingPartFrames:partAssets.length*64,assets};await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({directory,nonwalkVariants:clips.length,walkingMaterials:partAssets.length,walkingFrames:partAssets.length*64,files:assets.length},null,2));
}finally{await browser?.close();await server.close();await rm(temporary,{recursive:true,force:true});}
