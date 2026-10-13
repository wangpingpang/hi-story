import { freeze, type DeepReadonly } from '../../contracts';
import { assertSeed, seededRandom } from './random';

export const APPEARANCE_VERSION = 'appearance/1' as const;
export type AppearanceVersion = 'appearance/1' | 'appearance/2';
export const APPEARANCE_SLOTS = ['hair', 'face', 'body', 'top', 'pants', 'shoes', 'accessory'] as const;
export type AppearanceSlot = typeof APPEARANCE_SLOTS[number];
export interface AppearancePart { styleId: string; color: string }
export interface Appearance {
  version: AppearanceVersion;
  seed: string;
  parts: Record<AppearanceSlot, AppearancePart>;
}
const styles = (entries: string[][]) => entries.map(([id, label]) => ({ id, label }));
// IDs are the stable rendering contract. Labels can change without changing saved models.
export const APPEARANCE_CATALOG = freeze({
  hair: { label: '发型', styles: styles([['crop','短发'],['bob','齐耳发'],['long','长发'],['ponytail','马尾'],['bun','发髻'],['mohawk','莫霍克发']]), colors: ['#252a35','#614436','#ad693d','#dfbf79','#b3bec8','#755779'] },
  face: { label: '脸型', styles: styles([['oval','椭圆脸'],['round','圆脸'],['square','方脸'],['angular','棱角脸']]), colors: ['#263343','#574439','#457176','#5d6842'] },
  body: { label: '身材', styles: styles([['slim','纤细'],['balanced','匀称'],['broad','宽肩'],['stocky','敦实']]), colors: ['#f1d0ac','#dfb18c','#c58b65','#9c664b','#704a3a'] },
  top: { label: '上衣', styles: styles([['tunic','束腰衫'],['shirt','衬衣'],['vest','马甲'],['coat','短外套'],['armor','轻甲']]), colors: ['#ad6650','#587b72','#59738c','#9b8557','#705d83','#b7aca0'] },
  pants: { label: '裤子', styles: styles([['straight','直筒裤'],['loose','宽裤'],['shorts','短裤'],['patched','补丁裤']]), colors: ['#324553','#60594e','#535c44','#72647d','#927861'] },
  shoes: { label: '鞋', styles: styles([['boots','长靴'],['ankle','短靴'],['cloth','布鞋'],['sandals','凉鞋']]), colors: ['#302d31','#654432','#8b694e','#575c65'] },
  accessory: { label: '饰品', styles: styles([['none','无饰品'],['scarf','围巾'],['glasses','眼镜'],['earring','耳饰'],['satchel','挎包'],['pendant','吊坠']]), colors: ['#d4b071','#a8584f','#699895','#b7bacb','#795e45'] },
});
export const APPEARANCE_CATALOG_V2 = freeze({
  ...APPEARANCE_CATALOG,
  top: { ...APPEARANCE_CATALOG.top, styles: [...APPEARANCE_CATALOG.top.styles, {id:'wrap',label:'交叠式上衣'}] },
  pants: { ...APPEARANCE_CATALOG.pants, label:'下装', styles: [...APPEARANCE_CATALOG.pants.styles, {id:'skirt',label:'及膝裙'}, {id:'long-skirt',label:'长裙'}] },
});
export function appearanceCatalogFor(version: AppearanceVersion) {
  if(version==='appearance/1')return APPEARANCE_CATALOG;
  if(version==='appearance/2')return APPEARANCE_CATALOG_V2;
  throw Error('外观版本无效');
}

function checkSlot(slot: AppearanceSlot): void {
  if (!APPEARANCE_SLOTS.includes(slot)) throw Error('未知外观部件');
}
function generatePart(seed: string, slot: AppearanceSlot, version: AppearanceVersion): AppearancePart {
  const rng = seededRandom(`${version}:${seed}:${slot}`), catalog = appearanceCatalogFor(version)[slot];
  return { styleId: catalog.styles[Math.floor(rng() * catalog.styles.length)].id, color: catalog.colors[Math.floor(rng() * catalog.colors.length)] };
}

export function generateAppearance(seed: string, version: AppearanceVersion = APPEARANCE_VERSION): Appearance {
  assertSeed(seed);
  appearanceCatalogFor(version);
  const parts = Object.fromEntries(APPEARANCE_SLOTS.map(slot => [slot, generatePart(seed, slot, version)])) as Appearance['parts'];
  return { version, seed, parts };
}
export function validateAppearance(model: DeepReadonly<Appearance>): void {
  if (!model) throw Error('外观版本无效');
  const catalogs = appearanceCatalogFor(model.version);
  assertSeed(model.seed);
  if (!model.parts || Object.keys(model.parts).length !== APPEARANCE_SLOTS.length) throw Error('外观须包含七个部件');
  for (const slot of APPEARANCE_SLOTS) {
    const part = model.parts[slot], catalog = catalogs[slot];
    if (!Object.hasOwn(model.parts, slot) || !part || !catalog.styles.some(s => s.id === part.styleId) || !catalog.colors.some(c => c === part.color)) throw Error(`${catalog.label}样式或颜色无效`);
  }
}
export function rerollAppearance(model: DeepReadonly<Appearance>, seed: string, locked: readonly AppearanceSlot[] = []): Appearance {
  validateAppearance(model);
  locked.forEach(checkSlot);
  const next = generateAppearance(seed, model.version);
  for (const slot of locked) next.parts[slot] = { ...model.parts[slot] };
  return next;
}
export function rerollAppearancePart(model: DeepReadonly<Appearance>, slot: AppearanceSlot, seed: string): Appearance {
  checkSlot(slot);
  return rerollAppearance(model, seed, APPEARANCE_SLOTS.filter(s => s !== slot));
}
export function setAppearancePart(model: DeepReadonly<Appearance>, slot: AppearanceSlot, part: AppearancePart): Appearance {
  validateAppearance(model); checkSlot(slot);
  const next = structuredClone(model) as Appearance;
  next.parts[slot] = { ...part };
  validateAppearance(next);
  return next;
}
