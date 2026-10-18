import type {AdventureEquipmentView,EquipmentCombatProfile} from '../application';
import {getEquipmentAtlas,type EquipmentDefinition} from '../application/equipment';
import type {DeepReadonly} from '../contracts';
import {escapeHtml as html} from './html';
import './equipment-inventory.css';

const signed=(n:number)=>`${n>=0?'+':''}${n}`;
function training(item:DeepReadonly<EquipmentDefinition>):string {
 const armor={light:'轻甲',medium:'中甲',heavy:'重甲',shield:'盾牌'};
 const weapon={unarmed:'徒手',dagger:'匕首',sword:'剑',greatsword:'巨剑',axe:'斧',mace:'钉锤',spear:'矛',bow:'弓',crossbow:'弩',staff:'法杖'};
 return item.armor&&item.armor!=='none'?`${armor[item.armor]}熟练`:item.weaponFamily?`${weapon[item.weaponFamily]}类武器熟练`:'无额外熟练要求';
}
function statistics(p:DeepReadonly<EquipmentCombatProfile>){return `AC ${p.defense} · 命中 ${signed(p.attackBonus)} · 伤害 d${p.damageDie}${signed(p.damageBonus)} · 射程 ${p.range}`;}
function icon(item:DeepReadonly<EquipmentDefinition>){
 const atlas=getEquipmentAtlas(item.asset.atlas),rect=item.asset.rect;if(!rect)return '';
 const [x,y,w,h]=rect.map((v,i)=>v*(i%2?atlas.height:atlas.width));
 return `<svg class="equipment-icon" viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="${html(item.name)}"><image href="${import.meta.env.BASE_URL}assets/equipment/${item.asset.atlas}.webp" width="${atlas.width}" height="${atlas.height}"/></svg>`;
}
export function renderAdventureEquipment(view:DeepReadonly<AdventureEquipmentView>,busy:boolean):string {
 const p=view.combat;
 return `<section class="live-equipment" aria-label="装备与属性">
 <h3>当前装备</h3><div class="equipment-summary" data-equipment-summary aria-label="装备战斗属性"><span>防御 <b data-equipment-defense>${p.defense}</b></span><span>命中 <b data-equipment-attack>${signed(p.attackBonus)}</b></span><span>伤害 <b data-equipment-damage>d${p.damageDie}${signed(p.damageBonus)}</b></span><span>射程 <b data-equipment-range>${p.range}</b></span></div>
 <div class="equipment-slots">${view.slots.map(slot=>`<div data-equipment-slot="${slot.id}" class="equipment-slot ${slot.instanceId?'is-equipped':''}"><small>${slot.label}</small><strong>${html(slot.name??'未穿戴')}</strong></div>`).join('')}</div>
 <p class="equipment-note">${view.locked?'当前不能换装。':'探索时可穿戴或卸下装备，数值即时生效。'}穿戴改变属性，人物造型暂不随装备变化。</p>
 <h3>装备背包 <small>${view.owned.length} 件实物</small></h3>
 <div class="owned-equipment">${view.owned.map(item=>`<article class="equipment-card" data-equipment-instance="${item.instanceId}">${icon(item.definition)}<div class="equipment-detail"><strong>${html(item.definition.name)}</strong><small class="equipment-badge">${item.equippedSlot?'已穿戴':'背包中'}</small><small>所需熟练：${training(item.definition)}</small><p>${html(item.definition.design)}</p>${item.preview?`<small class="equipment-preview">穿戴后：${statistics(item.preview)}</small>`:''}${item.reason?`<small class="equipment-reason">${html(item.reason)}</small>`:''}<button ${item.equippedSlot?`data-equipment-unequip="${item.equippedSlot}"`:`data-equipment-equip="${item.instanceId}"`} ${busy||view.locked||(!item.equippedSlot&&item.reason)?'disabled':''}>${item.equippedSlot?'卸下':'穿戴'}${html(item.definition.name)}</button></div></article>`).join('')||'<p class="equipment-empty">暂时没有装备。商道营地可购买；整理林间补给营地也能找到一把匕首。</p>'}</div>
 <details class="equipment-shop" open><summary>商道装备商店</summary><p class="equipment-note">${html(view.shopReason||'营地医者在此出售装备，态度影响价格。')}</p>${view.shop.map(offer=>`<article class="equipment-card" data-equipment-offer="${offer.definition.id}">${icon(offer.definition)}<div class="equipment-detail"><strong>${html(offer.definition.name)}</strong><small>${html(view.slots.find(s=>s.id===offer.definition.slot)?.label??'装备')}${offer.definition.hands===2?' · 双手':''} · 所需熟练：${training(offer.definition)}</small>${offer.preview?`<small class="equipment-preview">穿戴后：${statistics(offer.preview)}</small>`:''}${offer.equipReason?`<small class="equipment-reason">穿戴要求：${html(offer.equipReason)}</small>`:''}<button data-equipment-buy="${offer.definition.id}" ${busy||offer.reason?'disabled':''}>购买${html(offer.definition.name)} · ${offer.price}金币</button>${offer.reason&&!view.shopReason?`<small>${html(offer.reason)}</small>`:''}</div></article>`).join('')}</details>
 </section>`;
}
