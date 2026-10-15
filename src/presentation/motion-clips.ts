import type { Action, Weapon, Spell } from '../application/character-motion';
export interface RigPose { body:number;head:number;turn:number;y:number;x:number;leftArm:number;rightArm:number;leftElbow:number;rightElbow:number;leftLeg:number;rightLeg:number;leftKnee:number;rightKnee:number;cloth:number }
const neutral:RigPose={body:0,head:0,turn:0,y:0,x:0,leftArm:5,rightArm:-5,leftElbow:0,rightElbow:0,leftLeg:0,rightLeg:0,leftKnee:0,rightKnee:0,cloth:0};
type PosePatch=Partial<RigPose>;
export const WEAPON_POSES:Record<Weapon,[PosePatch,PosePatch,PosePatch]>={
  unarmed:[{rightArm:-65,rightElbow:-70,leftArm:35},{rightArm:-115,rightElbow:20,body:14},{rightArm:-40,rightElbow:-35}],
  dagger:[{rightArm:25,rightElbow:-80,body:-8},{rightArm:-100,rightElbow:-15,body:15},{rightArm:-30,rightElbow:-45}],
  sword:[{rightArm:-155,rightElbow:-35,body:-15},{rightArm:-45,rightElbow:-25,body:20},{rightArm:-10,rightElbow:-20}],
  greatsword:[{rightArm:-160,leftArm:125,rightElbow:-30,leftElbow:30,body:-18},{rightArm:-40,leftArm:45,body:26},{rightArm:-30,leftArm:30}],
  axe:[{rightArm:-165,rightElbow:-35,body:-20},{rightArm:-30,body:30},{rightArm:-5,body:10}],
  mace:[{rightArm:-130,rightElbow:-60,body:-10},{rightArm:-35,body:20},{rightArm:0}],
  spear:[{rightArm:35,rightElbow:-95,leftArm:60,body:-10},{rightArm:-100,rightElbow:15,leftArm:90,body:12,x:10},{rightArm:-65,rightElbow:-35}],
  bow:[{leftArm:90,leftElbow:5,rightArm:-70,rightElbow:-100},{leftArm:90,rightArm:-80,rightElbow:-80,head:-3},{leftArm:65,rightArm:-40,rightElbow:-40}],
  crossbow:[{leftArm:65,leftElbow:35,rightArm:-65,rightElbow:-45},{leftArm:80,leftElbow:10,rightArm:-80,rightElbow:-20,body:-5},{leftArm:45,rightArm:-45}],
  staff:[{rightArm:-140,rightElbow:-30,leftArm:65},{rightArm:-40,leftArm:35,body:15},{rightArm:-25}],
};
export const SPELL_POSES:Record<Spell,[PosePatch,PosePatch,PosePatch]>={
  fire:[{rightArm:-70,rightElbow:-60},{rightArm:-110,rightElbow:10,body:10},{rightArm:-50}],
  frost:[{leftArm:45,rightArm:-45,leftElbow:45,rightElbow:-45},{leftArm:95,rightArm:-95,body:-5},{leftArm:30,rightArm:-30}],
  lightning:[{rightArm:-175,leftArm:35,head:-10},{rightArm:-145,leftArm:65,body:8},{rightArm:-65}],
  healing:[{leftArm:45,rightArm:-45,leftElbow:65,rightElbow:-65},{leftArm:65,rightArm:-65,leftElbow:75,rightElbow:-75,head:7},{leftArm:25,rightArm:-25}],
  ward:[{leftArm:55,leftElbow:45,rightArm:-35},{leftArm:100,leftElbow:15,rightArm:-60,rightElbow:-45},{leftArm:65,rightArm:-25}],
  summon:[{leftArm:135,rightArm:-135,head:-10},{leftArm:150,rightArm:-150,head:-15,body:-5},{leftArm:80,rightArm:-80}],
  arcane:[{leftArm:55,rightArm:-55,leftElbow:50,rightElbow:-50},{leftArm:110,rightArm:-110,leftElbow:30,rightElbow:-30,turn:5},{leftArm:35,rightArm:-35}],
};
function blend(a:RigPose,b:RigPose,t:number):RigPose {const out={...a};for(const key of Object.keys(a) as (keyof RigPose)[])out[key]=a[key]+(b[key]-a[key])*t;return out;}
function track(poses:PosePatch[],p:number):RigPose {const x=Math.min(1,Math.max(0,p))*(poses.length-1),i=Math.min(poses.length-2,Math.floor(x));const t=x-i;return blend({...neutral,...poses[i]},{...neutral,...poses[i+1]},t*t*(3-2*t));}
export function sampleRigPose(action:Action,progress:number,weapon:Weapon='unarmed',spell:Spell='arcane'):RigPose {
  if(!Number.isFinite(progress)||progress<0||progress>1)throw Error('动作进度无效');
  const wave=Math.sin(progress*Math.PI*2),pulse=Math.sin(progress*Math.PI),breathe=Math.sin(progress*Math.PI*2);
  switch(action){
    case 'walk':return {...neutral,leftArm:wave*24,rightArm:-wave*24,leftLeg:-wave*23,rightLeg:wave*23,leftKnee:Math.max(0,wave)*24,rightKnee:Math.max(0,-wave)*24,y:-Math.abs(wave)*2,body:2,cloth:wave*5};
    case 'stand-relaxed':return {...neutral,body:4,head:-3,leftLeg:4,rightLeg:-4,leftArm:12,rightElbow:-25,y:breathe};
    case 'stand-alert':return {...neutral,leftLeg:5,rightLeg:-5,leftElbow:15,rightElbow:-15,head:-3,y:breathe*.5};
    case 'talk':return {...neutral,head:wave*4,rightArm:-25-wave*15,rightElbow:-35-wave*20,leftElbow:10+wave*10};
    case 'wave':return {...neutral,rightArm:-145,rightElbow:Math.sin(progress*Math.PI*6)*25,head:-4};
    case 'point':return track([{}, {rightArm:-100,rightElbow:0,head:-5},{rightArm:-100,rightElbow:0},{}],progress);
    case 'nod':return {...neutral,head:Math.sin(progress*Math.PI*4)*12};
    case 'shake-head':return {...neutral,turn:Math.sin(progress*Math.PI*4)*10};
    case 'sit':return {...neutral,y:40,leftLeg:-75,rightLeg:75,leftKnee:80,rightKnee:-80,leftElbow:25,rightElbow:-25,head:3};
    case 'lean':return {...neutral,body:15,y:3,leftLeg:-12,rightLeg:6,leftElbow:25,rightElbow:-25};
    case 'lie':case 'sleep':case 'downed':case 'dead':return {...neutral,body:90,y:70,x:-65,leftLeg:5,rightLeg:-7,leftArm:18,rightArm:-12,head:action==='downed'?8:0};
    case 'fall':return track([{}, {body:25,y:18,leftLeg:-35,rightLeg:20,leftArm:65,rightArm:-65},{body:90,y:70,x:-65,leftLeg:5,rightLeg:-7,leftArm:18,rightArm:-12}],progress);
    case 'combat-ready':return {...neutral,leftLeg:12,rightLeg:-12,leftArm:30,rightArm:-35,leftElbow:45,rightElbow:-55,y:3+breathe};
    case 'attack':return track([{},...WEAPON_POSES[weapon],{}],progress);
    case 'heavy-attack':return track([{}, {...WEAPON_POSES[weapon][0],body:-25,y:-3},{...WEAPON_POSES[weapon][0],body:-25,y:-3},{...WEAPON_POSES[weapon][1],body:30,y:7},WEAPON_POSES[weapon][2],{}],progress);
    case 'cast':return track([{},...SPELL_POSES[spell],{}],progress);
    case 'hit-unarmed':return {...neutral,body:-pulse*12,head:-pulse*15,x:-pulse*7,leftArm:pulse*20,rightArm:-pulse*20};
    case 'hit-weapon':return {...neutral,body:-pulse*22,head:pulse*12,x:-pulse*14,leftArm:pulse*40,rightArm:-pulse*25};
    case 'hit-spell':return {...neutral,body:Math.sin(progress*Math.PI*10)*pulse*8,head:-pulse*14,y:-pulse*12,leftArm:pulse*65,rightArm:-pulse*65};
    case 'block':return {...neutral,leftArm:70,leftElbow:75,rightArm:-45,rightElbow:-60,body:-pulse*8,leftLeg:10,rightLeg:-10};
    case 'dodge':return {...neutral,x:pulse*38,y:pulse*17,body:-pulse*28,leftLeg:-pulse*30,rightLeg:pulse*35,leftArm:pulse*40,rightArm:-pulse*40};
    default:return {...neutral,y:breathe*.8};
  }
}
export function mirrorRigPose(p:RigPose):RigPose {return {...p,body:-p.body,head:-p.head,turn:-p.turn,x:-p.x,leftArm:-p.rightArm,rightArm:-p.leftArm,leftElbow:-p.rightElbow,rightElbow:-p.leftElbow,leftLeg:-p.rightLeg,rightLeg:-p.leftLeg,leftKnee:-p.rightKnee,rightKnee:-p.leftKnee,cloth:-p.cloth};}
