import {it,expect} from 'vitest';
import {BattleMovementPlayback,createAdventureApplication,type AdventureApplication,type AdventureSnapshot} from '../src/application';
import {combatRoute,combatReachable,tacticalAction,tacticalActionWithMovement,validateAdventureRuntime} from '../src/modules/runtime';
import {canonical,seedHash} from '../src/contracts/demo';
import {AdventureMotion} from '../src/application/adventure-motion';

async function fixture(ports:Parameters<typeof createAdventureApplication>[0]={}){
 const app=createAdventureApplication(ports),player=app.professionSetup('fighter').player;player.build.classes[0]={classId:'fighter',level:5,specializationId:'guardian'};
 expect(await app.initialize({seed:'battle-movement',professions:{player,actors:{'npc-0':app.professionSetup('fighter').player,'npc-1':app.professionSetup('fighter').player}}})).toMatchObject({ok:true});
 const s=JSON.parse(app.exportSave()).payload as AdventureSnapshot,id=s.playerActorId,enemies=['npc-0','npc-1'].map(id=>Object.values(s.runtime.actors).find(a=>a.storyNpcId===id)!.actorId);
 s.runtime.encounter={id:'moving-battle',status:'active',round:1,participants:[{actorId:id,position:{x:1,y:3},initiative:20},...enemies.map((actorId,i)=>({actorId,position:{x:6,y:3+i},initiative:i+1}))],rng:123,action:true,movement:4,guard:false,log:[],rewarded:false,obstacles:[{x:2,y:3}]};s.status='waiting-result';
 expect(await app.restore(JSON.stringify({format:'hi-story-save/1',payload:s,checksum:seedHash(canonical(s)).toString(16)}))).toMatchObject({ok:true});
 return {app,s:structuredClone(app.query().snapshot!) as AdventureSnapshot,id,enemies};
}
function command(app:AdventureApplication,payload:Record<string,unknown>){const s=app.query().snapshot!;return {commandId:crypto.randomUUID(),runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type:'combat.action',payload};}
it('移动路线和消耗共用寻路，绕障碍且每一步相邻，移动不掷骰',async()=>{
 const {s,id}=await fixture(),before=structuredClone(s),to={x:3,y:3},path=combatRoute(s.runtime,to)!;expect(path).toHaveLength(5);expect(path[0]).toEqual({x:1,y:3});expect(path.at(-1)).toEqual(to);expect(path).not.toContainEqual({x:2,y:3});expect(combatReachable(s.runtime,to)).toBe(4);
 const result=tacticalActionWithMovement(s.runtime,'move',to);expect(result.movement).toEqual({version:'combat-movement/1',encounterId:'moving-battle',moves:[{actorId:id,path}]});expect(result.runtime.encounter!.movement).toBe(0);expect(result.runtime.encounter!.rng).toBe(s.runtime.encounter!.rng);expect(result.runtime).toEqual(tacticalAction(s.runtime,'move',to));expect(s).toEqual(before);validateAdventureRuntime(result.runtime);
 result.movement.moves[0].path.at(-1)!.x=99;expect(result.runtime.encounter!.participants[0].position).toEqual(to);
});
it('非法目的地无回执，不消耗移动、行动和随机流',async()=>{
 const {s}=await fixture(),before=structuredClone(s);
 for(const to of [{x:2,y:3},{x:6,y:3},{x:8,y:6},{x:-1,y:3},{x:1.5,y:3},{x:1,y:3}]){expect(()=>tacticalActionWithMovement(s.runtime,'move',to)).toThrow();expect(s).toEqual(before);}
});
it('敌方回合返回实际逐格行进顺序，与原结算和随机流一致',async()=>{
 const {s,enemies}=await fixture(),result=tacticalActionWithMovement(s.runtime,'end');expect(result.runtime).toEqual(tacticalAction(s.runtime,'end'));expect(result.movement.moves.length).toBeGreaterThan(0);
 for(const move of result.movement.moves){expect(enemies).toContain(move.actorId);expect(move.path[0]).toEqual(s.runtime.encounter!.participants.find(p=>p.actorId===move.actorId)!.position);expect(move.path.at(-1)).toEqual(result.runtime.encounter!.participants.find(p=>p.actorId===move.actorId)!.position);for(let i=1;i<move.path.length;i++)expect(Math.abs(move.path[i].x-move.path[i-1].x)+Math.abs(move.path[i].y-move.path[i-1].y)).toBe(1);expect(move.path).not.toContainEqual({x:2,y:3});}validateAdventureRuntime(result.runtime);
});
it('成功提交后才返回路线，故障回滚、重复命令与存档不重播',async()=>{
 let fail=false;const {app}=await fixture({beforeCommit:()=>{if(fail)throw Error('injected');}}),c=command(app,{action:'move',x:3,y:3}),before=app.exportSave();fail=true;expect(await app.dispatch(c)).toMatchObject({ok:false});expect(app.exportSave()).toBe(before);
 fail=false;const result=await app.dispatch(c);expect(result).toMatchObject({ok:true,value:{combatMovement:{version:'combat-movement/1'}}});if(!result.ok)throw Error('move rejected');expect(Object.isFrozen(result.value.combatMovement!.moves[0].path)).toBe(true);
 const saved=app.exportSave();expect(saved).not.toContain('combatMovement');const duplicate=await app.dispatch(c);expect(duplicate).toMatchObject({ok:true,duplicate:true});expect(duplicate.ok&&duplicate.value.combatMovement).toBeUndefined();expect(app.exportSave()).toBe(saved);
 const restored=createAdventureApplication();expect(await restored.restore(saved)).toMatchObject({ok:true});expect(restored.query().snapshot!.runtime).toEqual(app.query().snapshot!.runtime);
});
it('跑步沿已提交路径连续经过中间点，结束回到权威坐标且不改快照',async()=>{
 const {s,id}=await fixture(),result=tacticalActionWithMovement(s.runtime,'move',{x:3,y:3}),after={...s,runtime:result.runtime},before=structuredClone(after),playback=new BattleMovementPlayback();expect(playback.begin(s,after,result.movement,100)).toBe(true);
 expect(playback.sample(id,100)).toMatchObject({position:{x:1,y:3},running:true});const mid=playback.sample(id,175)!;expect(mid.position).toEqual({x:1,y:2.5});expect(mid.direction).toBe('NE');expect(playback.playing(699)).toBe(true);expect(playback.playing(700)).toBe(false);expect(playback.sample(id,700)).toMatchObject({position:{x:3,y:3},running:false});expect(after).toEqual(before);
 playback.clear();expect(playback.sample(id,200)).toBeUndefined();
});
it('敌方逐个跑步，等待的演员保持起点，减少动态效果仍经过中间点',async()=>{
 const {s}=await fixture(),result=tacticalActionWithMovement(s.runtime,'end'),after={...s,runtime:result.runtime},playback=new BattleMovementPlayback();expect(playback.begin(s,after,result.movement,0,true)).toBe(true);const first=result.movement.moves[0];
 const sample=playback.sample(first.actorId,42.5)!;expect(sample.running).toBe(true);expect(sample.position).not.toEqual(first.path[0]);expect(sample.position).not.toEqual(first.path[1]);
 const second=result.movement.moves[1];if(second)expect(playback.sample(second.actorId,42.5)).toMatchObject({position:second.path[0],running:false});
});
it('恢复、换局或不连续证据不会重播旧路线',async()=>{
 const {s}=await fixture(),result=tacticalActionWithMovement(s.runtime,'move',{x:3,y:3}),after={...s,runtime:result.runtime},playback=new BattleMovementPlayback();expect(playback.begin(s,{...after,runId:'another'},result.movement,0)).toBe(false);expect(playback.begin(s,after,undefined,0)).toBe(false);
 const bad=structuredClone(result.movement);bad.moves[0].path=[{x:1,y:3},{x:3,y:3}];expect(playback.begin(s,after,bad,0)).toBe(false);expect(playback.sample(s.playerActorId,1)).toBeUndefined();
});
it('跑步结束后重启同一已提交攻击表现，不受旧动作去重影响或重算伤害',async()=>{
 const {s}=await fixture();s.runtime.encounter!.obstacles=[];const result=tacticalActionWithMovement(s.runtime,'end'),after={...s,runtime:result.runtime},before=structuredClone(after),attacker=result.runtime.encounter!.rolls!.find(r=>r.kind==='attack')!.actorId,motion=new AdventureMotion();
 motion.observe(s,0);motion.observe(after,1);motion.frame(attacker,3000);motion.replayCommittedChanges(s,after,3001);expect(motion.frame(attacker,3001)!.action).toMatch(/attack/);expect(motion.frame(attacker,3001)!.progress).toBe(0);expect(after).toEqual(before);
});
