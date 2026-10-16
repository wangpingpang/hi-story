import type { DeepReadonly } from '../../contracts';
import type { CharacterVisualFrame, Expression } from '../../application/character-visuals';
import { APPEARANCE_SLOTS, type AppearanceSlot } from '../../application/character-motion';
import { BODY_FITS } from '../character-fit';
import { materialTexture, materialView, footwearPiece } from '../directional-materials';
import { pixelTexture } from './materials';
import { pixelPose, pixelFrameAt } from './clips';

export const PIXEL_ART_VERSION = 'character-pixel-art/1';
export const PIXEL_FRAME = { width: 384, height: 384, anchor: { x: 192, y: 329 }, nativeWidth: 96, nativeHeight: 96 } as const;
export interface PixelLayer { name: string; slot: AppearanceSlot | 'weapon' | 'effect'; canvas: HTMLCanvasElement }
export interface PixelRenderOptions { layers?: readonly AppearanceSlot[]; effects?: boolean; captureLayers?: boolean }
const radians = (degrees: number) => degrees * Math.PI / 180;
function canvas() { const c = document.createElement('canvas'); c.width = c.height = 96; return c; }
function context(c: HTMLCanvasElement) { const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.imageSmoothingEnabled = false; return ctx; }
function opaque(c: HTMLCanvasElement) {
  const ctx = context(c), pixels = ctx.getImageData(0, 0, 96, 96), d = pixels.data;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) d.fill(0, i, i + 4); else d[i + 3] = 255; }
  ctx.putImageData(pixels, 0, 0);
}
function face(ctx: CanvasRenderingContext2D, emotion: Expression, rear: boolean, profile: boolean, color: string, skin: string) {
  if (rear) return;
  ctx.fillStyle = emotion === 'sick' ? '#b6b38a' : skin; ctx.fillRect(profile ? 0 : -4, -35, profile ? 5 : 9, 9);
  const eyes = profile ? [3] : [-3, 3];
  ctx.fillStyle = color;
  for (const x of eyes) {
    if (emotion === 'asleep') ctx.fillRect(x - 1, -32, 2, 1);
    else if (emotion === 'elated') { ctx.fillRect(x - 1, -32, 1, 1); ctx.fillRect(x, -33, 1, 1); ctx.fillRect(x + 1, -32, 1, 1); }
    else if (emotion === 'pain') { ctx.fillRect(x - 1, -33, 1, 1); ctx.fillRect(x, -32, 1, 1); ctx.fillRect(x - 1, -31, 1, 1); }
    else if (emotion === 'focused') { ctx.fillRect(x - 1, -32, 2, 1); ctx.fillRect(x - 1, -34, 3, 1); }
    else if (emotion === 'sleepy' || emotion === 'sick') { ctx.fillRect(x - 1, -32, 2, 1); ctx.fillStyle = '#9c7861'; ctx.fillRect(x - 1, -31, 2, 1); ctx.fillStyle = color; }
    else { ctx.fillRect(x, -33, 1, ['fear', 'surprised'].includes(emotion) ? 3 : emotion === 'sad' ? 1 : 2); ctx.fillStyle = '#f2dcc2'; ctx.fillRect(x - 1, -33, 1, 1); ctx.fillStyle = color; }
    if (emotion === 'angry') { ctx.fillRect(x - 1, -35, 2, 1); ctx.fillRect(x < 0 ? x + 1 : x - 2, -34, 1, 1); }
    if (emotion === 'fear') ctx.fillRect(x - 1, -35, 2, 1);
    if (emotion === 'sad') { ctx.fillRect(x, -35, 1, 1); ctx.fillRect(x < 0 ? x + 1 : x - 1, -36, 1, 1); }
  }
  const x = profile ? 3 : 0; ctx.fillStyle = '#71463a'; ctx.fillRect(x - 1, -28, emotion === 'asleep' ? 1 : 2, emotion === 'surprised' ? 3 : emotion === 'fear' || emotion === 'sleepy' ? 2 : 1);
  if (['happy', 'elated'].includes(emotion)) { ctx.fillRect(x - 2, -29, 1, 1); ctx.fillRect(x + 1, -29, 1, 1); }
  if (emotion === 'sad' || emotion === 'pain') { ctx.fillRect(x - 2, -27, 1, 1); ctx.fillRect(x + 1, -27, 1, 1); }
  if (emotion === 'angry') ctx.fillRect(x - 2, -28, 4, 1);
}

/** Local art only: no actor movement, combat resolution or NPC-specific assumptions. */
export function renderPixelCharacter(frame: DeepReadonly<CharacterVisualFrame>, options: PixelRenderOptions = {}) {
  const { appearance: model, gender } = frame.actor, state = frame.pose, fit = BODY_FITS[model.parts.body.styleId];
  const pose = pixelPose(state.action, state.progress, state.weapon, state.spell), view = materialView(state.direction), profile = view.column === 2;
  const result = canvas(), allLayers: PixelLayer[] = []; let ctx = context(result);
  // Render the complete rig first, then select layers. A sleeve-only export must use the same anchor.
  const has = (_slot: AppearanceSlot) => true;
  const keyframe = pixelFrameAt(state.action, state.progress);
  const breath = ['stand', 'stand-relaxed', 'stand-alert', 'combat-ready'].includes(state.action) ? Math.round(Math.sin(keyframe.phase * Math.PI * 2)) : 0;
  const texture = (slot: AppearanceSlot) => pixelTexture(slot, slot === 'face' ? model.parts.body.color : model.parts[slot].color, state.direction);
  const body = texture('body'), shirt = texture('top'), pants = texture('pants'), boots = texture('shoes');
  const width = profile ? .72 : view.column === 1 || view.column === 3 ? .92 : 1;
  ctx.translate(48, 55); if (view.mirror) ctx.scale(-1, 1); ctx.translate(pose.x / 4, pose.y / 4);
  ctx.rotate(radians(pose.body)); ctx.scale(fit.scale[0] * width, fit.scale[1]);
  function layer(name: string, slot: PixelLayer['slot'], paint: () => void) {
    const parent = ctx, c = canvas(); ctx = context(c); ctx.setTransform(parent.getTransform());
    paint(); opaque(c); ctx = parent;
    parent.save(); parent.resetTransform(); parent.drawImage(c, 0, 0); parent.restore();
    allLayers.push({ name, slot, canvas: c });
  }
  function patch(im: HTMLCanvasElement, crop: number[], x: number, y: number, w: number, h: number) { ctx.drawImage(im, im.width * crop[0], im.height * crop[1], im.width * crop[2], im.height * crop[3], x, y, w, h); }
  function capsule(w: number, length: number, color: string, im?: HTMLCanvasElement, crop = [0, 0, 1, 1]) {
    ctx.beginPath(); ctx.roundRect(-w / 2, -1.5, w, length + 3, Math.min(w / 2, 2));
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#363438'; ctx.lineWidth = .65; ctx.stroke();
    if (im) { ctx.save(); ctx.clip(); patch(im, crop, -w / 2, -1.5, w, length + 3); ctx.restore(); }
  }
  function headTransform() { ctx.translate(pose.turn / 5, -23 + breath); ctx.rotate(radians(pose.head)); ctx.scale(1 / fit.scale[0], 1 / fit.scale[1]); ctx.translate(0, 23); }
  if (has('hair')) layer('hair-back', 'hair', () => { headTransform(); ctx.drawImage(texture('hair'), -8, -43, 16, 15); });
  if (has('body')) layer('neck', 'body', () => { ctx.fillStyle = model.parts.body.color; ctx.fillRect(-2, -25 + breath, 4, 7); });
  function limb(side: 'left' | 'right', leg: boolean) {
    const sign = side === 'left' ? -1 : 1, name = `${side}-${leg ? 'leg' : 'arm'}`;
    let angle = leg ? side === 'left' ? pose.leftLeg : pose.rightLeg : side === 'left' ? pose.leftArm : pose.rightArm;
    let bend = leg ? side === 'left' ? pose.leftKnee : pose.rightKnee : side === 'left' ? pose.leftElbow : pose.rightElbow;
    let upper = leg ? 10 : 9, lower = leg ? 11 : 10;
    if (leg && state.action === 'sit') { angle = profile ? -88 : view.column === 1 || view.column === 3 ? -40 + sign * 7 : -sign * 9; bend = -angle; upper = profile ? 9 : 5; lower = 9; }
    const w = leg ? fit.thigh / 5.5 : fit.arm / 6, lowerW = leg ? fit.calf / 6 : fit.arm / 7;
    ctx.save(); ctx.translate(sign * (leg ? fit.hip / 4 : fit.shoulder / 4.8), leg ? 0 : -19 + breath); ctx.rotate(radians(angle));
    if (has('body')) layer(name + '-upper-skin', 'body', () => capsule(w, upper, model.parts.body.color));
    if (has(leg ? 'pants' : 'top')) layer(name + '-upper-clothes', leg ? 'pants' : 'top', () => capsule(w + .7, upper, leg ? model.parts.pants.color : model.parts.top.color, leg ? pants : shirt, leg ? [side === 'left' ? 0 : .5, .08, .5, .49] : [profile ? .15 : side === 'left' ? 0 : .75, .22, profile ? .7 : .25, .42]));
    ctx.translate(0, upper); ctx.rotate(radians(bend));
    if (has('body')) layer(name + '-lower-skin', 'body', () => capsule(lowerW, lower, model.parts.body.color));
    if (has(leg ? 'pants' : 'top')) layer(name + '-lower-clothes', leg ? 'pants' : 'top', () => capsule(lowerW + .7, leg ? lower : lower - 2, leg ? model.parts.pants.color : model.parts.top.color, leg ? pants : shirt, leg ? [side === 'left' ? 0 : .5, .48, .5, .52] : [profile ? .15 : side === 'left' ? 0 : .75, .5, profile ? .7 : .25, .44]));
    ctx.translate(0, lower);
    if (!leg && has('body')) layer(name + '-hand', 'body', () => { ctx.fillStyle = model.parts.body.color; ctx.fillRect(-1, -1, 2, 4); });
    if (leg && has('shoes')) layer(name + '-boot', 'shoes', () => ctx.drawImage(footwearPiece(boots, side), -(lowerW + 3) / 2, -3, lowerW + 3, 7));
    if (!leg && side === 'right' && options.effects !== false && state.weapon !== 'unarmed' && ['attack', 'heavy-attack', 'combat-ready', 'block'].includes(state.action)) {
      layer('held-weapon', 'weapon', () => {
        const im = materialTexture('weapon', state.weapon, '#ffffff', gender, state.direction)!;
        const height = ({ dagger: 11, sword: 21, greatsword: 26, axe: 20, mace: 18, spear: 29, bow: 23, crossbow: 18, staff: 27 } as Record<string, number>)[state.weapon];
        const w = ['bow', 'crossbow'].includes(state.weapon) ? 11 : state.weapon === 'axe' ? 9 : 6;
        if (!['bow', 'crossbow'].includes(state.weapon)) ctx.rotate(Math.PI);
        const m = ctx.getTransform(), origin = m.transformPoint({ x: 0, y: 0 }); let scale = 1;
        for (const x of [-w / 2, w / 2]) for (const y of [-height * .85, height * .15]) {
          const point = m.transformPoint({ x, y }), dx = point.x - origin.x, dy = point.y - origin.y;
          if (dx > 0) scale = Math.min(scale, (91 - origin.x) / dx); if (dx < 0) scale = Math.min(scale, (5 - origin.x) / dx);
          if (dy > 0) scale = Math.min(scale, (89 - origin.y) / dy); if (dy < 0) scale = Math.min(scale, (7 - origin.y) / dy);
        }
        scale = Math.max(.05, Math.min(1, scale)); ctx.drawImage(im, -w * scale / 2, -height * .85 * scale, w * scale, height * scale);
      });
    }
    if (!leg && side === 'left' && options.effects !== false && state.action === 'block') layer('shield', 'weapon', () => ctx.drawImage(materialTexture('weapon', 'shield', '#ffffff', gender, state.direction)!, -7, -11, 14, 14));
    if (!leg && side === 'right' && options.effects !== false && state.action === 'cast') layer('spell-effect', 'effect', () => {
      const colors = { fire: '#f2a354', frost: '#a5e3e8', lightning: '#f3df91', healing: '#abe2a1', ward: '#9ac8e8', summon: '#c4a3e7', arcane: '#dda4df' };
      ctx.fillStyle = ctx.strokeStyle = colors[state.spell]; ctx.lineWidth = 1;
      if (state.spell === 'healing') { ctx.fillRect(-1, -8, 2, 8); ctx.fillRect(-4, -5, 8, 2); }
      else if (state.spell === 'lightning') { ctx.beginPath(); ctx.moveTo(2, -13); ctx.lineTo(-2, -7); ctx.lineTo(2, -7); ctx.lineTo(-2, 0); ctx.stroke(); }
      else if (state.spell === 'fire') { ctx.fillRect(-3, -5, 6, 5); ctx.fillRect(-2, -8, 4, 4); ctx.fillRect(0, -11, 2, 4); ctx.fillStyle = '#f8df8c'; ctx.fillRect(-1, -4, 2, 4); }
      else { ctx.beginPath(); ctx.arc(0, -4, state.spell === 'ward' ? 7 : 5, 0, Math.PI * 2); ctx.stroke(); if (state.spell === 'frost') { ctx.fillRect(-7, -5, 14, 1); ctx.fillRect(0, -11, 1, 14); } else { ctx.fillRect(-1, -6, 3, 3); } }
    });
    ctx.restore();
  }
  const back = profile ? 'left' : 'right', front = profile ? 'right' : 'left';
  limb(back, false); limb(back, true); limb(front, true);
  function torso(extra: number) {
    const shoulder = fit.shoulder / 4.8 + extra, waist = fit.waist / 4.8 + extra;
    ctx.beginPath(); ctx.moveTo(-2.5, -24 + breath); ctx.lineTo(2.5, -24 + breath); ctx.lineTo(shoulder, -19 + breath); ctx.lineTo(waist, 2); ctx.lineTo(-waist, 2); ctx.lineTo(-shoulder, -19 + breath); ctx.closePath();
  }
  if (has('body')) layer('torso-skin', 'body', () => { torso(0); ctx.fillStyle = model.parts.body.color; ctx.fill(); ctx.clip(); const w = Math.max(fit.shoulder, fit.waist) / 2.2; patch(body, [profile ? .1 : .25, 0, profile ? .8 : .5, .5], -w / 2, -24 + breath, w, 27 - breath); });
  if (has('pants')) layer('pants-waist', 'pants', () => { const w = fit.waist / 2.2; ctx.fillStyle = model.parts.pants.color; ctx.fillRect(-w / 2, -2, w, 6); patch(pants, [0, 0, 1, .24], -w / 2, -2, w, 7); });
  if (has('top')) layer('shirt-torso', 'top', () => { torso(.6); ctx.fillStyle = model.parts.top.color; ctx.fill(); ctx.strokeStyle = '#363438'; ctx.lineWidth = .65; ctx.stroke(); ctx.clip(); const w = Math.max(fit.shoulder, fit.waist) / 2.2; patch(shirt, [profile ? .10 : .25, 0, profile ? .8 : .5, 1], -w / 2, -24 + breath, w, 27 - breath); });
  limb(front, false);
  if (has('accessory') && model.parts.accessory.styleId === 'satchel') layer('hip-satchel', 'accessory', () => {
    ctx.strokeStyle = '#44392e'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-fit.shoulder / 5 + 1, -21); ctx.lineTo(fit.waist / 5, 3); ctx.stroke();
    const im = texture('accessory'); patch(im, [0, .32, 1, .68], fit.waist / 5 - 3, -1, 8, 10);
  });
  if (has('face')) layer('head', 'face', () => { headTransform(); ctx.drawImage(texture('face'), -7, -41, 14, 18); face(ctx, state.expression, view.column >= 3, profile, model.parts.face.color, model.parts.body.color); });
  if (has('hair')) layer('hair-front', 'hair', () => { headTransform(); ctx.drawImage(texture('hair'), -8, -43, 16, 15); });

  // Every exported layer uses the ground correction from the complete body, never its own bounds.
  const ground = canvas(), g = context(ground);
  for (const item of allLayers) if (APPEARANCE_SLOTS.includes(item.slot as AppearanceSlot)) g.drawImage(item.canvas, 0, 0);
  const alpha = g.getImageData(0, 0, 96, 96).data; let bottom = 0;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (alpha[(y * 96 + x) * 4 + 3]) bottom = y;
  const offset = 82 - bottom;
  const native = canvas();
  const selected = allLayers.filter(item => !options.layers || !APPEARANCE_SLOTS.includes(item.slot as AppearanceSlot) || options.layers.includes(item.slot as AppearanceSlot));
  for (const item of selected) context(native).drawImage(item.canvas, 0, offset);
  const output = document.createElement('canvas'); output.width = output.height = 384; const out = context(output); out.drawImage(native, 0, -2, 384, 384);
  const captured: PixelLayer[] = [];
  if (options.captureLayers) for (const item of selected) { const c = canvas(); context(c).drawImage(item.canvas, 0, offset); captured.push({ ...item, canvas: c }); }
  for (const item of allLayers) item.canvas.width = 0;
  result.width = ground.width = 0;
  return { canvas: output, native, layers: captured, keyframe: pixelFrameAt(state.action, state.progress).index };
}
