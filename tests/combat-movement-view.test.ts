import {it,expect} from 'vitest';
import {createAdventureApplication} from '../src/application';
it('可移动提示来自运行器，查询不落账，实际移动消耗相同且世界位置不漂移',async()=>{
 const app=createAdventureApplication();await app.initialize({seed:'v030-after-battle-0'});
 const command=(type:string,payload:Record<string,unknown>)=>{const s=app.query().snapshot!;return app.dispatch({commandId:crypto.randomUUID(),runId:s.runId,actorId:s.playerActorId,expectedRevision:s.revision,type,payload});};
 for(const p of app.planRoute({x:2,y:9}))expect(await command('world.move',p)).toMatchObject({ok:true});
 expect(await command('npc.attack',{npcId:'npc-0'})).toMatchObject({ok:true});const before=app.exportSave(),s=app.query().snapshot!,movement=app.queryCombatMovement();
 expect(app.exportSave()).toBe(before);expect(Object.isFrozen(movement)).toBe(true);expect(movement.length).toBeGreaterThan(0);expect(movement.every(p=>p.cost>0&&p.cost<=s.runtime.encounter!.movement)).toBe(true);expect(movement).not.toContainEqual(expect.objectContaining({x:4,y:1}));
 const target=movement.find(p=>p.cost===1)!;expect(await command('combat.action',{action:'move',x:target.x,y:target.y})).toMatchObject({ok:true});const after=app.query().snapshot!;
 expect(after.runtime.encounter!.movement).toBe(s.runtime.encounter!.movement-1);expect(after.runtime.actors[after.playerActorId].position).toEqual(s.runtime.actors[s.playerActorId].position);app.dispose();
});
