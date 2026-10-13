import { freeze, type DeepReadonly } from '../../contracts';

export const APPEARANCE_VERSION = 'appearance/1' as const;
export const APPEARANCE_SLOTS = ['hair', 'face', 'body', 'top', 'pants', 'shoes', 'accessory'] as const;
export type AppearanceSlot = typeof APPEARANCE_SLOTS[number];
export interface AppearancePart { styleId: string; color: string }
export interface Appearance {
  version: typeof APPEARANCE_VERSION;
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

function checkSeed(seed: string): void {
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 128) throw Error('种子须为 1–128 个字符，且不能全为空白');
}
function checkSlot(slot: AppearanceSlot): void {
  if (!APPEARANCE_SLOTS.includes(slot)) throw Error('未知外观部件');
}
// FNV-1a followed by Mulberry32; explicit integer operations make results reproducible.
function random(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {
    let x = state += 0x6d2b79f5;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function generatePart(seed: string, slot: AppearanceSlot): AppearancePart {
  const rng = random(`${APPEARANCE_VERSION}:${seed}:${slot}`), catalog = APPEARANCE_CATALOG[slot];
  return { styleId: catalog.styles[Math.floor(rng() * catalog.styles.length)].id, color: catalog.colors[Math.floor(rng() * catalog.colors.length)] };
}

export function generateAppearance(seed: string): Appearance {
  checkSeed(seed);
  const parts = Object.fromEntries(APPEARANCE_SLOTS.map(slot => [slot, generatePart(seed, slot)])) as Appearance['parts'];
  return { version: APPEARANCE_VERSION, seed, parts };
}
export function validateAppearance(model: DeepReadonly<Appearance>): void {
  if (!model || model.version !== APPEARANCE_VERSION) throw Error('外观版本无效');
  checkSeed(model.seed);
  if (!model.parts || Object.keys(model.parts).length !== APPEARANCE_SLOTS.length) throw Error('外观须包含七个部件');
  for (const slot of APPEARANCE_SLOTS) {
    const part = model.parts[slot], catalog = APPEARANCE_CATALOG[slot];
    if (!Object.hasOwn(model.parts, slot) || !part || !catalog.styles.some(s => s.id === part.styleId) || !catalog.colors.some(c => c === part.color)) throw Error(`${catalog.label}样式或颜色无效`);
  }
}
export function rerollAppearance(model: DeepReadonly<Appearance>, seed: string, locked: readonly AppearanceSlot[] = []): Appearance {
  validateAppearance(model);
  locked.forEach(checkSlot);
  const next = generateAppearance(seed);
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
