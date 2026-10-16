import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const out=resolve('docs/examples/character-fit-v3'), temp=await mkdtemp(resolve(tmpdir(),'character-fit-v3-'));
const records=JSON.parse(await readFile('docs/examples/assembled/characters.json','utf8')).characters;
const s=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});let b;
try{
 await mkdir(out,{recursive:true});await s.listen();b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',headless:true,args:['--no-sandbox']});const page=await b.newPage();await page.goto(`http://127.0.0.1:${s.httpServer.address().port}/?view=story-generator`);
 await page.evaluate(async records=>{window.records=records;window.art=await import('/src/presentation/character-motion-art.ts');await window.art.loadDirectionalMaterials();window.still=await import('/src/presentation/character-art.ts');await window.still.loadCharacterArt();},records);
 const data=await page.evaluate(()=>{
 const actions=[['stand','站立'],['walk','行走'],['wave','抬手'],['talk','对话'],['sit','坐下'],['attack','攻击']];
 const c=document.createElement('canvas');c.width=1500;c.height=1460;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#ece6dc';ctx.fillRect(0,0,c.width,c.height);
 ctx.fillStyle='#243b37';ctx.font='bold 24px "Noto Sans CJK SC",sans-serif';ctx.fillText('原素材装配 · 动作接缝检查',24,36);
 actions.forEach(([action,label],r)=>window.records.forEach((actor,i)=>{const x=i*300,y=50+r*234;ctx.fillStyle='#faf7ef';ctx.fillRect(x+4,y,292,228);const f=window.art.renderCharacterMotionFrame(actor.appearance,actor.gender,{action,progress:action==='attack'?.42:.3,weapon:'dagger',effects:false});ctx.drawImage(f,0,20,384,330,x+20,y-7,260,223);f.width=0;ctx.fillStyle='#243b37';ctx.textAlign='center';ctx.font='14px "Noto Sans CJK SC",sans-serif';ctx.fillText(`${actor.name} · ${label}`,x+150,y+216);ctx.textAlign='left';}));
 const heads=document.createElement('canvas');heads.width=1500;heads.height=370;const h=heads.getContext('2d');h.imageSmoothingEnabled=false;h.fillStyle='#ece6dc';h.fillRect(0,0,1500,370);window.records.forEach((a,i)=>{const f=window.art.renderCharacterMotionFrame(a.appearance,a.gender,{effects:false});h.fillStyle='#faf7ef';h.fillRect(i*300+4,4,292,330);h.drawImage(f,144,63,96,114,i*300+12,10,276,310);h.fillStyle='#243b37';h.textAlign='center';h.font='16px "Noto Sans CJK SC",sans-serif';h.fillText(a.name,i*300+150,358);});
 return {contact:c.toDataURL(),heads:heads.toDataURL()};});
 const comparison=await page.evaluate(async()=>{const before=new Image(),after=new Image();before.src='/docs/examples/character-fit-v3/before.png';after.src='/docs/examples/character-fit-v3/gallery.png';await Promise.all([before.decode(),after.decode()]);const c=document.createElement('canvas');c.width=1506;c.height=1100;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#ece6dc';ctx.fillRect(0,0,c.width,c.height);for(const [i,im]of [before,after].entries()){const y=i*550;ctx.fillStyle='#243b37';ctx.font='bold 24px "Noto Sans CJK SC",sans-serif';ctx.fillText(i?'本轮修正后 · 同样的人物数据与原素材':'修正前 · 头顶、肩领与饰品位置',24,y+35);ctx.drawImage(im,0,155,1506,475,0,y+55,1506,475);}return c.toDataURL();});
 await writeFile(resolve(out,'comparison.png'),Buffer.from(comparison.split(',')[1],'base64'));
 for(const [name,value] of Object.entries(data))await writeFile(resolve(out,name+'.png'),Buffer.from(value.split(',')[1],'base64'));
 for(const action of ['walk','wave','attack'])for(let i=0;i<(action==='walk'?8:10);i++){
 const data=await page.evaluate(({action,i})=>{const c=document.createElement('canvas');c.width=1500;c.height=410;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#f5f0e6';ctx.fillRect(0,0,1500,410);window.records.forEach((a,index)=>{const f=window.art.renderCharacterMotionFrame(a.appearance,a.gender,{action,progress:action==='walk'?i/8:i/9,weapon:'dagger',effects:true});ctx.drawImage(f,index*300-42,0,384,384);ctx.fillStyle='#243b37';ctx.font='18px "Noto Sans CJK SC",sans-serif';ctx.textAlign='center';ctx.fillText(a.name,index*300+150,399);f.width=0;});return c.toDataURL();},{action,i});await writeFile(resolve(temp,action+'-'+i+'.png'),Buffer.from(data.split(',')[1],'base64'));
 }
 execFileSync('python',['-c',`from PIL import Image\nfrom pathlib import Path\nsrc=Path(${JSON.stringify(temp)});out=Path(${JSON.stringify(out)})\nfor action in ['walk','wave','attack']:\n frames=[Image.open(src/f'{action}-{i}.png').convert('RGB') for i in range(8 if action=='walk' else 10)]\n frames[0].save(out/f'{action}.gif',save_all=True,append_images=frames[1:],duration=100 if action in ['walk','wave'] else 70,loop=0,disposal=2)\n`]);
 const files=['before.png','gallery.png','comparison.png','heads.png','contact.png','walk.gif','wave.gif','attack.gif','characters.json',...records.map((_,i)=>'character-'+String(i+1).padStart(2,'0')+'.png')];
 const assets=[];for(const file of files){const bytes=await readFile(resolve(out,file));assets.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const sources=[];for(const file of ['character-parts-v1.png','female-parts-v1.png']){const bytes=await readFile(resolve('public/assets/characters',file));sources.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(resolve(out,'manifest.json'),JSON.stringify({version:'character-original-examples/3',artVersion:'character-art/3',motionArtVersion:'character-motion-art/3',materialFamily:'original-atlas',direction:'S',actorIds:records.map(a=>a.actorId),sourceArtwork:'existing-atlases',sources,animations:[{file:'walk.gif',frames:8,durationMs:800},{file:'wave.gif',frames:10,durationMs:1000},{file:'attack.gif',frames:10,durationMs:700}],assets},null,2)+'\n');
 console.log(JSON.stringify({out,frames:28,characters:records.length}));
}finally{await b?.close();await s.close();await rm(temp,{recursive:true,force:true});}
