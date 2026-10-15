import type {AdventureSnapshot} from './adventure-application';
import type {DeepReadonly} from '../contracts';
import {ADVENTURE_ITEMS} from '../modules/things';
export const DICE_FEEDBACK_VERSION='dice-feedback/1';
export interface DiceFeedback {
 id:string;kind:'skill'|'initiative'|'movement'|'attack'|'damage'|'escape';label:string;actorName:string;
 sides:4|6|20;dice:number[];mode:'normal'|'advantage'|'disadvantage';bonuses:{label:string;value:number}[];
 total:number;threshold?:{label:'DC'|'AC';value:number};success?:boolean;critical?:boolean;targetName?:string;consequences:string[];
}
type Snapshot=DeepReadonly<AdventureSnapshot>;
const signed=(n:number)=>n>0?`+${n}`:`${n}`;
/** Only committed snapshot differences, once per command, not predicted effects. */
export function diceConsequences(before:Snapshot,after:Snapshot):string[]{
 const out:string[]=[];
 if(after.things.gold!==before.things.gold)out.push(`金币 ${signed(after.things.gold-before.things.gold)}`);
 for(const item of ADVENTURE_ITEMS){const n=(after.things.inventory[item.id]??0)-(before.things.inventory[item.id]??0);if(n)out.push(`${item.name} ${signed(n)}`);}
 for(const a of Object.values(after.runtime.actors)){const old=before.runtime.actors[a.actorId];if(old&&old.hp!==a.hp)out.push(`${a.profile.name} 生命 ${signed(a.hp-old.hp)} → ${a.hp}/${a.maxHp}`);}
 for(const n of after.story.npcs){const old=before.story.npcs.find(x=>x.id===n.id);if(!old)out.push(`${n.name} 加入旅程`);else if(n.trust!==old.trust)out.push(`${n.name} 信任 ${signed(n.trust-old.trust)}`);}
 for(const q of after.things.tasks){const old=before.things.tasks.find(x=>x.blueprint.id===q.blueprint.id);if(!old)out.push(`新增目标：${q.blueprint.title}`);else if(old.status!==q.status)out.push(`${q.blueprint.title}：${({active:'进行中',success:'已完成',failed:'失败',abandoned:'已放弃'} as const)[q.status]}`);}
 for(const [id,door]of Object.entries(after.runtime.doors))if(before.runtime.doors[id]?.open!==door.open)out.push(door.open?'道路已打开':'道路已关闭');
 if(after.things.followups.some(id=>!before.things.followups.includes(id)))out.push('后续事件已开启');
 if(before.status!==after.status&&after.status==='ended')out.push(after.story.ending);
 const battle=after.runtime.encounter;if(battle&&battle.status!=='active'&&(before.runtime.encounter?.id!==battle.id||before.runtime.encounter.status!==battle.status))out.push(({victory:'战斗胜利',defeat:'战斗失败',fled:'成功脱离战斗'} as const)[battle.status]);
 return out;
}
export function collectDiceFeedback(before:Snapshot,after:Snapshot):DiceFeedback[]{
 if(before.runId!==after.runId||before.adventureId!==after.adventureId||after.revision<=before.revision)return [];
 const frames:DiceFeedback[]=[],name=(id:string)=>after.runtime.actors[id]?.profile.name??after.story.npcs.find(n=>n.id===id)?.name??'人物';
 for(const c of after.runtime.checks)if(!before.runtime.checks.some(old=>old.id===c.id))frames.push({id:c.id,kind:'skill',label:c.label,actorName:name(after.playerActorId),sides:20,dice:[...c.dice],mode:c.mode,bonuses:[{label:'属性',value:c.modifier},{label:'熟练',value:c.proficiency}],total:c.total,threshold:{label:'DC',value:c.dc},success:c.success,targetName:c.targetId?name(c.targetId):undefined,consequences:[]});
 const b=after.runtime.encounter,old=before.runtime.encounter,sequence=old?.id===b?.id?old?.rollSequence??0:0;
 for(const r of b?.rolls??[])if(r.sequence>sequence)frames.push({id:r.id,kind:r.kind,label:({initiative:'先攻',movement:'移动',attack:'命中检定',damage:'伤害',escape:'逃离检定'} as const)[r.kind],actorName:name(r.actorId),sides:r.sides,dice:[...r.dice],mode:'normal',bonuses:[{label:r.kind==='movement'?'移动加值':r.kind==='damage'?'伤害加值':'加值',value:r.bonus}],total:r.total,threshold:r.threshold===undefined?undefined:{label:r.kind==='attack'?'AC':'DC',value:r.threshold},success:r.success,critical:r.critical,targetName:r.targetId?name(r.targetId):undefined,consequences:[]});
 if(frames.length)frames[frames.length-1].consequences=diceConsequences(before,after);
 return frames;
}
