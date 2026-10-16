import {mkdir,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const root=fileURLToPath(new URL('..',import.meta.url));
const opts={out:'artifacts/character-fit-audit',renderer:'current',compare:'no',visualOnly:'no'};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].slice(2);if(!Object.hasOwn(opts,key)||!process.argv[i+1])throw Error('参数：--out、--renderer current|baseline、--compare yes|no、--visualOnly yes|no');opts[key]=process.argv[i+1];}
if(!['current','baseline'].includes(opts.renderer)||!['yes','no'].includes(opts.compare)||!['yes','no'].includes(opts.visualOnly))throw Error('渲染版本或对比参数无效');
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});let browser;
const baselineFile=resolve(root,'src/presentation/character-motion-art-baseline.ts');
const baselineStatic=resolve(root,'src/presentation/character-art-fit-baseline.ts');
const needsBaseline=opts.renderer==='baseline'||opts.compare==='yes';
if(needsBaseline){await writeFile(baselineFile,execFileSync('git',['show','8d0a007d8dd02b8a917acca2d5d621338580e629:src/presentation/character-motion-art.ts'],{cwd:root}));const source=execFileSync('git',['show','8d0a007d8dd02b8a917acca2d5d621338580e629:src/presentation/character-art.ts'],{cwd:root}).toString();await writeFile(baselineStatic,source.replace("'./character-motion-art'","'./character-motion-art-baseline'"));}
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?view=story-generator`);
 const api=await server.ssrLoadModule('/src/modules/characters/index.ts'),catalog=api.appearanceCatalogFor('appearance/3');
 const base=api.generateAppearance('fit-audit','appearance/3');for(const [slot,style] of Object.entries({hair:'crop',face:'oval',body:'balanced',top:'shirt',pants:'straight',shoes:'boots',accessory:'none'}))base.parts[slot].styleId=style;
 for(const [slot,color] of Object.entries({hair:'#614436',body:'#dfb18c',top:'#587b72',pants:'#324553',shoes:'#654432'}))base.parts[slot].color=color;
 const output=resolve(root,opts.out);await mkdir(output,{recursive:true});
 await page.evaluate(async({variant,compare})=>{window.__fitArt=await import(variant==='baseline'?'/src/presentation/character-motion-art-baseline.ts':'/src/presentation/character-motion-art.ts');await window.__fitArt.loadDirectionalMaterials();window.__staticArt=await import(variant==='baseline'?'/src/presentation/character-art-fit-baseline.ts':'/src/presentation/character-art.ts');await window.__staticArt.loadCharacterArt('appearance/3');if(compare==='yes')window.__fitBefore=await import('/src/presentation/character-motion-art-baseline.ts');},{variant:opts.renderer,compare:opts.compare});
 const cases=[];
 for(const gender of ['male','female'])for(const body of catalog.body.styles)for(const direction of api.DIRECTIONS)for(const action of Object.keys(api.ACTIONS)){
  const index=catalog.body.styles.findIndex(s=>s.id===body.id),parts={body:body.id,top:catalog.top.styles[(index*3+api.DIRECTIONS.indexOf(direction))%12].id,pants:catalog.pants.styles[(index+api.DIRECTIONS.indexOf(direction)*3)%12].id,shoes:catalog.shoes.styles[(index+api.DIRECTIONS.indexOf(direction))%8].id};
  const phases=action==='walk'?[0,.25,.5,.75]:[.4];for(const progress of phases)cases.push({suite:'motion',gender,parts,action,direction,progress,weapon:'greatsword',spell:'summon'});
 }
 for(const gender of ['male','female'])for(const body of catalog.body.styles)for(const direction of api.DIRECTIONS)for(const hair of catalog.hair.styles)cases.push({suite:'hair',gender,parts:{body:body.id,hair:hair.id},action:'stand',direction,progress:0});
 const metrics=[];
 for(let i=0;opts.visualOnly==='no'&&i<cases.length;i+=64){const batch=await page.evaluate(({cases,base})=>{
  function components(c){const ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height,seen=new Uint8Array(w*h),queue=new Int32Array(w*h),parts=[];let edge=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const start=y*w+x;if(!pixels[start*4+3])continue;if(x===0||y===0||x===w-1||y===h-1)edge++;if(seen[start])continue;let head=0,tail=1;queue[0]=start;seen[start]=1;let left=x,right=x,top=y,bottom=y;
    while(head<tail){const p=queue[head++],px=p%w,py=Math.floor(p/w);left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=px+dx,ny=py+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const q=ny*w+nx;if(!seen[q]&&pixels[q*4+3]){seen[q]=1;queue[tail++]=q;}}}
    if(tail>=20)parts.push({pixels:tail,bounds:[left,top,right,bottom]});
   }return {components:parts.sort((a,b)=>b.pixels-a.pixels),edge};
  }
  return cases.map(test=>{const model=structuredClone(base);for(const [slot,id] of Object.entries(test.parts))model.parts[slot].styleId=id;const frame=window.__fitArt.renderCharacterMotionFrame(model,test.gender,{...test,effects:false}),result=components(frame);frame.width=0;let staticEdge=0;if(test.suite==='hair'&&test.direction==='S'){const still=window.__staticArt.assembleCharacterCanvas(model,test.gender);staticEdge=components(still).edge;still.width=0;}return {...test,...result,staticEdge};});
 },{cases:cases.slice(i,i+64),base});metrics.push(...batch);}
 const pages=[];
 function modelFor(parts){const m=structuredClone(base);for(const [slot,id] of Object.entries(parts))m.parts[slot].styleId=id;return m;}
 for(const gender of ['male','female'])pages.push({name:`body-${gender}.png`,columns:8,tiles:['S','SE','E','N'].flatMap(direction=>catalog.body.styles.map(s=>({model:modelFor({body:s.id}),gender,direction,action:'stand',progress:0,label:`${s.label} / ${direction}`})))});
 pages.push({name:'outfits.png',columns:6,tiles:catalog.top.styles.flatMap((s,i)=>['S','E','wave','sit'].map(view=>({model:modelFor({top:s.id,pants:catalog.pants.styles[i].id,body:catalog.body.styles[i%8].id}),gender:i%2?'female':'male',action:view==='S'||view==='E'?'stand':view,direction:view==='E'?'E':'S',progress:.4,label:`${s.label} / ${view}`})))});
 pages.push({name:'hair-face.png',columns:12,head:true,tiles:catalog.face.styles.flatMap(face=>catalog.hair.styles.map(hair=>({model:modelFor({hair:hair.id,face:face.id}),gender:'female',direction:'S',action:'stand',progress:0,label:`${hair.label} / ${face.label}`})))});
 pages.push({name:'hair-directions.png',columns:12,head:true,tiles:['S','SE','E','NE','N'].flatMap(direction=>catalog.hair.styles.map(hair=>({model:modelFor({hair:hair.id}),gender:'female',direction,action:'stand',progress:0,label:`${hair.label} / ${direction}`})))});
 pages.push({name:'accessories.png',columns:6,tiles:catalog.accessory.styles.flatMap(s=>['S','E','N'].map(direction=>({model:modelFor({accessory:s.id}),gender:'female',direction,action:'stand',progress:0,label:`${s.label} / ${direction}`})))});
 for(const direction of ['S','E','N'])pages.push({name:`pants-shoes-${direction}.png`,columns:8,lower:true,tiles:catalog.pants.styles.flatMap(pants=>catalog.shoes.styles.map((shoe,i)=>({model:modelFor({pants:pants.id,shoes:shoe.id,body:i%2?'slim':'heavy'}),gender:i%2?'female':'male',direction,action:'stand',progress:0,label:`${pants.label} / ${shoe.label}`})))});
 const ranked=metrics.filter(m=>m.components.length>1).sort((a,b)=>(b.components[1]?.pixels??0)-(a.components[1]?.pixels??0));
 pages.push({name:'joint-cases.png',columns:6,tiles:ranked.slice(0,24).map(m=>({...m,model:modelFor(m.parts),label:`${m.gender}/${m.parts.body}/${m.action}/${m.direction}`}))});
 if(opts.compare==='yes'){
  const examples=[{parts:{body:'compact',top:'robe',pants:'shorts'},gender:'male',action:'cast',direction:'NE',spell:'summon',label:'肩颈与手臂连接'},{parts:{hair:'bun'},gender:'female',action:'stand',direction:'S',head:true,label:'发髻与脸型贴合'},{parts:{accessory:'satchel'},gender:'female',action:'stand',direction:'S',label:'挎包缩放与背带'},{parts:{accessory:'glasses'},gender:'female',action:'stand',direction:'S',head:true,label:'眼镜对齐眼睛'}];
  pages.push({name:'comparison.png',columns:4,comparison:true,tiles:examples.flatMap(e=>['before','after'].map(phase=>({...e,model:modelFor(e.parts),phase,progress:.4,label:`${phase==='before'?'修改前':'修改后'} · ${e.label}`})))});
 }
 for(const spec of pages){const data=await page.evaluate(spec=>{const tileW=spec.comparison?256:spec.head?160:192,tileH=spec.comparison?292:spec.head||spec.lower?200:218,c=document.createElement('canvas');c.width=tileW*spec.columns;c.height=tileH*Math.ceil(spec.tiles.length/spec.columns)+40;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#eee9df';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#315346';ctx.font='18px "Noto Sans CJK SC",sans-serif';ctx.fillText(spec.comparison?'人物组件贴合 · 修复前后对比':'人物装配检查 · '+spec.name,16,27);
  spec.tiles.forEach((t,i)=>{const x=i%spec.columns*tileW,y=40+Math.floor(i/spec.columns)*tileH;ctx.fillStyle='#faf7ef';ctx.fillRect(x+3,y+3,tileW-6,tileH-6);const renderer=t.phase==='before'?window.__fitBefore:window.__fitArt,frame=renderer.renderCharacterMotionFrame(t.model,t.gender,{...t,effects:false});if(spec.comparison&&t.head)ctx.drawImage(frame,135,45,114,154,x+20,y+5,216,255);else if(spec.head)ctx.drawImage(frame,135,45,114,154,x+10,y+5,140,180);else if(spec.lower)ctx.drawImage(frame,120,210,144,134,x+4,y+5,184,171);else ctx.drawImage(frame,x,y,tileW,tileW);frame.width=0;ctx.fillStyle=t.phase==='before'?'#986754':'#315346';ctx.textAlign='center';ctx.font=(spec.comparison?'14':'11')+'px "Noto Sans CJK SC",sans-serif';ctx.fillText(t.label,x+tileW/2,y+tileH-10,tileW-8);ctx.textAlign='left';});return c.toDataURL('image/png');},spec);await writeFile(resolve(output,spec.name),Buffer.from(data.split(',')[1],'base64'));}
 const summary={mode:opts.visualOnly==='yes'?'visual-only':'full',renderer:opts.renderer,frames:metrics.length,motionFrames:metrics.filter(m=>m.suite==='motion').length,hairFrames:metrics.filter(m=>m.suite==='hair').length,majorDisconnectedFrames:ranked.length,edgeContactFrames:metrics.filter(m=>m.edge>0).length,staticEdgeContactFrames:metrics.filter(m=>m.staticEdge>0).length,largestDetachedPixels:ranked[0]?.components[1]?.pixels??0,coverage:{genders:2,bodies:8,directions:8,actions:Object.keys(api.ACTIONS).length,hairStyles:12,staticFrames:192,walkPhases:4},visualSheets:pages.map(p=>p.name)};
 await writeFile(resolve(output,'results.json'),JSON.stringify({summary,cases:metrics},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
 if(opts.visualOnly==='no'&&opts.renderer==='current'&&(summary.majorDisconnectedFrames||summary.edgeContactFrames||summary.staticEdgeContactFrames))throw Error('人物贴合检查未通过，查看 results.json 中的具体帧');
}finally{if(needsBaseline){await rm(baselineFile,{force:true});await rm(baselineStatic,{force:true});}await browser?.close();await server.close();}
