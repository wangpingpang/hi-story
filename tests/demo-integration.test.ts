import { describe, it, expect } from 'vitest';
import { createGameApplication, type GameApplication, type DemoCommand, type RunSnapshot } from '../src/application';
import { generateMap, findMapPath, type Point } from '../src/modules/world';
import { createTaskGenerator, TaskGeneratorRegistry } from '../src/modules/quest-generation';
import { moveRuntime, startBattle, battleAction, canInteract } from '../src/modules/runtime';

const snapshot=(app:GameApplication)=>structuredClone(app.query().snapshot!) as RunSnapshot;
let sequence=0;
function command(app:GameApplication,type:string,payload:Record<string,unknown>):DemoCommand {
  const s=snapshot(app);return {commandId:`test-${++sequence}`,runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type,payload};
}
async function act(app:GameApplication,type:string,payload:Record<string,unknown>) {
  const result=await app.dispatch(command(app,type,payload));expect(result,JSON.stringify(result)).toMatchObject({ok:true});return result;
}
async function choose(app:GameApplication,optionId:string) {
  const event=app.query().events.find(e=>e.optionId===optionId);expect(event,optionId).toBeDefined();
  return act(app,'event.choose',{optionId,eventInstanceId:event!.eventInstanceId});
}
function path(app:GameApplication,target:Point):Point[] {
  const s=snapshot(app),start=s.runtime.actors[s.playerActorId].position;
  const blocked=new Set(Object.values(s.runtime.actors).filter(a=>a.actorId!==s.playerActorId&&a.hp>0).map(a=>`${a.position.x},${a.position.y}`));
  const queue:[Point,Point[]][]=[[start,[]]],seen=new Set([`${start.x},${start.y}`]);
  for(let i=0;i<queue.length;i++) {
    const [p,route]=queue[i];if(p.x===target.x&&p.y===target.y)return route;
    for(const next of [{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]) {
      const key=`${next.x},${next.y}`;
      if(!seen.has(key)&&!blocked.has(key)&&s.runtime.map.cells[next.y]?.[next.x]?.walkable){seen.add(key);queue.push([next,[...route,next]]);}
    }
  }throw Error('目标不可达');
}
async function go(app:GameApplication,target:Point) {for(const p of path(app,target))await act(app,'world.move',{...p});}
async function open(seed='demo-test',ports:Parameters<typeof createGameApplication>[0]={}) {
  const app=createGameApplication(ports);expect(await app.initialize({seed})).toMatchObject({ok:true});return app;
}
async function encounter(app:GameApplication) {
  await go(app,{x:4,y:6});await choose(app,'attack:npc-0');expect(snapshot(app).status).toBe('waiting-result');
}
describe('六模块 Demo 集成与事务',()=>{
  it('40个种子都有固定起终点、完整人物绑定和可达路径；同种子生成一致',async()=>{
    for(let i=0;i<40;i++) {
      const app=await open(`seed-${i}`),s=snapshot(app),map=s.runtime.map;
      expect(map.anchors.find(a=>a.id==='spawn')!.position).toEqual({x:3,y:3});
      expect(map.anchors.find(a=>a.id==='goal')!.position).toEqual({x:28,y:16});
      expect(findMapPath(map,{x:3,y:3},{x:28,y:16})?.length).toBeGreaterThan(0);
      expect(Object.keys(s.runtime.actors)).toHaveLength(4);
      expect(s.things.objectives.some(t=>t.blueprint.source==='random-task')).toBe(true);
      const other=snapshot(await open(`seed-${i}`));
      expect(other.runtime).toEqual(s.runtime);expect(other.story).toEqual(s.story);expect(other.things).toEqual(s.things);
    }
  });
  it('阅读、购买、实际抵达、完成目标形成可游玩的闭环',async()=>{
    const app=await open();expect(app.query().events.some(e=>e.optionId==='travel')).toBe(false);
    const buy=app.query().events.find(e=>e.optionId==='buy')!;
    expect(await app.dispatch(command(app,'event.choose',{optionId:buy.optionId,eventInstanceId:buy.eventInstanceId}))).toMatchObject({ok:false,error:{code:'OUT_OF_RANGE'}});
    await choose(app,'notes');await go(app,{x:7,y:4});await choose(app,'buy');
    expect(app.query().events.some(e=>e.optionId==='resolve')).toBe(false);
    await go(app,{x:28,y:16});expect(snapshot(app).story.targetReached).toBe(true);
    await choose(app,'resolve');const s=snapshot(app);
    expect(s.status).toBe('ended');expect(s.story.quests.find(q=>q.id==='main')!.status).toBe('success');
    expect(s.things.objectives.find(q=>q.blueprint.id==='main')!.status).toBe('success');
    expect(await app.dispatch(command(app,'world.move',{x:27,y:16}))).toMatchObject({ok:false,error:{code:'RUN_ENDED'}});
  });
  it('探索任务只发放一次奖励，离开终点撤销当前抵达条件',async()=>{
    const app=await open(),task=snapshot(app).things.objectives.find(t=>t.blueprint.source==='random-task')!;
    const target=snapshot(app).runtime.map.anchors.find(a=>a.id===(task.blueprint.condition as {anchorId:string}).anchorId)!.position;
    const gold=snapshot(app).things.gold;await go(app,target);
    expect(snapshot(app).things.gold).toBe(gold+2);
    const previous=path(app,{x:target.x-1,y:target.y});for(const p of previous)await act(app,'world.move',{...p});
    await go(app,target);expect(snapshot(app).things.gold).toBe(gold+2);
    if(target.x===28){await act(app,'world.move',{x:27,y:16});expect(snapshot(app).story.targetReached).toBe(false);}
  });
  it('查询深冻结且独立；订阅收到初始化完成时 busy=false',async()=>{
    const app=createGameApplication(),states:boolean[]=[];app.subscribe(()=>states.push(app.query().busy));
    const result=await app.initialize({seed:'immutable'});expect(result).toMatchObject({ok:true,value:{busy:false}});
    const view=app.query();expect(()=>{(view.snapshot!.runtime.actors[view.snapshot!.playerActorId].position as Point).x=30;}).toThrow();
    expect(states).toEqual([true,false]);expect(snapshot(app).runtime.actors[snapshot(app).playerActorId].position.x).toBe(3);
  });
  it('命令去重先于版本判断；冲突、旧版本和旧局命令拒绝',async()=>{
    const app=await open(),c=command(app,'world.move',{x:3,y:4});expect(await app.dispatch(c)).toMatchObject({ok:true});
    await act(app,'world.move',{x:3,y:5});const before=snapshot(app);
    expect(await app.dispatch(c)).toMatchObject({ok:true,duplicate:true,value:{revision:1}});
    expect(await app.dispatch({...c,payload:{x:4,y:3}})).toMatchObject({ok:false,error:{code:'COMMAND_ID_CONFLICT'}});
    expect(await app.dispatch({...c,commandId:'stale'})).toMatchObject({ok:false,error:{code:'REVISION_CONFLICT'}});
    expect(snapshot(app)).toEqual(before);expect(await app.restart()).toMatchObject({ok:true});
    expect(await app.dispatch(c)).toMatchObject({ok:false,error:{code:'RUN_MISMATCH'}});
    expect(snapshot(app).runtime).toEqual((await open()).query().snapshot!.runtime);
  });
  it('排队前复制载荷；并发同版本最多提交一次',async()=>{
    const app=await open(),c=command(app,'world.move',{x:3,y:4}),other=command(app,'world.move',{x:4,y:3});
    const pending=app.dispatch(c);c.payload.x=30;
    const results=await Promise.all([pending,app.dispatch(other)]);
    expect(results[0]).toMatchObject({ok:true});expect(results[1]).toMatchObject({ok:false,error:{code:'REVISION_CONFLICT'}});
    expect(snapshot(app).runtime.actors[snapshot(app).playerActorId].position).toEqual({x:3,y:4});
  });
  it('提交故障回滚移动、故事、奖励、回执和随机状态；同命令可重试',async()=>{
    let fail=false;const app=await open('rollback',{beforeCommit:()=>{if(fail)throw Error('injected');}});
    const before=snapshot(app),c=command(app,'world.move',{x:3,y:4});fail=true;
    expect(await app.dispatch(c)).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);
    fail=false;expect(await app.dispatch(c)).toMatchObject({ok:true});
  });
  it('重开取消等待中的旧事务，重开失败保留旧局',async()=>{
    let hold=false,enter!:()=>void,release!:()=>void;
    const entered=new Promise<void>(resolve=>enter=resolve),gate=new Promise<void>(resolve=>release=resolve);
    const app=await open('restart',{beforeCommit:async()=>{if(hold){enter();await gate;}}});
    hold=true;const pending=app.dispatch(command(app,'world.move',{x:3,y:4}));await entered;
    hold=false;const restarted=app.restart();release();
    expect(await pending).toMatchObject({ok:false,error:{code:'RUN_MISMATCH'}});expect(await restarted).toMatchObject({ok:true});
    expect(snapshot(app).revision).toBe(0);
    let bad=false;const failing=await open('map-failure',{createMap:r=>bad?{ok:false,error:{code:'UNSATISFIABLE',message:'故障'}}:generateMap(r)});
    const before=snapshot(failing);bad=true;expect(await failing.restart()).toMatchObject({ok:false});expect(snapshot(failing)).toEqual(before);
  });
  it('校验未知参数、伪造身份、未知处理器、非法移动与事件绑定',async()=>{
    const app=await open(),before=snapshot(app),c=command(app,'world.move',{x:3,y:4});
    expect(await app.dispatch({...c,extra:1})).toMatchObject({ok:false,error:{code:'INVALID_COMMAND'}});
    expect(await app.dispatch({...c,actorId:'forged'})).toMatchObject({ok:false,error:{code:'ACTOR_MISMATCH'}});
    expect(await app.dispatch({...c,type:'missing'})).toMatchObject({ok:false,error:{code:'UNKNOWN_COMMAND'}});
    expect(await app.dispatch({...c,payload:{x:28,y:16}})).toMatchObject({ok:false,error:{code:'INVALID_TARGET'}});
    expect(await app.dispatch(command(app,'event.choose',{optionId:'notes',eventInstanceId:'forged'}))).toMatchObject({ok:false,error:{code:'OPTION_UNAVAILABLE'}});
    expect(snapshot(app)).toEqual(before);
  });
  it('战斗锁住探索；逃离不改变NPC存活，重复命令不重复结算',async()=>{
    const app=await open();await encounter(app);const before=snapshot(app);
    expect(await app.dispatch(command(app,'world.move',{x:4,y:5}))).toMatchObject({ok:false,error:{code:'WAITING_RESULT'}});
    expect(await app.dispatch(command(app,'combat.action',{action:'attack'}))).toMatchObject({ok:false,error:{code:'OUT_OF_RANGE'}});
    expect(snapshot(app)).toEqual(before);
    const c=command(app,'combat.action',{action:'flee'});await app.dispatch(c);const after=snapshot(app);
    expect(after.status).toBe('active');expect(after.story.npcs[0].alive).toBe(true);expect(after.pending).toBeUndefined();
    expect(await app.dispatch(c)).toMatchObject({ok:true,duplicate:true});expect(snapshot(app)).toEqual(after);
  });
  it('骰子战斗胜利同步生命、故事依赖和事件结算，战斗中故障不消耗随机数',async()=>{
    let fail=false;const app=await open('victory',{beforeCommit:()=>{if(fail)throw Error('combat-injected');}});
    await encounter(app);await act(app,'combat.action',{action:'move',x:2,y:2});await act(app,'combat.action',{action:'move',x:3,y:2});
    const before=snapshot(app),c=command(app,'combat.action',{action:'attack'});fail=true;
    expect(await app.dispatch(c)).toMatchObject({ok:false});expect(snapshot(app)).toEqual(before);fail=false;
    expect(await app.dispatch(c)).toMatchObject({ok:true});
    for(let i=0;i<30&&snapshot(app).pending;i++)await act(app,'combat.action',{action:'attack'});
    const s=snapshot(app);expect(s.runtime.battle!.status).toBe('victory');expect(s.story.npcs[0].alive).toBe(false);
    expect(s.runtime.actors[s.runtime.battle!.enemyActorId].hp).toBe(0);expect(s.pending).toBeUndefined();
    expect(s.things.facts.some(f=>f.optionId==='attack:npc-0')).toBe(true);
  });
  it('角色战败关闭主线并结束本局；dispose阻止后续操作',async()=>{
    const app=await open('defeat');await encounter(app);
    for(let i=0;i<100&&snapshot(app).pending;i++)await act(app,'combat.action',{action:'defend'});
    const s=snapshot(app);expect(s.runtime.battle!.status).toBe('defeat');expect(s.status).toBe('ended');
    expect(s.story.quests.find(q=>q.id==='main')!.status).toBe('failed');app.dispose();
    expect(await app.restart()).toMatchObject({ok:false,error:{code:'DISPOSED'}});
  });
});
describe('运行器与任务参与者边界',()=>{
  it('人物占位阻止穿越，迷雾按视线遮挡；运行操作不改输入',async()=>{
    const app=await open(),s=snapshot(app);await go(app,{x:4,y:6});const runtime=snapshot(app).runtime;
    expect(()=>moveRuntime(runtime,{x:5,y:6})).toThrow('占据');expect(runtime).toEqual(snapshot(app).runtime);
    const blocked=structuredClone(s.runtime);blocked.map.cells[3][4].blocksSight=true;
    const moved=moveRuntime(blocked,{x:3,y:4});
    expect(moved.visible).toContain('4,3');expect(canInteract(moved,{x:5,y:3})).toBe(false);
  });
  it('战斗随机流取决于种子和战斗序号，随机请求ID不影响骰子',async()=>{
    const app=await open();await go(app,{x:4,y:6});const r=snapshot(app).runtime,enemy=Object.values(r.actors).find(a=>a.storyNpcId==='npc-0')!.actorId;
    let a=startBattle(r,enemy,'request-a','replay'),b=startBattle(r,enemy,'request-b','replay');
    for(const p of [{x:2,y:2},{x:3,y:2}]){a=battleAction(a,'move',p);b=battleAction(b,'move',p);}
    a=battleAction(a,'attack');b=battleAction(b,'attack');expect(a.battle!.log).toEqual(b.battle!.log);expect(a.actors).toEqual(b.actors);
  });
  it('任务生成只返回蓝图；隔离参与者输入，拒绝重复与不存在引用',()=>{
    const input={seed:'tasks',quests:[{id:'main',title:'目标'}],anchorIds:['supply','goal']};
    expect(createTaskGenerator().generate(input)).toEqual(createTaskGenerator().generate(input));
    const registry=new TaskGeneratorRegistry();registry.register({id:'mutator',generate:i=>{(i.anchorIds as string[]).push('fake');return [];}});
    registry.register({id:'bad',generate:()=>[{id:'bad',title:'坏引用',source:'bad',condition:{kind:'visit',anchorId:'fake'},rewardGold:1}]});
    expect(()=>registry.generate(input)).toThrow('不存在');expect(input.anchorIds).toEqual(['supply','goal']);
    expect(()=>registry.register({id:'bad',generate:()=>[]})).toThrow('唯一');
  });
});
