// Hair silhouettes constrain the scalp; all head layers share one neck pivot.
// This works with the original atlas and with separately authored direction views.
const boundsCache = new WeakMap<HTMLCanvasElement, [number, number, number, number]>();
export function textureBounds(image: HTMLCanvasElement): [number, number, number, number] {
  const cached = boundsCache.get(image); if (cached) return cached;
  const { width: w, height: h } = image, d = image.getContext('2d')!.getImageData(0, 0, w, h).data;
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] >= 128) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw Error('人物部件为空');
  const value: [number, number, number, number] = [left, top, right - left + 1, bottom - top + 1]; boundsCache.set(image, value); return value;
}
export function fittedTexture(image: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.drawImage(image, ...textureBounds(image), 0, 0, width, height); return c;
}

export function constrainScalp(face: HTMLCanvasElement, hair: HTMLCanvasElement, brow: number): void {
  const ctx = face.getContext('2d')!, d = ctx.getImageData(0, 0, face.width, face.height);
  const h = hair.getContext('2d')!.getImageData(0, 0, hair.width, hair.height).data;
  for (let y = 0; y < Math.min(brow, face.height); y++) {
    let left = hair.width, right = -1;
    for (let x = 0; x < hair.width; x++) if (h[(y * hair.width + x) * 4 + 3] >= 128) { left = Math.min(left, x); right = x; }
    for (let x = 0; x < face.width; x++) if (x <= left || x >= right) d.data.fill(0, (y * face.width + x) * 4, (y * face.width + x) * 4 + 4);
  }
  ctx.putImageData(d, 0, 0);
}

const heads = new WeakMap<HTMLCanvasElement, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();
export function registeredDirectionalFace(face: HTMLCanvasElement, hair: HTMLCanvasElement, hairBox: [number, number, number]): HTMLCanvasElement {
  let byHair = heads.get(face); if (!byHair) { byHair = new WeakMap(); heads.set(face, byHair); }
  const cached = byHair.get(hair); if (cached) return cached;
  const result = document.createElement('canvas'), silhouette = document.createElement('canvas'); result.width = result.height = silhouette.width = silhouette.height = 192;
  const f = result.getContext('2d')!, h = silhouette.getContext('2d')!; f.imageSmoothingEnabled = h.imageSmoothingEnabled = false;
  f.drawImage(face, 66, 29, 60, 73); h.drawImage(hair, 96 - hairBox[0] / 2, 96 + hairBox[2], hairBox[0], hairBox[1]);
  constrainScalp(result, silhouette, 58); silhouette.width = 0; byHair.set(hair, result); return result;
}
