import type { GeneratedMap, Point } from '../world/index';
import type { GeneratedCharacter } from '../characters/index';
import { requireValue, seedHash } from '../../contracts/demo';
export interface RuntimeActor {
  actorId:string; storyNpcId?:string; profile:GeneratedCharacter;
  hp:number; maxHp:number; attackBonus:number; defense:number; damageDie:number;
  position:Point;
}
export interface BattleState {
  requestId:string; enemyActorId:string; status:'active'|'victory'|'defeat'|'fled';
  round:number; playerPosition:Point; enemyPosition:Point; guarded:boolean;
  rng:number; log:string[];
}
export interface RuntimeState {
  map:GeneratedMap; playerActorId:string; actors:Record<string,RuntimeActor>;
  visible:string[]; explored:string[]; visitedAnchorIds:string[];
  battle?:BattleState; combatSequence:number;
}
const key=(p:Point)=>`${p.x},${p.y}`;
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function anchor(map:GeneratedMap,id:string):Point {
  const a=map.anchors.find(a=>a.id===id); requireValue(a,'INVALID_BINDING','缺少所需地图锚点。');return a.position;
}
export function getAnchorPosition(state:RuntimeState,id:string):Point { return {...anchor(state.map,id)}; }
export function canInteract(state:RuntimeState,point:Point,radius=1):boolean {
  return state.visible.includes(key(point)) && distance(state.actors[state.playerActorId].position,point)<=radius;
}
function sight(map:GeneratedMap,a:Point,b:Point):boolean {
  let x=a.x,y=a.y;const dx=Math.abs(b.x-x),dy=Math.abs(b.y-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1;let err=dx-dy;
  while(x!==b.x||y!==b.y){
    const e=2*err;if(e>-dy){err-=dy;x+=sx;}if(e<dx){err+=dx;y+=sy;}
    if(x===b.x&&y===b.y)return true;
    if(map.cells[y]?.[x]?.blocksSight)return false;
  }return true;
}
function reveal(state:RuntimeState):void {
  const p=state.actors[state.playerActorId].position,visible:string[]=[];
  for(let y=Math.max(0,p.y-5);y<=Math.min(state.map.bounds.height-1,p.y+5);y++)
    for(let x=Math.max(0,p.x-5);x<=Math.min(state.map.bounds.width-1,p.x+5);x++)
      if(distance(p,{x,y})<=5&&sight(state.map,p,{x,y}))visible.push(key({x,y}));
  state.visible=visible;state.explored=[...new Set([...state.explored,...visible])].sort();
  for(const a of state.map.anchors)if(distance(a.position,p)===0&&!state.visitedAnchorIds.includes(a.id))state.visitedAnchorIds.push(a.id);
}
export function createRuntime(map:GeneratedMap,player:GeneratedCharacter,npcs:{id:string;profile:GeneratedCharacter;alive:boolean}[]):RuntimeState {
  const actors:Record<string,RuntimeActor>={};
  const register=(profile:GeneratedCharacter,position:Point,storyNpcId?:string,alive=true)=>{
    requireValue(!actors[profile.actorId], 'INVALID_BINDING','人物实例编号重复。');
    actors[profile.actorId]={actorId:profile.actorId,storyNpcId,profile:structuredClone(profile),hp:alive?(profile.control==='player'?20:8):0,maxHp:profile.control==='player'?20:8,attackBonus:profile.control==='player'?4:2,defense:profile.control==='player'?12:10,damageDie:6,position:{...position}};
  };
  register(player,anchor(map,'spawn'));
  for(const npc of npcs){const place=map.placements.find(p=>p.entityRef===npc.id);requireValue(place,'INVALID_BINDING','人物缺少地图落点。');register(npc.profile,place.position,npc.id,npc.alive);}
  const state:RuntimeState={map:structuredClone(map),playerActorId:player.actorId,actors,visible:[],explored:[],visitedAnchorIds:[],combatSequence:0};
  reveal(state);validateRuntime(state);return state;
}
export function validateRuntime(state:RuntimeState):void {
  requireValue(state.map.bounds.width===state.map.cells[0]?.length&&state.map.bounds.height===state.map.cells.length,'INVARIANT_VIOLATION','地图尺寸与格子不一致。');
  requireValue(state.actors[state.playerActorId]?.profile.control==='player','INVARIANT_VIOLATION','玩家身份无效。');
  for(const [id,a]of Object.entries(state.actors)){
    requireValue(id===a.actorId&&a.profile.actorId===id&&Number.isInteger(a.hp)&&a.hp>=0&&a.hp<=a.maxHp,'INVARIANT_VIOLATION','人物状态无效。');
    requireValue(Number.isInteger(a.position.x)&&Number.isInteger(a.position.y)&&state.map.cells[a.position.y]?.[a.position.x]?.walkable,'INVARIANT_VIOLATION','人物位置无效。');
  }
}
export function moveRuntime(state:RuntimeState,to:Point):RuntimeState {
  requireValue(!state.battle||state.battle.status!=='active','WAITING_RESULT','请先完成战斗。');
  const player=state.actors[state.playerActorId];
  requireValue(player.hp>0,'RUN_ENDED','角色已经倒下。');
  requireValue(Number.isInteger(to.x)&&Number.isInteger(to.y)&&distance(player.position,to)===1,'INVALID_TARGET','每次只能向相邻格移动。');
  requireValue(state.map.cells[to.y]?.[to.x]?.walkable,'BLOCKED','该位置不可通行。');
  requireValue(!Object.values(state.actors).some(a=>a.actorId!==player.actorId&&a.hp>0&&distance(a.position,to)===0),'BLOCKED','人物占据该位置，请从旁边交互。');
  const next=structuredClone(state);next.actors[player.actorId].position={...to};reveal(next);validateRuntime(next);return next;
}
export function startBattle(state:RuntimeState,enemyActorId:string,requestId:string,seed:string):RuntimeState {
  requireValue(!state.battle||state.battle.status!=='active','WAITING_RESULT','已经存在进行中的战斗。');
  const enemy=state.actors[enemyActorId];requireValue(enemy&&enemy.hp>0&&enemyActorId!==state.playerActorId&&canInteract(state,enemy.position),'INVALID_TARGET','目标不在可交互范围内。');
  const next=structuredClone(state);next.combatSequence++;next.battle={requestId,enemyActorId,status:'active',round:1,playerPosition:{x:1,y:2},enemyPosition:{x:5,y:2},guarded:false,rng:seedHash(seed+':combat:'+enemyActorId+':'+next.combatSequence),log:['战斗开始。每回合移动一格、攻击或防御，然后对方行动。']};return next;
}
function roll(b:BattleState,sides:number):number { b.rng=(Math.imul(b.rng,1664525)+1013904223)>>>0;return 1+Math.floor(b.rng/4294967296*sides); }
function hit(state:RuntimeState,attacker:RuntimeActor,target:RuntimeActor,defense:number):void {
  const b=state.battle!,d=roll(b,20),total=d+attacker.attackBonus;
  if(d===1||(d!==20&&total<defense)){b.log.push(`${attacker.profile.name}：d20=${d}，总值${total}，未命中防御${defense}。`);return;}
  const damage=roll(b,attacker.damageDie)+1;target.hp=Math.max(0,target.hp-damage);
  b.log.push(`${attacker.profile.name}：d20=${d}，总值${total}，命中并造成${damage}伤害。`);
}
export function battleAction(state:RuntimeState,action:'attack'|'defend'|'flee'|'move',to?:Point):RuntimeState {
  const next=structuredClone(state),b=next.battle;
  requireValue(b&&b.status==='active','NO_BATTLE','当前没有进行中的战斗。');
  const player=next.actors[next.playerActorId],enemy=next.actors[b.enemyActorId];
  if(action==='flee'){b.status='fled';b.log.push('你脱离战斗。');return next;}
  if(action==='move'){
    requireValue(to&&Number.isInteger(to.x)&&Number.isInteger(to.y)&&to.x>=0&&to.x<7&&to.y>=0&&to.y<5&&distance(to,b.playerPosition)===1&&distance(to,b.enemyPosition)>0,'INVALID_TARGET','战斗中只能移动到相邻空格。');
    b.playerPosition={...to};b.log.push('你调整了站位。');
  }else if(action==='attack'){
    requireValue(distance(b.playerPosition,b.enemyPosition)===1,'OUT_OF_RANGE','靠近敌人后才能攻击。');hit(next,player,enemy,enemy.defense);
  }else if(action==='defend'){b.guarded=true;b.log.push('你采取防御，本次对方攻击的防御门槛提高2。');}
  else requireValue(false,'INVALID_COMMAND','未知战斗行动。');
  if(enemy.hp===0){b.status='victory';b.log.push('对方倒下，战斗胜利。');return next;}
  if(distance(b.playerPosition,b.enemyPosition)>1){
    const p=b.enemyPosition,options=[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}].filter(p=>p.x>=0&&p.x<7&&p.y>=0&&p.y<5&&distance(p,b.playerPosition)>0);
    options.sort((a,c)=>distance(a,b.playerPosition)-distance(c,b.playerPosition));b.enemyPosition=options[0];b.log.push('对方向你靠近。');
  }else hit(next,enemy,player,player.defense+(b.guarded?2:0));
  b.guarded=false;b.round++;
  if(player.hp===0){b.status='defeat';b.log.push('你倒下了。');}
  validateRuntime(next);return next;
}
