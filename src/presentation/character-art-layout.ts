import type { AppearanceSlot, Gender } from '../application/character-studio';
export const ART_VERSION = 'character-art/3';
export const ART_SIZE = { width:144, height:288 };
export interface ArtRegion { sheet:'common'|'female'; crop:[number,number,number,number]; target:[number,number,number,number]; material:'skin'|'hair'|'cloth'|'metal'; }
const commonCenters=[111,298,484,671,859,1058];
const femaleBodyCenters=[136,381,625,871];
const ids={hair:['crop','bob','long','ponytail','bun','mohawk'],face:['oval','round','square','angular'],body:['slim','balanced','broad','stocky'],top:['tunic','shirt','vest','coat','armor','wrap'],pants:['straight','loose','shorts','patched','skirt','long-skirt'],shoes:['boots','ankle','cloth','sandals'],accessory:['none','scarf','glasses','earring','satchel','pendant']};
export function artRegion(slot:AppearanceSlot,style:string,gender:Gender):ArtRegion|null {
  if(slot==='accessory'&&style==='none')return null;
  const index=ids[slot].indexOf(style);if(index<0)throw Error(`素材样式无效：${slot}/${style}`);
  if(slot==='hair')return {sheet:'common',crop:[commonCenters[index]-94,20,188,190],target:[25,15,94,95],material:'hair'};
  if(slot==='face')return {sheet:'common',crop:[commonCenters[index]-94,210,188,130],target:[25,25,94,65],material:'skin'};
  if(slot==='body')return gender==='female'
    ?{sheet:'female',crop:[femaleBodyCenters[index]-122,50,244,393],target:[14,76,116,190],material:'skin'}
    :{sheet:'common',crop:[commonCenters[index]-94,340,188,260],target:[6,76,132,190],material:'skin'};
  if(slot==='top') {
    if(gender==='female'||style==='wrap')return {sheet:'female',crop:[index*256,450,256,260],target:[21,86,102,104],material:'cloth'};
    return {sheet:'common',crop:[commonCenters[index]-94,605,188,195],target:[25,86,94,98],material:'cloth'};
  }
  if(slot==='pants') {
    if(gender==='female'||style==='skirt'||style==='long-skirt'){
      const femaleIndex=({straight:0,loose:1,shorts:2,skirt:3,'long-skirt':4,patched:5} as Record<string,number>)[style];
      return {sheet:'female',crop:[femaleIndex*256,715,256,290],target:[21,158,102,116],material:'cloth'};
    }
    return {sheet:'common',crop:[commonCenters[index]-94,800,188,200],target:[25,163,94,100],material:'cloth'};
  }
  if(slot==='shoes')return {sheet:'common',crop:[commonCenters[index]-94,1000,188,154],target:[6,225,132,54],material:'cloth'};
  const targets:Record<string,ArtRegion['target']>={scarf:[25,72,94,102],glasses:[42,33,60,65],earring:[88,54,28,31],satchel:[22,87,112,122],pendant:[38,71,68,73]};
  return {sheet:'common',crop:[commonCenters[index]-94,1150,188,204],target:targets[style],material:style==='glasses'||style==='earring'||style==='pendant'?'metal':'cloth'};
}
