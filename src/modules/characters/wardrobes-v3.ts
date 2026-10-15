import type { AppearanceSlot } from './appearance';
import type { OccupationId } from './profile-catalog';
type Wardrobe=Record<'top'|'pants'|'shoes'|'accessory',readonly string[]>;
export const WARDROBES_V3:Record<OccupationId,Wardrobe>={
  courier:{top:['tunic','coat','doublet','winter'],pants:['straight','patched','cargo','breeches'],shoes:['ankle','boots','riding','wrapped'],accessory:['satchel','scarf','pouch','headband']},
  herbalist:{top:['shirt','tunic','wrap','sweater'],pants:['loose','patched','culottes','draped'],shoes:['cloth','ankle','sandals','wrapped'],accessory:['satchel','pendant','pouch','gloves']},
  blacksmith:{top:['shirt','vest','tank','gambeson'],pants:['straight','patched','shorts','cargo'],shoes:['boots','ankle','sabatons','wrapped'],accessory:['none','pendant','belt','bracers']},
  ranger:{top:['coat','tunic','gambeson','winter'],pants:['straight','patched','leggings','breeches'],shoes:['boots','ankle','riding','fur-boots'],accessory:['scarf','satchel','cloak','bracers']},
  'caravan-guard':{top:['armor','coat','gambeson','doublet'],pants:['straight','loose','breeches','cargo'],shoes:['boots','ankle','sabatons','riding'],accessory:['scarf','pendant','cloak','bracers']},
  innkeeper:{top:['shirt','vest','wrap','sweater'],pants:['loose','straight','skirt','pleated'],shoes:['cloth','ankle','sandals','fur-boots'],accessory:['none','earring','headband','belt']},
  'apprentice-mage':{top:['coat','tunic','robe','wrap'],pants:['loose','straight','long-skirt','draped'],shoes:['ankle','cloth','wrapped','fur-boots'],accessory:['pendant','glasses','cloak','gloves']},
  scribe:{top:['shirt','vest','doublet','sweater'],pants:['straight','loose','culottes','pleated'],shoes:['cloth','ankle','sandals','riding'],accessory:['glasses','satchel','headband','pouch']},
};
export const WARDROBE_SLOTS:readonly AppearanceSlot[]=['top','pants','shoes','accessory'];
