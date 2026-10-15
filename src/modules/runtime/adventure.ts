import {recordRoll} from './dice-record';
import type { DiceRollRecord } from '../../contracts/adventure';
import { requireValue, seedHash } from '../../contracts/demo';
import { createRuntime, moveRuntime, revealRuntime, walkDelta, sweepWalk, findAdventureRoute, FREE_MOVEMENT_VERSION, validateRuntime, validateRuntimeAccess, canInteract, type RuntimeState, type RuntimeActor } from './index';
import type { GeneratedCharacter } from '../characters/index';
import type { GeneratedMap, Point } from '../world/index';
import { PROFESSION_VERSION, type ProfessionRuntimeState, type ProfessionSetup } from '../professions/index';
import { configureProfessionActor, validateActorProfession, professionSkillRank, defaultAdventureProfession, tryProfessionBasicAttack, professionBasicAttackCount, professionLineOfSight, type AdventureProfessionInitialization, type ProfessionCombatProfile } from './profession';
export const DND_RULES_VERSION='adventure-dnd/1';
export const ABILITIES=['str','dex','con','int','wis','cha'] as const;
export type Ability=typeof ABILITIES[number];
export type Skill='persuasion'|'deception'|'intimidation'|'insight'|'medicine'|'arcana'|'perception'|'stealth'|'athletics'|'sleight'|'acrobatics'|'history'|'investigation'|'nature'|'religion'|'animalHandling'|'survival'|'performance';
export type Archetype='warden'|'ranger'|'scholar'|'envoy';
export const SKILLS:Record<Skill,{label:string;ability:Ability}>={persuasion:{label:'说服',ability:'cha'},deception:{label:'欺骗',ability:'cha'},intimidation:{label:'威吓',ability:'cha'},insight:{label:'洞察',ability:'wis'},medicine:{label:'医药',ability:'wis'},arcana:{label:'奥秘',ability:'int'},perception:{label:'察觉',ability:'wis'},stealth:{label:'隐匿',ability:'dex'},athletics:{label:'运动',ability:'str'},sleight:{label:'巧手',ability:'dex'},acrobatics:{label:'杂技',ability:'dex'},history:{label:'历史',ability:'int'},investigation:{label:'调查',ability:'int'},nature:{label:'自然',ability:'int'},religion:{label:'宗教',ability:'int'},animalHandling:{label:'驯兽',ability:'wis'},survival:{label:'生存',ability:'wis'},performance:{label:'表演',ability:'cha'}};
export const ARCHETYPES:Record<Archetype,{label:string;scores:number[];skills:Skill[];range:number;hp:number}>={
 warden:{label:'誓约卫士',scores:[16,12,15,10,12,10],skills:['athletics','intimidation','medicine'],range:1,hp:30},
 ranger:{label:'荒野游侠',scores:[12,16,13,10,15,10],skills:['perception','stealth','medicine'],range:3,hp:24},
 scholar:{label:'秘文研究者',scores:[10,12,13,16,14,10],skills:['arcana','insight','sleight'],range:3,hp:22},
 envoy:{label:'行旅使者',scores:[10,14,12,12,13,16],skills:['persuasion','deception','insight'],range:1,hp:24},
};
export interface AdventureActor extends RuntimeActor {abilities:Record<Ability,number>;skills:Skill[];proficiency:number;archetype:Archetype;range:number;profession?:ProfessionRuntimeState;professionCombat?:ProfessionCombatProfile}
export interface CheckResult {id:string;skill:Skill;label:string;dc:number;dice:number[];mode:'normal'|'advantage'|'disadvantage';modifier:number;proficiency:number;total:number;success:boolean;targetId?:string}
export interface Combatant {actorId:string;position:Point;initiative:number}
export interface TacticalBattle {id:string;status:'active'|'victory'|'defeat'|'fled';round:number;participants:Combatant[];rng:number;movement:number;action:boolean;guard:boolean;log:string[];rewarded:boolean;obstacles:Point[];rollSequence?:number;rolls?:DiceRollRecord[]}
export interface VisualCell {height:number;material:'grass'|'stone'|'earth'|'water';prop?:'tree'|'rock'|'wall'}
export interface AdventureRuntime extends Omit<RuntimeState,'battle'> {actors:Record<string,AdventureActor>;checkRng:number;checks:CheckResult[];encounter?:TacticalBattle;visual:Record<string,VisualCell>;doors:Record<string,{point:Point;open:boolean}>;professionVersion?:typeof PROFESSION_VERSION}
export const abilityModifier=(score:number)=>Math.floor((score-10)/2);
export const positionKey=(p:Point)=>`${p.x},${p.y}`;
export const manhattan=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function nextDie(rng:number,sides:number):{rng:number;value:number} {requireValue(Number.isInteger(sides)&&sides>=2&&sides<=100,'INVALID_DIE','骰子面数无效。');const next=(Math.imul(rng,1664525)+1013904223)>>>0;return {rng:next,value:1+Math.floor(next/4294967296*sides)};}
function configure(actor:RuntimeActor,archetype:Archetype):AdventureActor {const c=ARCHETYPES[archetype];return {...actor,abilities:Object.fromEntries(ABILITIES.map((k,i)=>[k,c.scores[i]])) as Record<Ability,number>,skills:[...c.skills],proficiency:2,archetype,range:c.range,hp:c.hp,maxHp:c.hp,defense:10+abilityModifier(c.scores[1])+2,attackBonus:2+Math.max(abilityModifier(c.scores[0]),abilityModifier(c.scores[1]))};}
export function createAdventureRuntime(map:GeneratedMap,player:GeneratedCharacter,npcs:{id:string;profile:GeneratedCharacter;alive:boolean}[],seed:string,archetype:Archetype,visual:Record<string,VisualCell>,npcArchetypes:Record<string,Archetype>={},professions?:AdventureProfessionInitialization):AdventureRuntime {
 const base=createRuntime(map,player,npcs),actors:Record<string,AdventureActor>={};
 for(const actor of Object.values(base.actors)){
  const role=actor.actorId===base.playerActorId?archetype:npcArchetypes[actor.storyNpcId??'']??(['envoy','ranger','warden'] as Archetype[])[seedHash(actor.actorId)%3];
  actors[actor.actorId]=configure(actor,role);
  if(professions){const defaults:Record<Archetype,string>={warden:'paladin',ranger:'ranger',scholar:'wizard',envoy:'bard'};const setup=actor.actorId===base.playerActorId?professions.player:professions.actors?.[actor.storyNpcId??'']??defaultAdventureProfession(defaults[role]);actors[actor.actorId]=configureProfessionActor(actors[actor.actorId],setup);}
  else if(actor.actorId!==base.playerActorId){actors[actor.actorId].hp=actors[actor.actorId].maxHp=12+seedHash(actor.actorId)%5;if(actor.storyNpcId==='npc-0')actors[actor.actorId].hp-=4;}
  if(actor.hp===0)actors[actor.actorId].hp=0;
 }
 const state:AdventureRuntime={...base,movement:FREE_MOVEMENT_VERSION,actors,checkRng:seedHash(seed+':checks'),checks:[],visual:structuredClone(visual),doors:{},...(professions?{professionVersion:PROFESSION_VERSION}:{})};revealRuntime(state);validateAdventureRuntime(state);return state;
}
export function validateAdventureRuntime(s:AdventureRuntime):void {
 requireValue(Number.isInteger(s.map.bounds.width)&&s.map.bounds.width>0&&s.map.bounds.width<=256&&Number.isInteger(s.map.bounds.height)&&s.map.bounds.height>0&&s.map.bounds.height<=256&&s.map.cells.every(row=>row.length===s.map.bounds.width&&row.every(c=>typeof c.walkable==='boolean'&&typeof c.blocksSight==='boolean')),'INVALID_RUNTIME','地图格子结构无效。');
 requireValue(s.map.cells.every((row,y)=>row.every((_,x)=>Boolean(s.visual[`${x},${y}`]))),'INVALID_RUNTIME','地图高差数据缺失。');
 requireValue(s.movement===FREE_MOVEMENT_VERSION,'INVALID_RUNTIME','连续移动协议缺失。');validateRuntime(s);requireValue(Number.isSafeInteger(s.checkRng)&&s.checkRng>=0&&s.checkRng<=0xffffffff&&Array.isArray(s.checks)&&s.checks.length<=1000,'INVALID_RUNTIME','检定状态无效。');
 for(const a of Object.values(s.actors))requireValue(ABILITIES.every(k=>Number.isInteger(a.abilities[k])&&a.abilities[k]>=3&&a.abilities[k]<=20)&&a.skills.every(k=>Object.hasOwn(SKILLS,k))&&a.maxHp>0&&a.maxHp<=(a.profession?1000:100)&&a.range>=1&&a.range<=(a.profession?12:6),'INVALID_RUNTIME','人物属性无效。');
 requireValue(s.professionVersion===undefined||s.professionVersion===PROFESSION_VERSION,'INCOMPATIBLE_PROFESSION','职业目录版本不兼容。');
 for(const actor of Object.values(s.actors)){requireValue(s.professionVersion?Boolean(actor.profession):actor.profession===undefined&&actor.professionCombat===undefined,'INVALID_PROFESSION_ACTOR','职业模式与人物字段不一致。');validateActorProfession(actor);}
 for(const [k,v]of Object.entries(s.visual))requireValue(/^\d+,\d+$/.test(k)&&Number.isFinite(v.height)&&v.height>=0&&v.height<=5&&['grass','stone','earth','water'].includes(v.material),'INVALID_RUNTIME','地形展示数据无效。');
 for(const door of Object.values(s.doors))requireValue(typeof door.open==='boolean'&&s.map.cells[door.point.y]?.[door.point.x]?.walkable===door.open,'INVALID_RUNTIME','道路状态无效。');
 if(s.encounter){const b=s.encounter;requireValue(['active','victory','defeat','fled'].includes(b.status)&&Number.isInteger(b.round)&&b.round>0&&b.participants.length>=2&&b.participants.length<=3&&b.participants[0].actorId===s.playerActorId&&b.movement>=0&&b.movement<=6&&typeof b.action==='boolean','INVALID_BATTLE','战斗状态无效。');const positions=new Set<string>();for(const p of b.participants){requireValue(Boolean(s.actors[p.actorId])&&Number.isInteger(p.position.x)&&Number.isInteger(p.position.y)&&p.position.x>=0&&p.position.x<9&&p.position.y>=0&&p.position.y<7&&(s.actors[p.actorId].hp===0||!positions.has(positionKey(p.position))),'INVALID_BATTLE','战斗位置/身份无效。');if(s.actors[p.actorId].hp>0)positions.add(positionKey(p.position));}requireValue(Number.isSafeInteger(b.rng)&&b.rng>=0&&b.rng<=0xffffffff&&Array.isArray(b.log),'INVALID_BATTLE','战斗随机状态无效。');validateRolls(s,b);}
}
export function moveAdventureRuntime(s:AdventureRuntime,to:Point):AdventureRuntime {requireValue(s.encounter?.status!=='active','WAITING_RESULT','请先完成战斗。');return moveRuntime(s,to) as AdventureRuntime;}
export function walkAdventureRuntime(s:AdventureRuntime,dx:number,dy:number,seconds:number):AdventureRuntime {requireValue(s.encounter?.status!=='active','WAITING_RESULT','请先完成战斗。');requireValue(s.actors[s.playerActorId].hp>0,'RUN_ENDED','角色已经倒下。');const delta=walkDelta(dx,dy,seconds),next=structuredClone(s);next.actors[s.playerActorId].position=sweepWalk(s,delta);revealRuntime(next);validateAdventureRuntime(next);return next;}
export function rollSkill(state:AdventureRuntime,actorId:string,skill:Skill,dc:number,id:string,mode:CheckResult['mode']='normal',targetId?:string):{runtime:AdventureRuntime;result:CheckResult} {
 const next=structuredClone(state),a=next.actors[actorId];requireValue(a&&Object.hasOwn(SKILLS,skill)&&Number.isInteger(dc)&&dc>=1&&dc<=30,'INVALID_CHECK','检定参数无效。');
 requireValue(['normal','advantage','disadvantage'].includes(mode)&&!next.checks.some(c=>c.id===id),'INVALID_CHECK','检定模式/编号无效。');
 const dice:number[]=[];for(let i=0;i<(mode==='normal'?1:2);i++){const d=nextDie(next.checkRng,20);next.checkRng=d.rng;dice.push(d.value);}
 const modifier=abilityModifier(a.abilities[SKILLS[skill].ability]),proficiency=professionSkillRank(a,skill)*a.proficiency;
 const selected=mode==='disadvantage'?Math.min(...dice):Math.max(...dice),total=selected+modifier+proficiency;
 const result:CheckResult={id,skill,label:SKILLS[skill].label,dc,dice,mode,modifier,proficiency,total,success:total>=dc,...(targetId?{targetId}:{})};next.checks.push(result);return {runtime:next,result};
}
export function changeHP(state:AdventureRuntime,actorId:string,amount:number):AdventureRuntime {const next=structuredClone(state),a=next.actors[actorId];requireValue(a&&Number.isSafeInteger(amount)&&Math.abs(amount)<=100,'INVALID_EFFECT','生命效果无效。');a.hp=Math.min(a.maxHp,Math.max(0,a.hp+amount));return next;}
export function setDoor(state:AdventureRuntime,id:string,point:Point,open:boolean):AdventureRuntime {
 const next=structuredClone(state);requireValue(next.map.cells[point.y]?.[point.x]&&typeof open==='boolean','INVALID_EFFECT','通路参数无效。');requireValue(open||!Object.values(next.actors).some(a=>a.hp>0&&manhattan(a.position,point)===0),'BLOCKED','不能在人物脚下关闭道路。');next.map.cells[point.y][point.x].walkable=open;next.map.cells[point.y][point.x].blocksSight=!open;next.doors[id]={point:{...point},open};validateRuntime(next);validateRuntimeAccess(next,next.map.anchors.map(a=>a.id));return next;
}
export function registerAdventureActor(state:AdventureRuntime,npc:{id:string;profile:GeneratedCharacter},nearAnchorId:string,professionSetup?:ProfessionSetup):AdventureRuntime {
 requireValue(!professionSetup||state.professionVersion===PROFESSION_VERSION,'NO_PROFESSION','旧模式不能追加职业配置。');
 const next=structuredClone(state),anchor=next.map.anchors.find(a=>a.id===nearAnchorId);requireValue(anchor&&!next.actors[npc.profile.actorId],'INVALID_BINDING','新增人物锚点或身份无效。');
 const region=next.map.cells[anchor.position.y][anchor.position.x].regionId;
 const points=next.map.cells.flatMap((row,y)=>row.flatMap((cell,x)=>cell.walkable&&cell.regionId===region&&!next.map.anchors.some(a=>a.position.x===x&&a.position.y===y)&&!Object.values(next.actors).some(a=>a.hp>0&&a.position.x===x&&a.position.y===y)?[{x,y}]:[])).sort((a,b)=>manhattan(a,anchor.position)-manhattan(b,anchor.position));
 for(const position of points){const actor=configure({actorId:npc.profile.actorId,storyNpcId:npc.id,profile:structuredClone(npc.profile),hp:12,maxHp:12,attackBonus:2,defense:12,damageDie:6,position},'scholar');next.actors[actor.actorId]=next.professionVersion?configureProfessionActor(actor,professionSetup??defaultAdventureProfession('wizard')):actor;try{validateRuntime(next);validateRuntimeAccess(next,next.map.anchors.map(a=>a.id));return next;}catch{delete next.actors[actor.actorId];}}
 throw Error('备用地点没有安全可交互的人物落点。');
}
function battleDie(b:TacticalBattle,sides:number):number {const r=nextDie(b.rng,sides);b.rng=r.rng;return r.value;}
function playerTurn(b:TacticalBattle,professionMode=false){if(professionMode){b.movement=4;b.action=true;b.guard=false;b.log.push(`第 ${b.round} 回合：移动固定4格，行动 1。`);return;}const die=battleDie(b,4);b.movement=die+2;recordRoll(b,{kind:'movement',actorId:b.participants[0].actorId,sides:4,dice:[die],bonus:2,total:b.movement});b.action=true;b.guard=false;b.log.push(`第 ${b.round} 回合：移动 d4+2 = ${b.movement}，行动 1。`);}
function enemyTurn(s:AdventureRuntime,phase: 'all'|'before'|'after'='all'):void {
 const b=s.encounter!,player=s.actors[s.playerActorId],pc=b.participants[0];
 for(const enemy of [...b.participants.slice(1)].sort((a,c)=>c.initiative-a.initiative)){
  const actor=s.actors[enemy.actorId];if(actor.hp===0||(phase==='before'&&enemy.initiative<=pc.initiative)||(phase==='after'&&enemy.initiative>pc.initiative))continue;
  for(let i=0;i<(actor.profession?4:3)&&manhattan(enemy.position,pc.position)>actor.range;i++){
   const p=enemy.position;const candidates=[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}].filter(q=>q.x>=0&&q.x<9&&q.y>=0&&q.y<7&&!b.obstacles.some(o=>manhattan(o,q)===0)&&!b.participants.some(c=>s.actors[c.actorId].hp>0&&manhattan(c.position,q)===0)).sort((a,c)=>manhattan(a,pc.position)-manhattan(c,pc.position));if(candidates[0]&&manhattan(candidates[0],pc.position)<manhattan(p,pc.position))enemy.position=candidates[0];else break;
  }
  if(manhattan(enemy.position,pc.position)<=actor.range){for(let hit=0;hit<professionBasicAttackCount(actor)&&player.hp>0;hit++)strike(s,actor,player,b.guard?2:0);}else b.log.push(`${actor.profile.name}调整站位。`);
  if(player.hp===0){b.status='defeat';b.log.push('你倒下了，冒险结束。');break;}
 }
}
function strike(s:AdventureRuntime,a:AdventureActor,target:AdventureActor,guard=0):void {
 const b=s.encounter!;if(a.profession){if(!professionLineOfSight(s,a.actorId,target.actorId)){b.log.push(`${a.profile.name}的视线被障碍阻挡。`);return;}if(tryProfessionBasicAttack(s,a.actorId,target.actorId))return;}
 const d=battleDie(b,20),total=d+a.attackBonus,ac=target.defense+guard;
 const success=d!==1&&(d===20||total>=ac);recordRoll(b,{kind:'attack',actorId:a.actorId,targetId:target.actorId,sides:20,dice:[d],bonus:a.attackBonus,total,threshold:ac,success,critical:d===20});
 if(!success){b.log.push(`${a.profile.name}命中检定 d20 ${d} + ${a.attackBonus} = ${total} / AC ${ac}：未命中。`);return;}
 const sides=(a.profession?a.damageDie:6) as DiceRollRecord['sides'],dice=[battleDie(b,sides)];if(d===20)dice.push(battleDie(b,sides));const mod=abilityModifier(a.abilities[a.professionCombat?.attackAbility??(a.range>1?'dex':'str')]),bonus=a.profession?mod:Math.max(1,mod),minimum=a.profession?0:1,damage=Math.max(minimum,dice.reduce((n,v)=>n+v,0)+bonus);recordRoll(b,{kind:'damage',actorId:a.actorId,targetId:target.actorId,sides,dice,bonus,total:damage,critical:d===20,minimum});target.hp=Math.max(0,target.hp-damage);b.log.push(`${a.profile.name} d20 ${d} + ${a.attackBonus} / AC ${ac}：${d===20?'重击，':''}${damage}伤害。`);
}
export function beginEncounter(state:AdventureRuntime,enemyIds:string[],id:string,seed:string):AdventureRuntime {
 requireValue(state.encounter?.status!=='active'&&enemyIds.length>=1&&enemyIds.length<=2&&new Set(enemyIds).size===enemyIds.length,'INVALID_BATTLE','遭遇参数无效。');
 for(const enemyId of enemyIds)requireValue(state.actors[enemyId]?.hp>0&&enemyId!==state.playerActorId,'INVALID_TARGET','敌人已经离场。');
 requireValue(canInteract(state,state.actors[enemyIds[0]].position),'OUT_OF_RANGE','靠近人物后才能进入战斗。');
 const next=structuredClone(state);next.combatSequence++;const b:TacticalBattle={id,status:'active',round:1,participants:[],rng:seedHash(seed+':combat:'+next.combatSequence),movement:0,action:false,guard:false,log:[],rewarded:false,rollSequence:0,rolls:[],obstacles:[{x:4,y:1},{x:4,y:5}]};next.encounter=b;
 for(const [i,actorId]of [next.playerActorId,...enemyIds].entries()){const a=next.actors[actorId],die=battleDie(b,20),initiative=die+abilityModifier(a.abilities.dex);recordRoll(b,{kind:'initiative',actorId,sides:20,dice:[die],bonus:abilityModifier(a.abilities.dex),total:initiative});b.participants.push({actorId,position:i===0?{x:1,y:3}:{x:6,y:i===1?3:4},initiative});b.log.push(`${a.profile.name}先攻 d20 ${die} + ${abilityModifier(a.abilities.dex)} = ${initiative}。`);}
 if(b.participants.slice(1).some(e=>e.initiative>b.participants[0].initiative))enemyTurn(next,'before');
 if(b.status==='active')playerTurn(b,Boolean(next.professionVersion));return next;
}
export function combatReachable(s:AdventureRuntime,to:Point):number|null {
 const b=s.encounter!;const from=b.participants[0].position,queue:[Point,number][]=[[from,0]],seen=new Set([positionKey(from)]);
 for(let i=0;i<queue.length;i++){const [p,n]=queue[i];if(manhattan(p,to)===0)return n;if(n>=b.movement)continue;for(const q of [{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}])if(q.x>=0&&q.x<9&&q.y>=0&&q.y<7&&!seen.has(positionKey(q))&&!b.obstacles.some(o=>manhattan(o,q)===0)&&!b.participants.slice(1).some(c=>s.actors[c.actorId].hp>0&&manhattan(c.position,q)===0)){seen.add(positionKey(q));queue.push([q,n+1]);}}
 return null;
}
export function tacticalAction(state:AdventureRuntime,action:'move'|'attack'|'defend'|'end'|'flee'|'use',target?:string|Point):AdventureRuntime {
 const next=structuredClone(state),b=next.encounter;requireValue(b?.status==='active','NO_BATTLE','当前没有战斗。');
 if(action==='move'){requireValue(target&&typeof target==='object'&&Number.isInteger(target.x)&&Number.isInteger(target.y),'INVALID_TARGET','移动坐标无效。');const cost=combatReachable(next,target);requireValue(cost!==null&&cost>0&&cost<=b.movement,'INVALID_TARGET','超出本回合可移动范围。');b.participants[0].position={...target};b.movement-=cost;return next;}
 if(action==='end'){enemyTurn(next,'after');if(b.status==='active'){b.round++;enemyTurn(next,'before');if(b.status==='active')playerTurn(b,Boolean(next.professionVersion));}return next;}
 if(action==='flee'){requireValue(b.action,'NO_ACTION','本回合行动已用完。');const die=battleDie(b,20),bonus=abilityModifier(next.actors[next.playerActorId].abilities.dex)+(next.professionVersion?next.actors[next.playerActorId].proficiency:2);recordRoll(b,{kind:'escape',actorId:next.playerActorId,sides:20,dice:[die],bonus,total:die+bonus,threshold:10,success:die+bonus>=10});b.action=false;if(die+bonus>=10){b.status='fled';b.log.push(`逃离 d20 ${die} + ${bonus} ≥ 10，成功。`);}else b.log.push(`逃离 d20 ${die} + ${bonus} < 10，失败，可结束回合再尝试。`);return next;}
 requireValue(b.action,'NO_ACTION','本回合行动已用完。');
 if(action==='defend'){b.guard=true;b.log.push('防御姿态：本轮敌方攻击 AC +2。');}
 else if(action==='attack'){requireValue(typeof target==='string','INVALID_TARGET','请选择攻击目标。');const enemy=b.participants.slice(1).find(p=>p.actorId===target),actor=next.actors[next.playerActorId];requireValue(enemy&&next.actors[target].hp>0&&manhattan(enemy.position,b.participants[0].position)<=actor.range,'OUT_OF_RANGE','目标超出武器范围。');requireValue(!actor.profession||professionLineOfSight(next,actor.actorId,target),'OUT_OF_RANGE','攻击视线被阻挡。');for(let hit=0;hit<professionBasicAttackCount(actor)&&next.actors[target].hp>0;hit++)strike(next,actor,next.actors[target]);if(b.participants.slice(1).every(p=>next.actors[p.actorId].hp===0)){b.status='victory';b.log.push('战斗胜利。');}}
 else if(action==='use')b.log.push('使用消耗品，消耗本回合行动。');else requireValue(false,'INVALID_COMMAND','未知战斗动作。');b.action=false;return next;
}

function validateRolls(s:AdventureRuntime,b:TacticalBattle):void {
 if(b.rollSequence===undefined&&b.rolls===undefined)return; // old saves
 requireValue(Number.isSafeInteger(b.rollSequence)&&b.rollSequence!>=0&&Array.isArray(b.rolls)&&b.rolls.length===Math.min(60,b.rollSequence!),'INVALID_BATTLE','骰子记录无效。');
 requireValue(!b.rolls!.length||b.rolls!.at(-1)!.sequence===b.rollSequence,'INVALID_BATTLE','骰子序列不完整。');
 let sequence=0;
 for(const r of b.rolls!){
  requireValue(r&&['initiative','movement','attack','damage','escape','save','healing'].includes(r.kind)&&Number.isSafeInteger(r.sequence)&&r.sequence>sequence&&r.sequence<=b.rollSequence!&&r.id===`${b.id}:roll:${r.sequence}`&&b.participants.some(p=>p.actorId===r.actorId)&&(!r.targetId||b.participants.some(p=>p.actorId===r.targetId)),'INVALID_BATTLE','骰子身份无效。');sequence=r.sequence;
  const amount=r.kind==='damage'||r.kind==='healing',sides=amount?r.sides:r.kind==='movement'?4:20;
  requireValue([4,6,8,10,12,20].includes(sides)&&r.sides===sides&&Array.isArray(r.dice)&&(amount?r.dice.length>=1&&r.dice.length<=24:r.dice.length===1)&&r.dice.every(d=>Number.isInteger(d)&&d>=1&&d<=sides)&&Number.isSafeInteger(r.bonus)&&Math.abs(r.bonus)<=100&&(r.minimum===undefined||r.minimum===0||r.minimum===1)&&r.total===(amount?Math.max(r.minimum??(r.kind==='healing'?1:1),r.dice.reduce((n,v)=>n+v,0)+r.bonus):r.dice.reduce((n,v)=>n+v,0)+r.bonus),'INVALID_BATTLE','骰子点数无效。');
  if(r.kind==='attack'||r.kind==='escape'||r.kind==='save'){
   requireValue(Number.isSafeInteger(r.threshold)&&r.threshold!>=1&&r.threshold!<=100&&typeof r.success==='boolean'&&r.success===(r.kind==='attack'?r.dice[0]!==1&&(r.dice[0]===20||r.total>=r.threshold!):r.total>=r.threshold!),'INVALID_BATTLE','骰子结论无效。');
  }
  if(r.kind==='attack')requireValue(r.critical===(r.dice[0]===20)&&Boolean(r.targetId),'INVALID_BATTLE','重击记录无效。');
 }
}
