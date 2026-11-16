import {afterEach,beforeEach,expect,it,vi} from 'vitest';

beforeEach(()=>vi.resetModules());
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const atlas=(i=0)=>`assets/characters/molibaike/role-${2000+i}/action-0.webp`;

function images(options:{manual?:boolean;fail?:string;width?:number;height?:number;world?:boolean}={}){
 const requested:string[]=[],instances:ImageStub[]=[];
 class ImageStub {
  naturalWidth=options.width??500;naturalHeight=options.height??600;decoding='';
  onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  private source='';get src(){return this.source;}
  set src(value:string){
   this.source=value;if(!value)return;requested.push(value);instances.push(this);
   if(options.world){this.naturalWidth=value.includes('terrain')?1254:value.includes('weather')?1774:1448;this.naturalHeight=value.includes('terrain')?1254:value.includes('weather')?887:1086;}
   if(!options.manual)queueMicrotask(()=>{if(value.includes(options.fail??'__never__'))this.onerror?.();else this.onload?.();});
  }
  decode(){return Promise.resolve();}
 }
 vi.stubGlobal('Image',ImageStub);
 return {requested,instances};
}
const binaryFetch=()=>vi.fn(async()=>new Response(new Blob(['atlas data'],{type:'image/webp'})));

it('world preload and renderer requests share five decoded atlases, with no second download',async()=>{
 const im=images({world:true}),world=await import('../src/presentation/world-assets');
 await Promise.all([world.loadWorldArt(),world.loadWorldArt()]);await world.loadWorldArt();
 expect(im.requested).toHaveLength(5);expect(new Set(im.requested).size).toBe(5);
});

it('world failure is retryable while successful images remain cached',async()=>{
 const im=images({world:true,fail:'terrain'}),world=await import('../src/presentation/world-assets');
 await expect(world.loadWorldArt()).rejects.toThrow('图像加载失败');
 await vi.waitFor(()=>expect(im.requested).toHaveLength(5));
 const recovered=images({world:true});await world.loadWorldArt();
 expect(recovered.requested).toHaveLength(1);expect(recovered.requested[0]).toContain('terrain');
});

it('cancelling one world caller preserves the shared request needed by another',async()=>{
 const im=images({world:true,manual:true}),world=await import('../src/presentation/world-assets'),controller=new AbortController();
 const abandoned=world.loadWorldArt(controller.signal),survivor=world.loadWorldArt();
 const rejected=expect(abandoned).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(im.requested).toHaveLength(2));controller.abort();await rejected;
 // Complete the two-wide queue without creating a duplicate request.
 for(let i=0;i<5;i++){await vi.waitFor(()=>expect(im.instances[i]).toBeDefined());im.instances[i].onload?.();}
 await survivor;expect(im.requested).toHaveLength(5);
});

it('cancelled queued image work releases its slot and a later request can start immediately',async()=>{
 const im=images({manual:true}),models=await import('../src/presentation/external-character-models'),controllers=Array.from({length:4},()=>new AbortController());
 const work=controllers.map((c,i)=>models.loadSpriteAtlas(atlas(i),c.signal));
 const all=Promise.allSettled(work);
 await vi.waitFor(()=>expect(im.requested).toHaveLength(3));controllers[3].abort();controllers[0].abort();
 const replacement=models.loadSpriteAtlas(atlas(4));await vi.waitFor(()=>expect(im.requested).toHaveLength(4));
 expect(im.requested.some(path=>path.includes('role-2003'))).toBe(false);
 im.instances[1].onload?.();im.instances[2].onload?.();im.instances[3].onload?.();
 await replacement;expect((await all).map(r=>r.status)).toEqual(['rejected','fulfilled','fulfilled','rejected']);
});

it('prefetch stores compressed poses without decoding or evicting visible atlas images',async()=>{
 const im=images(),models=await import('../src/presentation/external-character-models'),fetcher=binaryFetch();vi.stubGlobal('fetch',fetcher);
 await models.loadSpriteAtlas(atlas());
 await Promise.all(Array.from({length:30},(_,i)=>models.preloadCharacterAtlas(atlas(i+1))));
 expect(im.requested).toHaveLength(1);expect(models.peekSpriteAtlas(atlas())).toBeDefined();expect(fetcher).toHaveBeenCalledTimes(30);
});

it('preloaded bytes are decoded once through a revoked temporary URL, without a second fetch',async()=>{
 const im=images(),models=await import('../src/presentation/external-character-models'),fetcher=binaryFetch();vi.stubGlobal('fetch',fetcher);
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:prepared'),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 await Promise.all([models.preloadCharacterAtlas(atlas()),models.preloadCharacterAtlas(atlas())]);
 const [first,second]=await Promise.all([models.loadSpriteAtlas(atlas()),models.loadSpriteAtlas(atlas())]);
 expect(first).toBe(second);expect(fetcher).toHaveBeenCalledTimes(1);expect(create).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:prepared');expect(im.requested).toEqual(['blob:prepared']);
});

it('a failed blob decode clears the prefetched bytes so the next attempt can recover',async()=>{
 const models=await import('../src/presentation/external-character-models'),fetcher=binaryFetch();vi.stubGlobal('fetch',fetcher);
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:prepared');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 images({fail:'blob:'});await models.preloadCharacterAtlas(atlas());await expect(models.loadSpriteAtlas(atlas())).rejects.toThrow();
 images();await models.preloadCharacterAtlas(atlas());await models.loadSpriteAtlas(atlas());expect(fetcher).toHaveBeenCalledTimes(2);
});

it('compressed cache stays within 16 MiB independently of the decoded pixel budget',async()=>{
 const models=await import('../src/presentation/external-character-models');
 const fetcher=vi.fn(async()=>new Response(new Blob([new Uint8Array(2*1024*1024)],{type:'image/webp'})));vi.stubGlobal('fetch',fetcher);
 for(let i=0;i<9;i++)await models.preloadCharacterAtlas(atlas(i));
 await models.preloadCharacterAtlas(atlas(8));expect(fetcher).toHaveBeenCalledTimes(9);
 await models.preloadCharacterAtlas(atlas(0));expect(fetcher).toHaveBeenCalledTimes(10);
});

it('cancelled prefetch aborts the fetch and does not poison an immediate retry',async()=>{
 const models=await import('../src/presentation/external-character-models'),controller=new AbortController();
 let requestSignal:AbortSignal|undefined;
 const fetcher=vi.fn((_:string,options:{signal:AbortSignal})=>{
  requestSignal=options.signal;return new Promise<Response>((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
 });vi.stubGlobal('fetch',fetcher);
 const pending=models.preloadCharacterAtlas(atlas(),controller.signal),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));controller.abort();await rejected;expect(requestSignal!.aborted).toBe(true);
 const recovered=binaryFetch();vi.stubGlobal('fetch',recovered);await models.preloadCharacterAtlas(atlas());expect(recovered).toHaveBeenCalledTimes(1);
});

it('image timeout removes pending work and makes the same atlas retryable',async()=>{
 vi.useFakeTimers();images({manual:true});const models=await import('../src/presentation/external-character-models');
 const pending=models.loadSpriteAtlas(atlas()),rejected=expect(pending).rejects.toThrow('超时');
 await vi.advanceTimersByTimeAsync(15000);await rejected;
 images();await models.loadSpriteAtlas(atlas());expect(models.peekSpriteAtlas(atlas())).toBeDefined();
});
