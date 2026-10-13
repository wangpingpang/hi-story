import { appearanceCatalog, appearanceSlots, type Appearance } from '../application/character-studio';
import type { DeepReadonly } from '../contracts';
import { escapeHtml } from './html';

// All seven slots share one 64 × 96 rig. Clothing follows body width, never stretches the face.
export function characterFigure(model: DeepReadonly<Appearance>): string {
  const p = model.parts, skin = p.body.color, ink = '#202a34';
  const width = { slim: 16, balanced: 20, broad: 26, stocky: 28 }[p.body.styleId] ?? 20;
  const left = 32 - width / 2, right = left + width, waist = p.body.styleId === 'stocky' ? 61 : 57;
  const r = (x: number, y: number, w: number, h: number, color: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`;
  const path = (d: string, color: string) => `<path d="${d}" fill="${color}"/>`;
  const hairBack = p.hair.styleId === 'long' ? r(19,12,26,35,p.hair.color)
    : p.hair.styleId === 'ponytail' ? r(43,16,7,25,p.hair.color) : '';
  const head = p.face.styleId === 'round' ? path('M24 11h16v3h3v17h-3v3H24v-3h-3V14h3z',skin)
    : p.face.styleId === 'square' ? r(21,12,22,22,skin)
    : p.face.styleId === 'angular' ? path('M23 10h18v20h-4v5H27v-5h-4z',skin)
    : path('M25 10h14v3h3v17h-3v5H25v-5h-3V13h3z',skin);
  const hair = {
    crop: r(21,9,22,7,p.hair.color)+r(21,15,4,7,p.hair.color),
    bob: r(19,9,26,8,p.hair.color)+r(19,17,5,17,p.hair.color)+r(40,17,5,17,p.hair.color),
    long: r(20,9,24,7,p.hair.color)+r(20,16,4,12,p.hair.color)+r(40,16,4,12,p.hair.color),
    ponytail: r(21,9,23,7,p.hair.color)+r(21,16,3,5,p.hair.color)+r(42,13,6,6,'#d4b071'),
    bun: r(28,3,9,7,p.hair.color)+r(21,10,22,7,p.hair.color)+r(21,17,3,5,p.hair.color),
    mohawk: r(29,3,7,14,p.hair.color)+r(21,12,4,7,p.hair.color)+r(40,12,3,7,p.hair.color),
  }[p.hair.styleId] ?? '';
  const armY = p.top.styleId === 'shirt' || p.top.styleId === 'coat' ? 53 : 47;
  const trousers = p.pants.styleId === 'loose' ? 10 : p.body.styleId === 'slim' ? 6 : 8;
  const legLeft = left+1, legRight = right-trousers-1;
  const pantEnd = p.pants.styleId === 'shorts' ? 69 : 81;
  const bootY = p.shoes.styleId === 'boots' ? 74 : p.shoes.styleId === 'ankle' ? 80 : 84;
  let torso = r(left,38,width,waist-38,p.top.color);
  if (p.top.styleId === 'shirt') torso += r(30,38,3,waist-38,'#d6cab0')+r(27,38,4,4,'#e2d6be')+r(34,38,4,4,'#e2d6be');
  if (p.top.styleId === 'vest') torso += r(29,38,6,waist-38,'#d2c3a8')+r(30,44,2,2,ink)+r(30,50,2,2,ink);
  if (p.top.styleId === 'coat') torso += r(left,waist,width,6,p.top.color)+r(30,38,4,waist-32,ink)+r(left+3,51,4,3,ink)+r(right-7,51,4,3,ink);
  if (p.top.styleId === 'armor') torso += r(left-2,38,7,5,'#aebac0')+r(right-5,38,7,5,'#aebac0')+r(left+3,44,width-6,8,'#aebac0')+r(left+3,48,width-6,2,'#75838b');
  let accessory = '';
  if (p.accessory.styleId === 'scarf') accessory = r(23,34,18,5,p.accessory.color)+r(36,39,6,16,p.accessory.color);
  if (p.accessory.styleId === 'glasses') accessory = `<path d="M24 20h6v6h-6zm10 0h6v6h-6zM30 22h4" fill="none" stroke="${p.accessory.color}" stroke-width="2"/>`;
  if (p.accessory.styleId === 'earring') accessory = r(42,26,3,5,p.accessory.color);
  if (p.accessory.styleId === 'satchel') accessory = path(`M${left} 38h4l${width} 22h-4z`,p.accessory.color)+r(right-7,55,13,14,p.accessory.color)+r(right-6,56,11,3,'#d4b071');
  if (p.accessory.styleId === 'pendant') accessory = path('M25 37h2l5 9 5-9h2l-6 12h-2z','#d4b071')+r(30,47,5,5,p.accessory.color);
  return `${r(18,90,29,3,'#273a3c')}${hairBack}${r(28,32,8,8,skin)}${r(left-5,40,5,23,skin)}${r(right,40,5,23,skin)}${r(left-5,39,5,armY-39,p.top.color)}${r(right,39,5,armY-39,p.top.color)}${r(legLeft,waist,trousers,29,skin)}${r(legRight,waist,trousers,29,skin)}${r(left,waist,width,8,p.pants.color)}${r(legLeft,waist,trousers,pantEnd-waist,p.pants.color)}${r(legRight,waist,trousers,pantEnd-waist,p.pants.color)}${p.pants.styleId==='patched'?r(legLeft+1,70,4,5,'#af9577'):''}${torso}${r(left,waist-3,width,3,ink)}${r(31,waist-3,3,3,'#d4b071')}${[legLeft,legRight].map(x=>p.shoes.styleId==='sandals'?r(x,85,trousers+2,5,p.shoes.color)+r(x+2,82,2,4,p.shoes.color):r(x,bootY,trousers,88-bootY,p.shoes.color)+r(x-1,86,trousers+3,4,p.shoes.color)).join('')}${head}${r(25,22,3,3,p.face.color)}${r(36,22,3,3,p.face.color)}${r(30,29,5,2,'#9a6759')}${hair}${accessory}`;
}
export function appearanceDescription(model: DeepReadonly<Appearance>): string {
  return appearanceSlots.map(slot=>`${appearanceCatalog[slot].label}：${appearanceCatalog[slot].styles.find(s=>s.id===model.parts[slot].styleId)?.label ?? ''}`).join('，');
}
export function characterSprite(model: DeepReadonly<Appearance>, name = '随机人物'): string {
  return `<svg class="character-sprite" viewBox="0 0 64 96" role="img" aria-label="${escapeHtml(name+'，'+appearanceDescription(model))}" shape-rendering="crispEdges">${characterFigure(model)}</svg>`;
}
