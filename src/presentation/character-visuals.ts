import { validateCharacterVisualFrame, type CharacterVisualFrame } from '../application/character-visuals';
import type { DeepReadonly } from '../contracts';
import { APPEARANCE_SLOTS } from '../application/character-motion';
import { loadDirectionalMaterials, renderCharacterMotionFrame, MOTION_ART_VERSION, type MotionRenderOptions } from './character-motion-art';
import { loadPixelMaterials, pixelSupport } from './pixel-character/materials';
import { renderPixelCharacter, PIXEL_ART_VERSION, PIXEL_FRAME } from './pixel-character/renderer';

export type CharacterRenderer = 'auto' | 'pixel-v1' | 'rig-v2';
export interface CharacterVisualOptions { renderer?: CharacterRenderer; layers?: MotionRenderOptions['layers']; effects?: boolean }
let pixelLoadError: string | undefined;
export async function loadCharacterVisuals(): Promise<void> {
  await loadDirectionalMaterials();
  try { await loadPixelMaterials(); pixelLoadError = undefined; } catch (error) { pixelLoadError = error instanceof Error ? error.message : '样板加载失败'; }
}
export function characterVisualCapability(frame: DeepReadonly<CharacterVisualFrame>, renderer: CharacterRenderer = 'auto') {
  validateCharacterVisualFrame(frame);
  if (!['auto', 'pixel-v1', 'rig-v2'].includes(renderer)) throw Error('未知人物渲染器');
  const reason = renderer === 'rig-v2' ? undefined : pixelLoadError ?? pixelSupport(frame);
  const selected = renderer !== 'rig-v2' && !reason ? 'pixel-v1' as const : 'rig-v2' as const;
  if (renderer === 'pixel-v1' && reason) throw Error(`像素样板不支持：${reason}`);
  return { renderer: selected, artVersion: selected === 'pixel-v1' ? PIXEL_ART_VERSION : MOTION_ART_VERSION, fallbackReason: renderer === 'auto' ? reason : undefined };
}
export function renderCharacterVisualFrame(frame: DeepReadonly<CharacterVisualFrame>, options: CharacterVisualOptions = {}) {
  const capability = characterVisualCapability(frame, options.renderer);
  if (options.layers && (!Array.isArray(options.layers) || options.layers.some(slot => !APPEARANCE_SLOTS.includes(slot)))) throw Error('导出图层无效');
  const canvas = capability.renderer === 'pixel-v1'
    ? (() => { const value = renderPixelCharacter(frame, options); value.native.width = 0; return value.canvas; })()
    : renderCharacterMotionFrame(frame.actor.appearance, frame.actor.gender, { ...frame.pose, ...options });
  return { ...capability, canvas, frame: { width: PIXEL_FRAME.width, height: PIXEL_FRAME.height, anchor: { ...PIXEL_FRAME.anchor } } };
}
