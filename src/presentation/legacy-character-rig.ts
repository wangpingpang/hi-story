import type { DeepReadonly } from '../contracts';
import type { Appearance, AppearanceSlot, Gender, Action, Weapon, Spell, Expression } from '../application/character-motion';
import { artRegion } from './character-art-layout';
import { legacyTexture } from './legacy-character-materials';
import { fittedTexture, constrainScalp } from './registered-head';
import { sampleRigPose } from './motion-clips';
import { materialTexture } from './directional-materials';

export interface OriginalPose { action?: Action; progress?: number; weapon?: Weapon; spell?: Spell; expression?: Expression; layers?: readonly AppearanceSlot[]; effects?: boolean }
type Point = [number, number];
type Layer = HTMLCanvasElement;
interface OriginalRig { body: Layer; top: Layer; pants: Layer; shoes: Layer; face: Layer; hair: Layer; accessory: Layer; hairFront: Layer; cuts: Map<string, Layer>; fit: number; }
const cache = new Map<string, OriginalRig>();
const hairBoxes: Record<string, [number, number, number, number]> = {
  crop: [41, 22, 62, 52], bob: [36, 23, 72, 67], long: [26, 22, 92, 96],
  ponytail: [34, 18, 78, 93], bun: [42, 10, 60, 82], mohawk: [42, 16, 60, 72],
};
const clothes: Record<string, [number, number]> = { tunic: [105, 95], shirt: [110, 90], vest: [84, 92], coat: [108, 98], armor: [108, 97], wrap: [104, 94] };
const lowerClothes: Record<string, [number, number]> = { straight: [85, 98], loose: [95, 100], shorts: [88, 62], patched: [88, 100], skirt: [105, 100], 'long-skirt': [112, 110] };
const skirts = new Set(['skirt', 'long-skirt']);
const radians = (a: number) => a * Math.PI / 180;
function canvas(width = 144, height = 288) { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; }
function context(c: Layer) { const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.imageSmoothingEnabled = false; return ctx; }
function binary(c: Layer) { const ctx = context(c), p = ctx.getImageData(0, 0, c.width, c.height); for (let i = 0; i < p.data.length; i += 4) { if (p.data[i + 3] < 128) p.data.fill(0, i, i + 4); else p.data[i + 3] = 255; } ctx.putImageData(p, 0, 0); }
function rigFor(model: DeepReadonly<Appearance>, gender: Gender): OriginalRig {
  const key = JSON.stringify([gender, model.parts]); const old = cache.get(key); if (old) return old;
  const layers = Object.fromEntries(['body', 'top', 'pants', 'shoes', 'face', 'hair', 'accessory', 'hairFront'].map(slot => [slot, canvas()])) as unknown as OriginalRig;
  const fit = { slim: .93, balanced: 1, broad: 1.06, stocky: 1.1 }[model.parts.body.styleId] ?? 1;
  const source = (slot: AppearanceSlot) => { const p = model.parts[slot], r = artRegion(slot, p.styleId, gender); return r ? legacyTexture(slot, p.styleId, slot === 'face' ? model.parts.body.color : p.color, gender, r) : undefined; };
  const drawTight = (layer: Layer, im: Layer, box: [number, number, number, number]) => { const normalized = fittedTexture(im, Math.round(box[2]), Math.round(box[3])); context(layer).drawImage(normalized, Math.round(box[0]), Math.round(box[1])); normalized.width = 0; };
  const b = artRegion('body', model.parts.body.styleId, gender)!; context(layers.body).drawImage(source('body')!, ...b.target);
  // Only exposed skin is rendered. A hidden mannequin torso must not leak through
  // a neck opening or above a garment's shoulders.
  const skin = context(layers.body), d = skin.getImageData(0, 0, 144, 288);
  const bareShoulder = model.parts.top.styleId === 'vest' ? 108 : 125;
  for (let y = 0; y < 288; y++) for (let x = 0; x < 144; x++) if (y < bareShoulder || y >= 264) d.data.fill(0, (y * 144 + x) * 4, (y * 144 + x) * 4 + 4);
  skin.putImageData(d, 0, 0); skin.fillStyle = model.parts.body.color; skin.beginPath(); skin.moveTo(66, 83); skin.lineTo(78, 83); skin.lineTo(81, 104); skin.lineTo(63, 104); skin.closePath(); skin.fill(); skin.strokeStyle = '#6c4f3c'; skin.lineWidth = .6; skin.stroke();
  const [tw, th] = clothes[model.parts.top.styleId]; drawTight(layers.top, source('top')!, [72 - tw * fit / 2, 93, tw * fit, th]);
  const [pw, ph] = lowerClothes[model.parts.pants.styleId]; drawTight(layers.pants, source('pants')!, [72 - pw * fit / 2, 174, pw * fit, ph]);
  const shoeH = { boots: 41, ankle: 31, cloth: 23, sandals: 22 }[model.parts.shoes.styleId] ?? 31;
  drawTight(layers.shoes, source('shoes')!, [72 - 53 * fit, 279 - shoeH, 106 * fit, shoeH]);
  drawTight(layers.face, source('face')!, [46, 34, 52, 55]);
  drawTight(layers.hair, source('hair')!, hairBoxes[model.parts.hair.styleId]);
  const eyes = context(layers.face); eyes.fillStyle = model.parts.face.color; eyes.fillRect(65, 63, 1, 2); eyes.fillRect(80, 63, 1, 2);
  constrainScalp(layers.face, layers.hair, 58);
  // The fringe follows the head, while hair below the jaw is behind the collar.
  const front = context(layers.hairFront); front.save(); front.beginPath(); front.rect(0, 0, 144, 84); front.clip(); front.drawImage(layers.hair, 0, 0); front.restore();
  const accessory = source('accessory'); if (accessory) {
    const a = context(layers.accessory), style = model.parts.accessory.styleId;
    if (style === 'satchel') {
      a.strokeStyle = '#302b27'; a.lineWidth = 4; a.beginPath(); a.moveTo(44, 104); a.lineTo(99, 166); a.stroke();
      a.strokeStyle = model.parts.accessory.color; a.lineWidth = 2; a.stroke();
      // Bag and strap are separate attachments. The source's diagonal strap must
      // not be stretched together with a bag sized for the character's whole torso.
      a.drawImage(accessory, accessory.width * .36, accessory.height * .29, accessory.width * .64, accessory.height * .6, 86, 151, 31, 38);
    } else {
      const boxes: Record<string, [number, number, number, number]> = { scarf: [43, 90, 58, 62], glasses: [48, 56, 48, 19], earring: [94, 66, 6, 12], pendant: [60, 98, 24, 34] };
      drawTight(layers.accessory, accessory, boxes[style]);
    }
  }
  for (const layer of [layers.body, layers.top, layers.pants, layers.shoes, layers.face, layers.hair, layers.hairFront, layers.accessory]) binary(layer);
  const result = { ...layers, cuts: new Map<string, Layer>(), fit };
  if (cache.size >= 32) cache.delete(cache.keys().next().value!); cache.set(key, result); return result;
}
function cut(rig: OriginalRig, name: string, source: Layer, polygon: Point[]): Layer {
  const old = rig.cuts.get(name); if (old) return old;
  const c = canvas(), ctx = context(c); ctx.beginPath(); polygon.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip(); ctx.drawImage(source, 0, 0); binary(c);
  if (name.includes('armbodylower')) {
    // A forearm cut can also intersect the mannequin's hip. Keep the connected
    // arm, rather than carrying that unrelated skin island with the wrist.
    const p = ctx.getImageData(0, 0, 144, 288), d = p.data, seen = new Uint8Array(144 * 288), queue = new Int32Array(144 * 288); let largest: number[] = [];
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || !d[start * 4 + 3]) continue; let head = 0, tail = 1; queue[0] = start; seen[start] = 1; const component: number[] = [];
      while (head < tail) { const i = queue[head++]; component.push(i); const x = i % 144, y = Math.floor(i / 144); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= 144 || ny >= 288) continue; const next = ny * 144 + nx; if (!seen[next] && d[next * 4 + 3]) { seen[next] = 1; queue[tail++] = next; } } }
      if (component.length > largest.length) largest = component;
    }
    const keep = new Set(largest); for (let i = 0; i < seen.length; i++) if (!keep.has(i)) d.fill(0, i * 4, i * 4 + 4); ctx.putImageData(p, 0, 0);
  }
  rig.cuts.set(name, c); return c;
}
function bounds(c: Layer) { const d = context(c).getImageData(0, 0, c.width, c.height).data; let bottom = -1; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) bottom = y; return bottom; }

export function renderOriginalCharacter(model: DeepReadonly<Appearance>, gender: Gender, options: OriginalPose = {}): Layer {
  const rig = rigFor(model, gender), action = options.action ?? 'stand', progress = options.progress ?? 0;
  const pose = sampleRigPose(action, progress, options.weapon, options.spell), result = canvas(384, 384), ctx = context(result);
  const selected = options.layers, has = (slot: AppearanceSlot) => !selected || selected.includes(slot);
  // Draw the complete registration first; partial layer exports keep exactly the
  // same transform and ground correction as the fully dressed character.
  function paint(ctx: CanvasRenderingContext2D, filtered: boolean) {
    const include = (slot: AppearanceSlot) => !filtered || has(slot);
    ctx.save(); ctx.translate(192 + pose.x, 227 + pose.y); ctx.rotate(radians(pose.body)); ctx.translate(-72, -177);
    const head = (image: Layer, face = false) => {
      ctx.save(); ctx.translate(72 + pose.turn, 86); ctx.rotate(radians(pose.head)); ctx.translate(-72, -86); ctx.drawImage(image, 0, 0);
      if (face && options.expression && options.expression !== 'neutral') {
        const expression = options.expression;
        ctx.fillStyle = model.parts.body.color; ctx.fillRect(54, 56, 36, 12); ctx.fillRect(63, 75, 18, 8);
        ctx.strokeStyle = model.parts.face.color; ctx.fillStyle = model.parts.face.color; ctx.lineWidth = 1;
        const line = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
        for (const x of [65, 80]) {
          if (['asleep', 'sleepy', 'pain', 'elated'].includes(expression)) line(x - 3, 62, x + 3, expression === 'elated' ? 60 : 62);
          else { ctx.fillRect(x - 1, expression === 'surprised' || expression === 'fear' ? 59 : 61, 2, expression === 'surprised' || expression === 'fear' ? 6 : expression === 'focused' ? 2 : 4); }
          if (['angry', 'focused', 'fear', 'sad'].includes(expression)) line(x - 4, 56 + (x < 72 ? -1 : 1), x + 4, 56 + (x < 72 ? 1 : -1));
        }
        if (['happy', 'elated'].includes(expression)) { line(67, 77, 72, 80); line(72, 80, 77, 77); }
        else if (['surprised', 'fear'].includes(expression)) ctx.strokeRect(70, 76, 4, 5);
        else if (expression === 'sleepy') { line(68, 80, 76, 80); line(57, 58, 65, 59); }
        else if (['sad', 'pain', 'sick'].includes(expression)) { line(67, 80, 72, 77); line(72, 77, 77, 80); if (expression === 'sick') { ctx.fillStyle = '#9d9d69'; ctx.fillRect(55, 68, 6, 2); ctx.fillRect(83, 68, 6, 2); } }
        else line(68, 79, 76, 79);
      }
      ctx.restore();
    };
    if (include('hair')) head(rig.hair);
    const width = rig.fit, shoulder = 29 * width, hip = 15 * width;
    const limb = (side: 'left' | 'right', leg: boolean) => {
      const sign = side === 'left' ? -1 : 1, sx = 72 + sign * (leg ? hip : shoulder), sy = leg ? 178 : 106;
      const ex = 72 + sign * (leg ? hip + 2 : shoulder + 10), ey = leg ? 223 : 145;
      const wx = 72 + sign * (leg ? hip + 5 : shoulder + 13), wy = leg ? 264 : 179;
      let angle = leg ? side === 'left' ? pose.leftLeg : pose.rightLeg : (side === 'left' ? pose.leftArm - 5 : pose.rightArm + 5);
      let bend = leg ? side === 'left' ? pose.leftKnee : pose.rightKnee : side === 'left' ? pose.leftElbow : pose.rightElbow;
      const seated = leg && action === 'sit'; if (seated) { angle = -sign * 9; bend = -angle; }
      const mirror = (points: Point[]) => side === 'left' ? points : points.map(([x, y]) => [144 - x, y] as Point);
      const upper: Point[] = leg ? mirror([[0, 174], [74, 174], [74, 227], [0, 227]]) : mirror([[0, 91], [49, 91], [45, 120], [40, 150], [0, 150]]);
      const lower: Point[] = leg ? mirror([[0, 219], [74, 219], [74, 288], [0, 288]]) : mirror([[0, 141], [42, 141], [35, 168], [35, 201], [0, 201]]);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(radians(angle));
      const clothed = leg ? !skirts.has(model.parts.pants.styleId) : model.parts.top.styleId !== 'vest';
      const jointSlot = leg ? 'pants' : clothed ? 'top' : 'body';
      const jointColor = model.parts[jointSlot].color;
      if (include(jointSlot) && Math.abs(angle) > 1) { ctx.fillStyle = jointColor; ctx.beginPath(); ctx.arc(0, 0, leg ? 9 : 5, 0, Math.PI * 2); ctx.fill(); ctx.save(); ctx.clip(); ctx.drawImage(rig[jointSlot], -sx, -sy); ctx.restore(); }
      ctx.save(); if (seated) ctx.scale(1, .4);
      for (const slot of leg ? ['body', 'pants'] as const : ['body', 'top'] as const) if (include(slot) && !(slot === 'pants' && skirts.has(model.parts.pants.styleId))) ctx.drawImage(cut(rig, side + (leg ? 'leg' : 'arm') + slot + 'upper', rig[slot], leg && slot === 'body' ? mirror([[34, 205], [74, 205], [74, 227], [34, 227]]) : upper), -sx, -sy);
      ctx.restore();
      ctx.translate(ex - sx, (ey - sy) * (seated ? .4 : 1)); ctx.rotate(radians(bend));
      const kneeClothed = leg && model.parts.pants.styleId !== 'shorts' && !skirts.has(model.parts.pants.styleId);
      const seamSlot = leg ? kneeClothed ? 'pants' : 'body' : 'body';
      if (include(seamSlot) && Math.abs(bend) > 1) { ctx.fillStyle = model.parts[seamSlot].color; ctx.beginPath(); ctx.arc(0, 0, leg ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.save(); ctx.clip(); ctx.drawImage(rig[seamSlot], -ex, -ey); ctx.restore(); }
      for (const slot of leg ? ['body', 'pants'] as const : ['body', 'top'] as const) if (include(slot) && !(slot === 'pants' && skirts.has(model.parts.pants.styleId))) ctx.drawImage(cut(rig, side + (leg ? 'leg' : 'arm') + slot + 'lower', rig[slot], slot === 'top' ? mirror([[0, 141], [42, 141], [35, 169], [0, 169]]) : lower), -ex, -ey);
      ctx.translate(wx - ex, wy - ey);
      if (leg && include('shoes')) ctx.drawImage(cut(rig, side + 'shoe', rig.shoes, mirror([[0, 235], [74, 235], [74, 288], [0, 288]])), -wx, -wy);
      if (!leg && filtered && options.effects !== false && side === 'right' && options.weapon && options.weapon !== 'unarmed' && ['attack', 'heavy-attack', 'combat-ready', 'block'].includes(action)) {
        const image = materialTexture('weapon', options.weapon, '#ffffff', gender, 'S')!;
        ctx.save(); if (!['bow', 'crossbow'].includes(options.weapon)) ctx.rotate(Math.PI);
        const h = { dagger: 38, sword: 73, greatsword: 91, axe: 65, mace: 60, spear: 102, bow: 76, crossbow: 58, staff: 94 }[options.weapon];
        const transform = ctx.getTransform(), origin = transform.transformPoint({ x: 0, y: 0 }); let scale = 1;
        for (const x of [-10, 10]) for (const y of [-h * .85, h * .15]) { const p = transform.transformPoint({ x, y }), dx = p.x - origin.x, dy = p.y - origin.y; if (dx > 0) scale = Math.min(scale, (376 - origin.x) / dx); if (dx < 0) scale = Math.min(scale, (8 - origin.x) / dx); if (dy > 0) scale = Math.min(scale, (376 - origin.y) / dy); if (dy < 0) scale = Math.min(scale, (8 - origin.y) / dy); }
        scale = Math.max(.05, Math.min(1, scale)); ctx.drawImage(image, -10 * scale, -h * .85 * scale, 20 * scale, h * scale); ctx.restore();
      }
      if (!leg && filtered && options.effects !== false && side === 'right' && action === 'cast') {
        const spell = options.spell ?? 'arcane';
        ctx.fillStyle = ctx.strokeStyle = { fire: '#eb9756', frost: '#a2dce4', lightning: '#eadd84', healing: '#9fc69a', ward: '#99bbdf', summon: '#b5a0d4', arcane: '#d8a5d7' }[spell]; ctx.lineWidth = 2;
        if (spell === 'healing') { ctx.fillRect(-2, -24, 4, 22); ctx.fillRect(-11, -15, 22, 4); }
        else if (spell === 'lightning') { ctx.beginPath(); ctx.moveTo(6, -34); ctx.lineTo(-5, -20); ctx.lineTo(5, -20); ctx.lineTo(-5, -4); ctx.stroke(); }
        else if (spell === 'fire') { ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(-6, -24); ctx.lineTo(0, -17); ctx.lineTo(4, -34); ctx.lineTo(11, -10); ctx.closePath(); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(0, -14, spell === 'ward' ? 16 : 11, 0, Math.PI * 2); ctx.stroke(); if (spell === 'frost') { ctx.fillRect(-15, -15, 30, 2); ctx.fillRect(-1, -29, 2, 30); } else if (spell === 'summon') { ctx.strokeRect(-8, -22, 16, 16); } else ctx.fillRect(-3, -17, 6, 6); }
      }
      if (!leg && filtered && options.effects !== false && side === 'left' && action === 'block') ctx.drawImage(materialTexture('weapon', 'shield', '#ffffff', gender, 'S')!, -17, -24, 34, 38);
      ctx.restore();
    };
    limb('right', false); limb('right', true); limb('left', true);
    if (include('body')) ctx.drawImage(cut(rig, 'neck', rig.body, [[60, 79], [84, 79], [84, 113], [60, 113]]), 0, 0);
    if (include('pants')) {
      if (skirts.has(model.parts.pants.styleId)) { ctx.save(); ctx.translate(72, 178); ctx.rotate(radians(pose.cloth)); if (action === 'sit') ctx.scale(1.08, .7); ctx.drawImage(rig.pants, -72, -178); ctx.restore(); }
      else ctx.drawImage(cut(rig, 'waist', rig.pants, [[25, 172], [119, 172], [119, 192], [25, 192]]), 0, 0);
    }
    if (include('top')) ctx.drawImage(cut(rig, 'torso', rig.top, [[47, 88], [97, 88], [101, 120], [111, 198], [33, 198], [43, 120]]), 0, 0);
    limb('left', false);
    const headAccessory = ['glasses', 'earring'].includes(model.parts.accessory.styleId);
    if (include('accessory') && !headAccessory) {
      if (model.parts.accessory.styleId === 'scarf') {
        ctx.drawImage(cut(rig, 'scarf-collar', rig.accessory, [[0, 0], [144, 0], [144, 118], [0, 118]]), 0, 0);
        ctx.save(); ctx.translate(83, 116); ctx.rotate(radians(pose.cloth * .6)); ctx.drawImage(cut(rig, 'scarf-tail', rig.accessory, [[0, 116], [144, 116], [144, 288], [0, 288]]), -83, -116); ctx.restore();
      } else ctx.drawImage(rig.accessory, 0, 0);
    }
    if (include('face')) head(rig.face, true);
    if (include('hair')) head(rig.hairFront);
    if (include('accessory') && headAccessory) head(rig.accessory);
    ctx.restore();
  }
  const ground = canvas(384, 384); paint(context(ground), false); const bottom = bounds(ground), offset = bottom >= 0 ? 329 - bottom : 0; ground.width = 0;
  ctx.translate(0, offset); paint(ctx, true);
  if (options.effects !== false && action.startsWith('hit-')) { const pulse = Math.sin(progress * Math.PI); ctx.strokeStyle = action === 'hit-spell' ? '#caa2e7' : '#efb57a'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(192 + Math.cos(a) * 16 * pulse, 206 + Math.sin(a) * 16 * pulse); ctx.lineTo(192 + Math.cos(a) * 29 * pulse, 206 + Math.sin(a) * 29 * pulse); ctx.stroke(); } }
  binary(result); return result;
}
