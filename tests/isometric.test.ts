import {it,expect} from 'vitest';
import {projectIso,unprojectIso} from '../src/presentation/isometric';
it('2.5D投影和点击逆变换保留格子及不同高度',()=>{for(const height of [0,.5,1,2,3])for(const p of [{x:3,y:3},{x:28,y:16},{x:0,y:19}]){const screen=projectIso(p.x,p.y,height),back=unprojectIso(screen.x,screen.y,height);expect(back.x).toBeCloseTo(p.x);expect(back.y).toBeCloseTo(p.y);}expect(projectIso(1,1,3).y).toBeLessThan(projectIso(1,1).y);});
