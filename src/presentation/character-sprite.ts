import { appearanceCatalogFor, appearanceSlots, type Appearance, type Gender } from '../application/character-studio';
import type { DeepReadonly } from '../contracts';
import { escapeHtml } from './html';
import { assembledCharacterUrl } from './character-art';

export function characterFigure(model:DeepReadonly<Appearance>,gender:Gender='male'):string {
  return `<image x="8" y="0" width="48" height="96" href="${assembledCharacterUrl(model,gender)}"/>`;
}
export function appearanceDescription(model:DeepReadonly<Appearance>):string {
  const catalog=appearanceCatalogFor(model.version);
  return appearanceSlots.map(slot=>`${catalog[slot].label}：${catalog[slot].styles.find(s=>s.id===model.parts[slot].styleId)?.label??''}`).join('，');
}
export function characterSprite(model:DeepReadonly<Appearance>,name='随机人物',gender:Gender='male'):string {
  return `<svg class="character-sprite" viewBox="0 0 64 96" role="img" aria-label="${escapeHtml(name+'，'+appearanceDescription(model))}" shape-rendering="crispEdges">${characterFigure(model,gender)}</svg>`;
}
