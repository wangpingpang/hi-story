import { ACTIONS, type Action, type Weapon, type Spell } from '../../application/character-motion';
import { sampleRigPose, type RigPose } from '../motion-clips';

export interface PixelClip { durationMs: number; loop: boolean; frames: readonly { progress: number; durationMs: number }[] }
const authored: Partial<Record<Action, { phases: number[]; durations: number[] }>> = {
  stand: { phases: [0, .25, .5, .75], durations: [400, 400, 400, 400] },
  walk: { phases: [0, .125, .25, .375, .5, .625, .75, .875], durations: [100, 100, 100, 100, 100, 100, 100, 100] },
  talk: { phases: [0, .15, .3, .5, .7, .9], durations: [220, 260, 180, 300, 280, 360] },
  attack: { phases: [0, .2, .4, .56, .78, 1], durations: [140, 120, 50, 70, 140, 180] },
  'heavy-attack': { phases: [0, .18, .35, .5, .65, .78, .9, 1], durations: [160, 180, 120, 60, 60, 140, 180, 200] },
};
export function pixelClip(action: Action): PixelClip {
  const meta = ACTIONS[action];
  if (!meta) throw Error('未知像素动作');
  const data = authored[action];
  if (data) return { durationMs: meta.duration, loop: meta.loop, frames: data.phases.map((progress, i) => ({ progress, durationMs: data.durations[i] })) };
  const count = 8, step = Math.floor(meta.duration / count);
  return { durationMs: meta.duration, loop: meta.loop, frames: Array.from({ length: count }, (_, i) => ({ progress: meta.loop ? i / count : i / (count - 1), durationMs: i === count - 1 ? meta.duration - step * (count - 1) : step })) };
}
export function pixelFrameAt(action: Action, progress: number): { index: number; phase: number; durationMs: number } {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw Error('像素动作进度无效');
  const clip = pixelClip(action), time = (clip.loop && progress === 1 ? 0 : progress) * clip.durationMs;
  let end = 0, index = clip.frames.length - 1;
  for (let i = 0; i < clip.frames.length; i++) { end += clip.frames[i].durationMs; if (time < end) { index = i; break; } }
  return { index, phase: clip.frames[index].progress, durationMs: clip.frames[index].durationMs };
}
export function pixelPose(action: Action, progress: number, weapon: Weapon, spell: Spell): RigPose {
  const { phase } = pixelFrameAt(action, progress);
  const pose = sampleRigPose(action, phase, weapon, spell);
  if (action === 'walk') {
    // Eight authored contact/down/passing/up silhouettes, with alternating swing-knee clearance.
    const wave = Math.sin(phase * Math.PI * 2);
    pose.leftLeg = -wave * 20; pose.rightLeg = wave * 20;
    pose.leftKnee = Math.max(0, wave) * 35; pose.rightKnee = Math.max(0, -wave) * 35;
    pose.leftArm = wave * 19; pose.rightArm = -wave * 19;
    pose.y = -Math.abs(Math.sin(phase * Math.PI * 4)) * 1.6;
  }
  return pose;
}
