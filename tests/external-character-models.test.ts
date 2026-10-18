import {afterEach,expect,it,vi} from 'vitest';
import {CHARACTER_MODEL_PREFERENCE,DEFAULT_CHARACTER_MODEL,characterAssetUrl,characterPreviewScale,loadCharacterModel,mapGameAction,readSelectedModel,resolveClipFrame,selectModel,stableNpcModel,normalizedSpriteGeometry,type ModelManifest,type SpriteClip} from '../src/presentation/external-character-models';
import {readdirSync,readFileSync} from 'node:fs';
const clip:SpriteClip={actionId:1,directionId:5,atlasId:'walk',atlasUrl:'assets/characters/molibaike/role-1024/action-1.webp',durationMs:600,loop:true,sourceUrl:'https://www.molibaike.com/example.gif',frames:[{rect:[0,0,40,80],pivot:[20,80],durationMs:100},{rect:[40,0,40,80],pivot:[20,80],durationMs:300},{rect:[80,0,40,80],pivot:[20,80],durationMs:200}]};
const manifest:ModelManifest={version:'molibaike-character/1',characterId:'role-1024',name:'卡兹',source:'https://www.molibaike.com/Role',licenseNotice:'原站版权声明',standHeight:80,pivotPolicy:'source-canvas-bottom-center',atlases:[{id:'walk',url:clip.atlasUrl,width:120,height:80,bytes:100,sha256:'example'}],clips:{'1:5':clip,'0:5':{...clip,actionId:0}},availableClips:2,requestedClips:152};
afterEach(()=>vi.unstubAllGlobals());
it('超高攻击使用完整源画布，同人物所有动作保持站姿比例和脚底原点',()=>{
 const tall={rect:[0,0,180,150] as [number,number,number,number],pivot:[90,150] as [number,number],durationMs:100},geometry=normalizedSpriteGeometry(tall,80),standing=normalizedSpriteGeometry(clip.frames[0],80);
 expect(geometry.height).toBeGreaterThan(384);expect(geometry.scale).toBe(standing.scale);expect(geometry.target[1]+geometry.target[3]).toBeLessThan(geometry.height);expect(geometry.target[0]+geometry.target[2]).toBeLessThan(geometry.width);
 expect(-geometry.pivot[1]+geometry.target[1]+tall.pivot[1]*geometry.scale).toBe(0);
});
it('已导入名册的每一帧归一后都容纳完整画布，方向脚底不漂移',()=>{
 const base='public/assets/characters/molibaike',roles=readdirSync(base).filter(name=>/^role-\d+$/.test(name));let checked=0;
 for(const role of roles){let model:ModelManifest;try{model=JSON.parse(readFileSync(`${base}/${role}/manifest.json`,'utf8'));}catch{continue;}
  for(const clip of Object.values(model.clips))for(const frame of clip.frames){const g=normalizedSpriteGeometry(frame,model.standHeight!),[x,y,w,h]=g.target;expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);expect(x+w).toBeLessThanOrEqual(g.width);expect(y+h).toBeLessThanOrEqual(g.height);expect(-g.pivot[0]+x+frame.pivot[0]*g.scale).toBeCloseTo(0);expect(-g.pivot[1]+y+frame.pivot[1]*g.scale).toBeCloseTo(0);checked++;}
 }
 expect(checked).toBeGreaterThanOrEqual(648);
});
it('素材馆对同一人物全部动作使用同一比例，每个完整源画布均容纳在预览内',()=>{
 const base='public/assets/characters/molibaike',roles=readdirSync(base).filter(name=>/^role-\d+$/.test(name));let checked=0;
 for(const role of roles){let model:ModelManifest;try{model=JSON.parse(readFileSync(`${base}/${role}/manifest.json`,'utf8'));}catch{continue;}
  const scale=characterPreviewScale(model);
  for(const clip of Object.values(model.clips))for(const frame of clip.frames){
   const [,,width,height]=frame.rect,[pivotX,pivotY]=frame.pivot,left=320-pivotX*scale,top=330-pivotY*scale;
   expect(left).toBeGreaterThanOrEqual(24-1e-8);expect(left+width*scale).toBeLessThanOrEqual(616+1e-8);
   expect(top).toBeGreaterThanOrEqual(30-1e-8);expect(top+height*scale).toBeLessThanOrEqual(400+1e-8);checked++;
  }
 }
 expect(checked).toBeGreaterThanOrEqual(648);
});
it('贝堤特北向跳跃攻击保留完整顶部，站立和攻击不再切换人物比例',()=>{
 const model=JSON.parse(readFileSync('public/assets/characters/molibaike/role-1432/manifest.json','utf8')) as ModelManifest;
 const attack=model.clips['5:1'].frames[2],standing=model.clips['0:5'].frames[0],oldScale=Math.min(3,205/model.standHeight!),scale=characterPreviewScale(model);
 expect(330-attack.pivot[1]*oldScale).toBeLessThan(0);
 expect(330-attack.pivot[1]*scale).toBeGreaterThanOrEqual(30);
 expect(scale).toBeLessThan(characterPreviewScale({...model,clips:{'0:5':model.clips['0:5']}}));
 const extended={...model,clips:{standing:{...model.clips['0:5'],frames:[{...standing,pivot:[20,-20] as [number,number]}]}}};
 const belowScale=characterPreviewScale(extended);expect(330+(standing.rect[3]+20)*belowScale).toBeLessThanOrEqual(400);
});
it('按每帧原始时长选择，循环恰好回到首帧',()=>{
 expect([0,99,100,399,400,599,600,701].map(time=>resolveClipFrame(manifest,1,5,time).frameIndex)).toEqual([0,0,1,1,2,2,0,1]);
});
it('游戏的一次动作可覆盖源GIF无限循环，倒地末帧不会重站',()=>{
 expect(resolveClipFrame(manifest,1,5,900,false).frameIndex).toBe(2);
 expect(mapGameAction('fall')).toMatchObject({id:10,loop:false});
 expect(mapGameAction('downed')).toMatchObject({id:10,loop:false,holdLast:true});
});
it('缺动作或方向时明确标记站姿替代，完整资源不标替代',()=>{
 expect(resolveClipFrame(manifest,1,5,100)).toMatchObject({actionId:1,directionId:5,fallback:false});
 expect(resolveClipFrame(manifest,6,3,100)).toMatchObject({actionId:0,directionId:5,fallback:true});
});
it('负时间与非有限时间安全回到第一帧，没有任何站姿时拒绝伪造帧',()=>{
 expect(resolveClipFrame(manifest,1,5,-10).frameIndex).toBe(0);
 expect(resolveClipFrame(manifest,1,5,Infinity).frameIndex).toBe(0);
 expect(()=>resolveClipFrame({...manifest,clips:{}},1,5,0)).toThrow('缺少可用站立');
});
it('对话手势、重击和通用受伤如实声明使用源动作替代',()=>{
 expect(mapGameAction('talk')).toMatchObject({id:16,substitute:true});
 expect(mapGameAction('heavy-attack')).toMatchObject({id:5,substitute:true});
 expect(mapGameAction('hit-spell')).toMatchObject({id:8,substitute:true});
 expect(mapGameAction('cast')).toMatchObject({id:6,substitute:false});
});
it('NPC角色分配只取决于稳定actorId，不调用随机流',()=>{
 const ids=['role-1000','role-1024','role-1072'],random=vi.fn(()=>{throw Error('不能取随机数');});vi.spyOn(Math,'random').mockImplementation(random);
 const before=stableNpcModel('npc:persistent',ids);expect(ids).toContain(before);expect(stableNpcModel('npc:persistent',ids)).toBe(before);expect(stableNpcModel('npc:persistent',[])).toBe(DEFAULT_CHARACTER_MODEL);expect(random).not.toHaveBeenCalled();vi.restoreAllMocks();
});
it('选择仅写独立表现偏好；无存储/损坏值回退默认',()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};vi.stubGlobal('localStorage',storage);
 expect(readSelectedModel()).toBe(DEFAULT_CHARACTER_MODEL);selectModel('role-1072');expect(readSelectedModel()).toBe('role-1072');expect([...values.keys()]).toEqual([CHARACTER_MODEL_PREFERENCE]);
 values.set(CHARACTER_MODEL_PREFERENCE,'../bad');expect(readSelectedModel()).toBe(DEFAULT_CHARACTER_MODEL);expect(()=>selectModel('../bad')).toThrow();
 vi.stubGlobal('localStorage',{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});expect(readSelectedModel()).toBe(DEFAULT_CHARACTER_MODEL);expect(()=>selectModel('role-1072')).toThrow('浏览器未能保存');
});
it('资源仅从本地发布目录读取，拒绝外链和路径穿越',()=>{
 expect(characterAssetUrl(clip.atlasUrl)).toMatch(/assets\/characters\/molibaike\/role-1024\/action-1.webp$/);
 expect(()=>characterAssetUrl('https://www.molibaike.com/example.gif')).toThrow();expect(()=>characterAssetUrl('assets/characters/molibaike/../secret.json')).toThrow();
});
it('并发模型读取去重，失败后可重试且校验帧边界',async()=>{
 const catalog={version:'molibaike-catalog/1',characters:[{id:'role-1024',manifestUrl:'assets/characters/molibaike/role-1024/manifest.json'}]};let attempts=0;
 const fetcher=vi.fn(async(path:string)=>({ok:true,json:async()=>path.endsWith('source-catalog.json')?catalog:++attempts===1?{...manifest,clips:{'0:5':{...clip,frames:[{...clip.frames[0],rect:[119,0,40,80]}]}}}:manifest}));vi.stubGlobal('fetch',fetcher);
 const initial=await Promise.allSettled([loadCharacterModel('role-1024'),loadCharacterModel('role-1024')]);expect(initial.map(result=>result.status)).toEqual(['rejected','rejected']);expect(attempts).toBe(1);
 const recovered=await loadCharacterModel('role-1024');expect(recovered.characterId).toBe('role-1024');expect(attempts).toBe(2);await loadCharacterModel('role-1024');expect(attempts).toBe(2);
});
it('九人同场跨帧读取不会反复请求人物清单，浏览完整名册后也保持命中',async()=>{
 vi.resetModules();const models=await import('../src/presentation/external-character-models');
 const ids=Array.from({length:28},(_,index)=>`role-${2000+index}`),catalog={version:'molibaike-catalog/1',characters:ids.map(id=>({id,manifestUrl:`assets/characters/molibaike/${id}/manifest.json`}))};
 const fetcher=vi.fn(async(path:string)=>({ok:true,json:async()=>path.endsWith('source-catalog.json')?catalog:{...manifest,characterId:path.split('/').at(-2)}}));vi.stubGlobal('fetch',fetcher);
 await Promise.all(ids.map(id=>models.loadCharacterModel(id)));
 const initialRequests=fetcher.mock.calls.length;
 // A valid adventure can have the player and eight NPCs. Mirror consumers that
 // first peek each frame and only fetch a manifest when the cache misses.
 for(let frame=0;frame<4;frame++)await Promise.all(ids.slice(0,9).map(async id=>{
  const model=models.peekCharacterModel(id)??await models.loadCharacterModel(id);
  expect(models.resolveClipFrame(model,1,5,frame*120).fallback).toBe(false);
 }));
 expect(initialRequests).toBe(29);expect(fetcher).toHaveBeenCalledTimes(initialRequests);
});
function stubAtlasImages(width:number,height:number){
 const requests:string[]=[];
 class AtlasImage {
  naturalWidth=width;naturalHeight=height;decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  private source='';get src(){return this.source;}
  set src(value:string){this.source=value;if(value){requests.push(value);queueMicrotask(()=>this.onload?.());}}
 }
 vi.stubGlobal('Image',AtlasImage);return requests;
}
it('九人的站立与行走交替播放多帧时不重新解码仍在场的图集',async()=>{
 vi.resetModules();const models=await import('../src/presentation/external-character-models'),requests=stubAtlasImages(500,600);
 const paths=Array.from({length:9},(_,index)=>[0,1].map(action=>`assets/characters/molibaike/role-${2000+index}/action-${action}.webp`)).flat();
 await Promise.all(paths.map(path=>models.loadSpriteAtlas(path)));
 // Switch all nine actors between stand/walk, just as map frames and portraits
 // share the cache. These 18 modest atlases fit within the pixel budget.
 for(let frame=0;frame<6;frame++)for(const path of paths.filter((_,index)=>index%2===frame%2)){
  const atlas=models.peekSpriteAtlas(path)??await models.loadSpriteAtlas(path);expect(atlas.naturalWidth).toBe(500);
 }
 expect(requests).toHaveLength(18);
});
it('增加同场人物缓存后仍按解码像素淘汰旧图集，并拒绝单张超大图集',async()=>{
 vi.resetModules();const models=await import('../src/presentation/external-character-models');stubAtlasImages(2000,2000);
 const paths=Array.from({length:4},(_,index)=>`assets/characters/molibaike/role-${3000+index}/action-1.webp`);
 for(const path of paths)await models.loadSpriteAtlas(path);
 const retained=paths.map(path=>models.peekSpriteAtlas(path));
 expect(retained[0]).toBeUndefined();expect(retained.slice(1).every(Boolean)).toBe(true);
 expect(retained.reduce((pixels,atlas)=>pixels+(atlas?atlas.naturalWidth*atlas.naturalHeight:0),0)).toBeLessThanOrEqual(12_000_000);
 stubAtlasImages(4000,4000);const oversize='assets/characters/molibaike/role-3999/action-1.webp';
 await expect(models.loadSpriteAtlas(oversize)).rejects.toThrow('尺寸超过缓存上限');expect(models.peekSpriteAtlas(oversize)).toBeUndefined();
});
