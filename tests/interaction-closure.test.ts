import {expect,it} from 'vitest';
import {createAdventureApplication,type AdventureSnapshot} from '../src/application';
import {bindAdventureChoices,closeAdventureTasks} from '../src/modules/things';

it('地点内材料不足仍有范围标记和原因，查询不消耗物品或结算事件',async()=>{
 const app=createAdventureApplication();await app.initialize({seed:'closure-range'});
 const s=structuredClone(app.query().snapshot!) as AdventureSnapshot;
 const gate=s.runtime.map.anchors.find(a=>a.id==='gate')!.position;
 s.runtime.actors[s.playerActorId].position={...gate};s.runtime.visible.push(`${gate.x},${gate.y}`);s.things.inventory.rope=0;
 const before=structuredClone(s),options=bindAdventureChoices(s),rope=options.find(c=>c.anchorId==='gate'&&c.choiceId==='rope');
 expect(rope).toMatchObject({inRange:true,allowed:false,reason:'缺少攀登绳。'});
 expect(options.find(c=>c.anchorId==='notes')).toMatchObject({inRange:false,allowed:false});
 expect(s).toEqual(before);app.dispose();
});

it('主线成功收起未完成支线，恢复归一化不发历史奖励且重复无变化',async()=>{
 const app=createAdventureApplication();await app.initialize({seed:'closure-ending'});
 const s=structuredClone(app.query().snapshot!) as AdventureSnapshot;
 const task=s.things.tasks.find(t=>!t.blueprint.main)!;task.status='active';task.rewarded=false;
 s.story.outcome='success';s.story.ending='已完成主线';
 const inventory=structuredClone(s.things.inventory),gold=s.things.gold;
 closeAdventureTasks(s);expect(task).toMatchObject({status:'abandoned',rewarded:false});expect(task.reason).toContain('旅程结束');
 const closed=structuredClone(s);closeAdventureTasks(s);expect(s).toEqual(closed);expect(s.things.gold).toBe(gold);expect(s.things.inventory).toEqual(inventory);
 app.dispose();
});
