import {beforeAll,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createAdventureApplication,type AdventureSnapshot} from '../src/application';
import {planAdventureCharacters,planCharacterAtlases} from '../src/presentation/adventure-assets';
import {DEFAULT_CHARACTER_MODEL,type ModelCatalog,type ModelManifest} from '../src/presentation/external-character-models';

const catalog=JSON.parse(readFileSync('public/assets/characters/molibaike/source-catalog.json','utf8')) as ModelCatalog;
let snapshot:AdventureSnapshot;
beforeAll(async()=>{const app=createAdventureApplication();expect((await app.initialize({seed:'asset-preparation-plan'})).ok).toBe(true);snapshot=structuredClone(app.query().snapshot!) as AdventureSnapshot;app.dispose();});

it('prepares only the player and visible cast without mutating game facts or drawing randomness',()=>{
 const s=structuredClone(snapshot);s.runtime.visible=[];
 const before=JSON.stringify(s),random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('no game randomness');});
 try{
  const plans=planAdventureCharacters(s,catalog,'role-1024');
  expect(plans).toHaveLength(1);expect(plans[0].modelId).toBe('role-1024');
  expect(plans[0].actions).toEqual([0,1,3,5,6,8,9,10,16]);
  expect(JSON.stringify(s)).toBe(before);
 }finally{random.mockRestore();}
});

it('includes a saved battle participant even when its exploration tile is unseen',()=>{
 const s=structuredClone(snapshot),enemy=Object.values(s.runtime.actors).find(a=>a.actorId!==s.playerActorId)!;s.runtime.visible=[];
 s.runtime.encounter={id:'preload-battle',status:'active',round:1,participants:[{actorId:s.playerActorId,position:{x:1,y:3},initiative:20},{actorId:enemy.actorId,position:{x:3,y:3},initiative:1}],rng:1,movement:4,action:true,guard:false,log:[],rewarded:false,obstacles:[]};
 const plans=planAdventureCharacters(s,catalog,'role-1024');
 const models=new Map(plans.map(p=>[p.modelId,JSON.parse(readFileSync(`public/assets/characters/molibaike/${p.modelId}/manifest.json`,'utf8')) as ModelManifest]));
 const atlases=planCharacterAtlases(plans,models);
 for(const p of plans)for(const action of [0,1,3,5,6,8,9,10])expect(atlases.downloads).toContain(models.get(p.modelId)!.clips[`${action}:5`].atlasUrl);
 expect(atlases.decode.length).toBeLessThanOrEqual(24);expect(atlases.pixels).toBeLessThanOrEqual(12_000_000);
});

it('a removed visual preference falls back to the same default as the renderer',()=>{
 const s=structuredClone(snapshot);s.runtime.visible=[];
 expect(planAdventureCharacters(s,catalog,'role-999999')[0].modelId).toBe(DEFAULT_CHARACTER_MODEL);
});

it('downloads a pose once for all eight directions and keeps optional decodes within the LRU budget',()=>{
 const plans=catalog.characters.slice(0,9).map((c,i)=>({modelId:c.id,actions:[0,1,3,5,6,8,9,10,16],initialAction:0,player:i===0}));
 const models=new Map(plans.map(p=>[p.modelId,JSON.parse(readFileSync(`public/assets/characters/molibaike/${p.modelId}/manifest.json`,'utf8')) as ModelManifest]));
 const result=planCharacterAtlases(plans,models);
 expect(result.downloads).toHaveLength(81);expect(new Set(result.downloads).size).toBe(result.downloads.length);
 expect(result.decode.length).toBeLessThanOrEqual(24);expect(result.pixels).toBeLessThanOrEqual(12_000_000);
 for(const path of result.decode)expect(result.downloads).toContain(path);
 for(const plan of plans)expect(result.decode).toContain(models.get(plan.modelId)!.clips['0:5'].atlasUrl);
});

it('prepares the saved downed pose as well as the standing portrait',()=>{
 const model=JSON.parse(readFileSync('public/assets/characters/molibaike/role-1024/manifest.json','utf8')) as ModelManifest;
 const result=planCharacterAtlases([{modelId:model.characterId,actions:[0,1,10],initialAction:10,player:false}],new Map([[model.characterId,model]]));
 expect(result.decode).toContain(model.clips['0:5'].atlasUrl);expect(result.decode).toContain(model.clips['10:5'].atlasUrl);
});
