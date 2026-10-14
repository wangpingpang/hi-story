import catalog from '../../content/equipment/catalog.json';
import {escapeHtml as html} from './html';
export function equipmentGallery(classId:string){
 const items=catalog.items.filter(i=>'classId' in i&&i.classId===classId).slice(0,6);
 return `<details><summary>装备素材图鉴 · ${items.length} 件示例</summary><div class="equipment-gallery">${items.map(i=>{const [x,y,w,h]=i.asset.rect;return `<figure><svg viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="${html(i.name)}"><image href="${import.meta.env.BASE_URL}assets/equipment/${i.asset.atlas}.webp" width="1" height="1" preserveAspectRatio="none"/></svg><figcaption>${html(i.name)}</figcaption></figure>`;}).join('')}<p>已接入的装备静态素材。图鉴不授予物品、属性或穿戴效果；8方向装备动画仍待制作。</p></div></details>`;
}
