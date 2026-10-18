import catalog from '../../content/equipment/catalog.json';
import {escapeHtml as html} from './html';
const sizes:Record<string,[number,number]>={'armor-01':[1086,1448],'armor-02':[1086,1448],'armor-03':[1086,1448],'weapons-01':[1254,1254],'shared-01':[1448,1086]};
export function equipmentGallery(classId:string){
 const items=catalog.items.filter(i=>'classId' in i&&i.classId===classId).slice(0,6);
 return `<details><summary>装备素材图鉴 · ${items.length} 件示例</summary><div class="equipment-gallery">${items.map(i=>{const [aw,ah]=sizes[i.asset.atlas],[x,y,w,h]=i.asset.rect.map((v,j)=>v*(j%2===0?aw:ah)),id=`equipment-${i.id}`;return `<figure><svg viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="${html(i.name)}"><defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><image clip-path="url(#${id})" href="${import.meta.env.BASE_URL}assets/equipment/${i.asset.atlas}.webp" width="${aw}" height="${ah}"/></svg><figcaption>${html(i.name)}</figcaption></figure>`;}).join('')}<p>已接入的装备静态素材。图鉴不授予物品、属性或穿戴效果；8方向装备动画仍待制作。</p></div></details>`;
}

