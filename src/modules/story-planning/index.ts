import catalog from '../../../content/story/catalog.json';
export type Status = 'active'|'success'|'failed'|'abandoned'|'expired';
export interface NPC { id:string; name:string; role:string; trait:string; alive:boolean; location:string; trust:number; goal:string; event:string; response:string; knowledge:string[] }
export interface Quest { id:string; title:string; status:Status; reason:string; dependencies:string[] }
export interface Option { id:string; category:string; text:string; cost:number; dependencies:string[]; external?:'combat' }
export interface World { version:1; seed:string; rng:number; revision:number; time:number; deadline:number; background:{text:string; tags:string[]}; goal:string; location:string; accessible:boolean; npcs:NPC[]; conflict:{id:string; need:string; reason:string; obstacle:string}; gold:number; clue:boolean; resource:boolean; notes:boolean; quests:Quest[]; history:{id:string; time:number; text:string}[]; processed:string[]; mapRequest:{region:string; tags:string[]; npcIds:string[]}; ending:string }
export type Change = {kind:'npc-death';npcId:string}|{kind:'time';hours:number}|{kind:'access';accessible:boolean}|{kind:'resource';available:boolean}|{kind:'notes';available:boolean};
function random(w:{rng:number}) { w.rng=(Math.imul(w.rng,1664525)+1013904223)>>>0;return w.rng/4294967296; }
function pick<T>(w:{rng:number},xs:T[]):T{return xs[Math.floor(random(w)*xs.length)];}
function hash(seed:string){let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function log(w:World,id:string,text:string){w.history.push({id,time:w.time,text});}
function reconcile(w:World){
 const side=w.quests[1];if(side.status==='active'){
  if(w.resource){side.status='success';side.reason='所需物资已取得';}
  else if(!w.npcs[0].alive){side.status='failed';side.reason='委托人死亡，原委托终止';}
  else if(w.time>=w.deadline){side.status='expired';side.reason='错过期限，冲突留下持续影响';w.npcs[1].response='期限已过，我们必须面对损失。';}
 }
 const main=w.quests[0];if(main.status==='active'&&!w.clue&&!w.notes&&!w.npcs.some(n=>n.alive&&n.knowledge.includes('主线线索'))){main.status='failed';main.reason='现存线索全部失去';}
 if(main.status!=='active')w.ending=main.status==='success'?`你完成了目标：${w.goal}。`:`旅程结束：${main.reason}`;
}
export function initializeStory(seed:string,background?:{text:string;tags:string[]}):World {
 if(!seed.trim())throw Error('种子不能为空');const r={rng:hash(seed)},c=pick(r,catalog.conflicts),location=pick(r,catalog.places);
 const names=[...catalog.names];const npcs=Array.from({length:3},(_,i)=>{const name=pick(r,names);names.splice(names.indexOf(name),1);return {id:`npc-${i}`,name,role:pick(r,catalog.roles),trait:pick(r,catalog.traits),alive:true,location,trust:0,goal:i===0?`取得${c.need}`:i===1?'保护村民':'研究古老历史',event:c.reason,response:pick(r,['请求交换条件','请求玩家协助','暂时保持观望']),knowledge:i===0||i===2?['主线线索']:[]};});
 const w:World={version:1,seed,rng:r.rng,revision:0,time:0,deadline:12+Math.floor(random(r)*12),background:background??{text:pick(r,catalog.backgrounds),tags:[]},goal:c.goal,location,accessible:true,npcs,conflict:c,gold:12,clue:false,resource:false,notes:true,quests:[{id:'main',title:c.goal,status:'active',reason:'',dependencies:['clue','notes',...npcs.map(n=>`${n.id}.alive`)]},{id:'side',title:`为${npcs[0].name}取得${c.need}`,status:'active',reason:'',dependencies:['npc-0.alive','resource','time']}],history:[],processed:[],mapRequest:{region:location,tags:c.tags,npcIds:npcs.map(n=>n.id)},ending:''};w.rng=r.rng;
 log(w,'init',`你以${w.background.text}的身份来到${location}。${c.reason}；${npcs[0].name}需要${c.need}，但${c.obstacle}。你的长线目标是${c.goal}。`);return w;
}
export function storyOptions(w:World):Option[]{
 if(w.ending)return [];const out:Option[]=[];const add=(id:string,category:string,text:string,cost:number,dependencies:string[],external?:'combat')=>out.push({id,category,text,cost,dependencies,external});
 for(const n of w.npcs.filter(n=>n.alive&&n.location===w.location)){
  add(`ask:${n.id}`,'交流',`询问${n.name}的经历与线索`,1,[`${n.id}.alive`,`${n.id}.location`]);
  add(`comfort:${n.id}`,'交流',`安慰${n.name}，建立信任`,1,[`${n.id}.alive`]);
  add(`threat:${n.id}`,'交流',`威胁${n.name}交出信息`,1,[`${n.id}.alive`]);
  add(`attack:${n.id}`,'干预',`攻击${n.name}（交由战斗结算）`,1,[`${n.id}.alive`],'combat');
 }
 if(!w.clue&&w.notes)add('notes','调查','研究已经存在的笔记',2,['notes']);
 if(!w.resource&&w.accessible){add('search','调查',`冒险搜寻${w.conflict.need}`,3,['accessible','resource']);if(w.gold>=5)add('buy','交易',`支付5金币取得${w.conflict.need}`,1,['gold','accessible','resource']);}
 if(w.clue&&w.resource&&w.accessible)add('resolve','主线',`前往目标地点完成：${w.goal}`,3,['clue','resource','accessible']);
 if(w.quests[1].status==='active')add('decline','退出','拒绝当前委托',0,['side.status']);
 add('wait','时间','等待3小时，观察局势',3,['time']);add('leave','退出','离开并结束本次旅程',0,['main.status']);return out;
}
export function receiveWorldChange(state:World,id:string,change:Change):World{
 if(!id)throw Error('结果编号不能为空');if(state.processed.includes(id))return structuredClone(state);
 const w=structuredClone(state);if(change.kind==='npc-death'){const n=w.npcs.find(n=>n.id===change.npcId);if(!n)throw Error('人物不存在');n.alive=false;log(w,id,`${n.name}死亡，互动和委托重新检查。`);}
 else if(change.kind==='time'){if(!Number.isFinite(change.hours)||change.hours<0)throw Error('时间必须是非负有限数');w.time+=change.hours;log(w,id,`世界时间推进${change.hours}小时。`);}
 else if(change.kind==='access'){w.accessible=change.accessible;log(w,id,w.accessible?'目标地点恢复通行。':'目标地点无法通行，相关行动失效。');}
 else if(change.kind==='resource'){w.resource=change.available;log(w,id,'任务物资状态发生变化。');}
 else {w.notes=change.available;log(w,id,'既存笔记状态发生变化。');}
 w.processed.push(id);w.revision++;reconcile(w);return w;
}
export function processPlayerAction(state:World,command:{id:string;revision:number;optionId:string}):{world:World;request?:{kind:'combat';targetId:string;commandId:string}}{
 if(!command.id)throw Error('行动编号不能为空');if(state.processed.includes(command.id))return {world:structuredClone(state)};
 if(command.revision!==state.revision)throw Error('选项已经过期，请重新选择');const o=storyOptions(state).find(o=>o.id===command.optionId);if(!o)throw Error('当前行动不可用');
 if(o.external)return {world:structuredClone(state),request:{kind:'combat',targetId:o.id.split(':')[1],commandId:command.id}};
 const w=structuredClone(state);const [verb,target]=o.id.split(':'),n=w.npcs.find(n=>n.id===target);let result=o.text;
 if(n){if(verb==='comfort'){n.trust++;result+=`；${n.name}的信任提高。`;}else if(verb==='threat'){n.trust-=2;if(n.knowledge.length&&random(w)>.5){w.clue=true;result+='；对方透露了线索。';}else result+='；对方拒绝合作。';}else{result+=`；${n.name}是${n.trait}的${n.role}，希望${n.goal}。`;if(n.knowledge.length){w.clue=true;result+='你获得了目标线索。';}}}
 else if(verb==='notes'){w.clue=true;result+='；你找到目标地点的记录。';}
 else if(verb==='buy'){w.gold-=5;w.resource=true;}
 else if(verb==='search'){w.resource=random(w)>.35;result+=w.resource?'；你取得所需物资。':'；搜寻失败，仍可尝试其他办法。';}
 else if(verb==='resolve'){w.quests[0].status='success';w.quests[0].reason='线索、物资和通行条件齐备，完成目标';}
 else if(verb==='decline'){w.quests[1].status='abandoned';w.quests[1].reason='玩家拒绝';}
 else if(verb==='leave'){for(const q of w.quests.filter(q=>q.status==='active')){q.status='abandoned';q.reason='玩家离开';}}
 w.time+=o.cost;w.revision++;w.processed.push(command.id);log(w,command.id,result);reconcile(w);return {world:w};
}
