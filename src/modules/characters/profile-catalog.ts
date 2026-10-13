import { freeze } from '../../contracts';

export const PROFILE_CATALOG = freeze({
  maleNames: ['莱恩', '奥伦', '伊恩', '加文', '罗恩', '凯尔', '洛克', '埃德'],
  femaleNames: ['艾琳', '莉娅', '米拉', '薇拉', '诺拉', '伊芙', '塞拉', '阿黛尔'],
  surnames: ['灰溪', '石桥', '风铃', '落叶', '白榆', '杉木', '河湾', '黑石'],
  origins: ['雾桥镇', '河湾小镇', '白榆村', '北境边城', '杉木林地', '旧港城区'],
  traits: [ ['谨慎', '果断', '好奇', '务实'], ['寡言', '健谈', '温和', '直率'], ['守信', '重义', '独立', '求知'] ],
});

// Each profession owns its coherent histories, practical wardrobe and future motivation.
// Motivations are character data, not automatically created quests or committed story facts.
export const OCCUPATIONS = freeze({
  courier: {
    label: '递信人', expertise: '认路、递信与凭证核验',
    histories: ['曾为河岸驿站递送商会信件，在一次封路后绕行山道完成了投递。', '曾跟随老递信人学习辨认驿路，后来独立完成了第一趟跨城递送。'],
    motivations: ['想找到一条更安全的跨城驿路。', '想弄清一封无人认领旧信的收件人。'],
    wardrobe: { top: ['tunic', 'coat'], pants: ['straight', 'patched'], shoes: ['ankle', 'boots'], accessory: ['satchel', 'scarf'] },
  },
  herbalist: {
    label: '草药师', expertise: '辨识草药、调配药膏与野外采集',
    histories: ['曾在村中药坊做学徒，用自己配制的药膏帮助受伤的旅人康复。', '曾跟随采药队穿越杉木林地，整理出一份当地常见草药的记录。'],
    motivations: ['想寻找一种能在寒冷地区生长的药草。', '想为故乡建立一个稳定的药材来源。'],
    wardrobe: { top: ['shirt', 'tunic'], pants: ['loose', 'patched'], shoes: ['cloth', 'ankle'], accessory: ['satchel', 'pendant'] },
  },
  blacksmith: {
    label: '铁匠', expertise: '锻造工具、修补护具与鉴别金属',
    histories: ['曾在小镇铁匠铺当学徒，后来独立修好了商队损坏的车轴。', '曾接手一间停业的工坊，通过修补农具重新赢得了邻里的信任。'],
    motivations: ['想取得一批适合打造耐用工具的矿石。', '想找回师傅遗失的一页锻造笔记。'],
    wardrobe: { top: ['shirt', 'vest'], pants: ['straight', 'patched'], shoes: ['boots', 'ankle'], accessory: ['none', 'pendant'] },
  },
  ranger: {
    label: '巡林人', expertise: '追踪足迹、辨认地形与林地巡查',
    histories: ['曾为村民巡查林间道路，在一次暴雨后带领迷路者返回村庄。', '曾跟随老巡林人学习追踪，后来独自完成了一个季节的林地巡查。'],
    motivations: ['想查清林间动物异常迁移的原因。', '想重新标记一条被废弃的山林小径。'],
    wardrobe: { top: ['coat', 'tunic'], pants: ['straight', 'patched'], shoes: ['boots', 'ankle'], accessory: ['scarf', 'satchel'] },
  },
  'caravan-guard': {
    label: '商队护卫', expertise: '护送、营地警戒与风险观察',
    histories: ['曾为沿河商队守夜，在一次险情中及时示警，让车队安全退回驿站。', '曾与一支商队走完漫长的边境路线，合同结束后选择独自旅行。'],
    motivations: ['想找到一份条件透明的护送委托。', '想确认下一段商路是否仍然安全。'],
    wardrobe: { top: ['armor', 'coat'], pants: ['straight', 'loose'], shoes: ['boots', 'ankle'], accessory: ['scarf', 'pendant'] },
  },
  innkeeper: {
    label: '旅店掌柜', expertise: '接待旅人、管理物资与辨认地方消息',
    histories: ['曾在家族的小旅店帮工，后来独立处理了一次因暴雪造成的旅客滞留。', '曾经营河岸旅店，在旧桥修复后恢复了来往旅人的住宿生意。'],
    motivations: ['想寻得稳定且价格合理的粮食供应。', '想请一位可靠的工匠修好旅店的屋顶。'],
    wardrobe: { top: ['shirt', 'vest'], pants: ['loose', 'straight'], shoes: ['cloth', 'ankle'], accessory: ['none', 'earring'] },
  },
  'apprentice-mage': {
    label: '法师学徒', expertise: '基础符文、文献阅读与魔法现象记录',
    histories: ['曾在地方学舍学习符文，通过了导师安排的基础抄写与辨认考核。', '曾协助导师整理旧书库，将散落的基础符文笔记编成了索引。'],
    motivations: ['想核对一处遗迹碑文上的陌生符号。', '想找到一本能补全现有知识缺口的入门典籍。'],
    wardrobe: { top: ['coat', 'tunic'], pants: ['loose', 'straight'], shoes: ['ankle', 'cloth'], accessory: ['pendant', 'glasses'] },
  },
  scribe: {
    label: '抄写员', expertise: '抄录契约、整理账簿与辨认笔迹',
    histories: ['曾替商会抄录货物契约，发现并纠正了一份账簿中的重复登记。', '曾在城中的档案室工作，将一批受潮的旧记录重新整理归档。'],
    motivations: ['想查明一份残缺契约中遗漏的条款。', '想找到一份能长期整理历史文献的工作。'],
    wardrobe: { top: ['shirt', 'vest'], pants: ['straight', 'loose'], shoes: ['cloth', 'ankle'], accessory: ['glasses', 'satchel'] },
  },
});
export type OccupationId = keyof typeof OCCUPATIONS;
