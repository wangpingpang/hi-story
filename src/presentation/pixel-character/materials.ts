import type { AppearanceSlot } from '../../application/character-motion';
import type { CharacterVisualFrame, Direction } from '../../application/character-visuals';
import type { DeepReadonly } from '../../contracts';
import manifest from './materials.json';
import { materialView } from '../directional-materials';

let image: HTMLImageElement | undefined;
let loading: Promise<void> | undefined;
const textures = new Map<string, HTMLCanvasElement>();
export function pixelSupport(frame: DeepReadonly<CharacterVisualFrame>): string | undefined {
  if (frame.actor.gender !== manifest.gender) return '样板素材当前仅覆盖女性身体';
  if (frame.actor.appearance.version !== 'appearance/3') return '旧外观版本继续使用原渲染器';
  for (const [slot, styles] of Object.entries(manifest.styles)) {
    if (!(styles as string[]).includes(frame.actor.appearance.parts[slot as AppearanceSlot].styleId)) return `样板尚未覆盖部件 ${slot}/${frame.actor.appearance.parts[slot as AppearanceSlot].styleId}`;
  }
  return undefined;
}
export function loadPixelMaterials(): Promise<void> {
  if (image) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      if (im.width !== manifest.width || im.height !== manifest.height) { reject(Error('像素样板素材尺寸不匹配')); return; }
      image = im; resolve();
    };
    im.onerror = () => reject(Error('像素样板素材加载失败'));
    im.src = new URL(`${import.meta.env.BASE_URL}assets/characters/pixel-v1/${manifest.file}`, document.baseURI).href;
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
export function pixelTexture(slot: AppearanceSlot, color: string, direction: Direction): HTMLCanvasElement {
  if (!image) throw Error('像素样板素材尚未加载');
  const column = materialView(direction).column, key = `${slot}/${column}/${color}`;
  const cached = textures.get(key); if (cached) return cached;
  const [x, y, w, h] = manifest.regions[slot][column], c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h), data = pixels.data, target = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b), light = (.2126 * r + .7152 * g + .0722 * b) / 255;
    // Ignore near-transparent RGB fringe without changing the archived source PNG.
    if (data[i + 3] < 180 || (hi > 220 && lo < 40 && r > g * 2)) { data.fill(0, i, i + 4); continue; }
    data[i + 3] = 255;
    const skin = slot === 'body' || slot === 'face';
    const tint = slot === 'hair' || (skin ? r > g * 1.06 && g > b * 1.08 : slot === 'top' ? g > r * 1.08 || b > r * 1.12 : !(r > 185 && g > 125 && b < 85));
    if (tint && light > .12) {
      const reference = skin ? .65 : slot === 'pants' ? .28 : .34;
      const shade = [.42, .66, .84, 1, 1.22][Math.max(0, Math.min(4, Math.round((light / reference - .42) / .2)))];
      for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.min(255, Math.round(target[channel] * shade));
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (textures.size >= 128) textures.delete(textures.keys().next().value!);
  textures.set(key, c); return c;
}
