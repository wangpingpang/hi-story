import { freeze } from '../contracts';
import * as characters from '../modules/characters';
export { APPEARANCE_CATALOG as appearanceCatalog, APPEARANCE_SLOTS as appearanceSlots } from '../modules/characters';
export type { Appearance, AppearanceSlot, AppearancePart } from '../modules/characters';

export class CharacterStudio {
  #model: characters.Appearance;
  #locked = new Set<characters.AppearanceSlot>();
  constructor(seed: string) { this.#model = characters.generateAppearance(seed); }
  query() { return freeze({ model: structuredClone(this.#model), locked: [...this.#locked] }); }
  generate(seed: string) { this.#model = characters.rerollAppearance(this.#model, seed, [...this.#locked]); }
  reroll(slot: characters.AppearanceSlot, seed: string) {
    if (this.#locked.has(slot)) throw Error('请先解锁该部件');
    this.#model = characters.rerollAppearancePart(this.#model, slot, seed);
  }
  lock(slot: characters.AppearanceSlot, locked: boolean) {
    if (!characters.APPEARANCE_SLOTS.includes(slot)) throw Error('未知外观部件');
    if (locked) this.#locked.add(slot); else this.#locked.delete(slot);
  }
  setPart(slot: characters.AppearanceSlot, part: characters.AppearancePart) {
    if (this.#locked.has(slot)) throw Error('请先解锁该部件');
    this.#model = characters.setAppearancePart(this.#model, slot, part);
  }
}
export type StudioView = ReturnType<CharacterStudio['query']>;
