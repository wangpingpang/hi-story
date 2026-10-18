import {it,expect} from 'vitest';
import {createAdventureApplication,collectDiceFeedback,DICE_FEEDBACK_VERSION,type AdventureSnapshot} from '../src/application';
import {useAdventureProfessionSkill,rollSkill,nextDie} from '../src/modules/runtime';

async function fixture(){const app=createAdventureApplication();await app.initialize({seed:'dice-side-projection',professions:app.professionSetup('wizard')});const s=structuredClone(app.query().snapshot!) as AdventureSnapshot,id=s.playerActorId,enemy=Object.values(s.runtime.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;s.runtime.encounter={id:'side-projection',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},{actorId:enemy,position:{x:3,y:3},initiative:1}],rng:123,movement:4,action:true,guard:false,log:[],rewarded:false,obstacles:[]};s.status='waiting-result';return {s,id,enemy};}
it('dice-feedback/3给每张真实骰子附稳定身份、阵营与目标，查询不改变随机流',async()=>{
 const {s,id,enemy}=await fixture(),before=structuredClone(s),runtime=useAdventureProfessionSkill(s.runtime,id,'wizard-fire',enemy),after={...s,revision:s.revision+1,runtime},saved=structuredClone(after),frames=collectDiceFeedback(s,after);expect(DICE_FEEDBACK_VERSION).toBe('dice-feedback/3');expect(frames.length).toBeGreaterThan(0);for(const f of frames)expect(f).toMatchObject({actorId:id,side:'ally',targetId:enemy});expect(after).toEqual(saved);expect(s).toEqual(before);
});
it('雷法由目标掷豁免，伤害骰仍属于施法者，不按命令发起者统一归栏',async()=>{
 const {s,id,enemy}=await fixture();let seed=0;while(nextDie(seed,20).value!==1)seed++;s.runtime.encounter!.rng=seed;const runtime=useAdventureProfessionSkill(s.runtime,id,'wizard-lightning',enemy),frames=collectDiceFeedback(s,{...s,revision:s.revision+1,runtime});expect(frames.find(f=>f.kind==='save')).toMatchObject({actorId:enemy,side:'enemy',targetId:id});expect(frames.find(f=>f.kind==='damage')).toMatchObject({actorId:id,side:'ally',targetId:enemy});
});
it('同名演员仍按稳定ID分到不同侧，保存状态不包含展示位置',async()=>{
 const {s,id,enemy}=await fixture();s.runtime.actors[id].profile.name=s.runtime.actors[enemy].profile.name='同名旅人';const after=structuredClone(s);after.revision++;after.runtime.encounter!.rollSequence=2;after.runtime.encounter!.rolls=[id,enemy].map((actorId,i)=>({id:`side-projection:roll:${i+1}`,sequence:i+1,kind:'initiative',actorId,sides:20,dice:[12],bonus:2,total:14}));const frames=collectDiceFeedback(s,after);expect(frames.map(f=>[f.actorId,f.side])).toEqual([[id,'ally'],[enemy,'enemy']]);expect(frames[0].actorName).toBe(frames[1].actorName);expect(JSON.stringify(after)).not.toContain('dicePanel');expect(collectDiceFeedback(after,after)).toEqual([]);
});
it('探索检定归玩家，取消/恢复与旧局不产生额外骰子',async()=>{
 const {s,id}=await fixture();delete s.runtime.encounter;s.status='active';const runtime=rollSkill(s.runtime,id,'perception',12,'side-check').runtime,after={...s,revision:s.revision+1,runtime};expect(collectDiceFeedback(s,after)[0]).toMatchObject({actorId:id,side:'ally',kind:'skill'});expect(collectDiceFeedback(s,{...after,runId:'new-session'})).toEqual([]);expect(collectDiceFeedback(s,s)).toEqual([]);
});
