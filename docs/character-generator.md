# 随机人物外观生成器

开发分支：`codex/character-profiles`。入口：`/?view=character-generator`。

## 模型与职责

人物领域拥有外观数据，应用层管理工坊操作，展示层将本地 PNG 部件装配到 144 × 288 画布，SVG 仅作为页面和场景的图片容器。数据生成器不依赖浏览器、故事状态、物品库存或战斗规则。衣物与饰品目前只表达外观，不自动赋予装备、属性或资源。完整带参接口与装配用法见根目录 [人物生成器说明](../人物生成器说明.md)。

| 字段 | 样式数 | 颜色数 | 渲染含义 |
| --- | ---: | ---: | --- |
| hair 发型 | 6 | 6 | 短发、齐耳发、长发、马尾、发髻、莫霍克发 |
| face 脸型 | 4 | 4 | 椭圆、圆、方、棱角；颜色用于眼睛 |
| body 身材 | 4 | 5 | 纤细、匀称、宽肩、敦实；颜色统一用于面部与四肢肤色 |
| top 上衣 | 6 | 6 | 束腰衫、衬衣、马甲、短外套、轻甲、交叠式上衣 |
| pants 下装 | 6 | 5 | 直筒、宽裤、短裤、补丁裤、及膝裙、长裙 |
| shoes 鞋 | 4 | 4 | 长靴、短靴、布鞋、凉鞋 |
| accessory 饰品 | 6 | 5 | 无、围巾、眼镜、耳饰、挎包、吊坠 |

`Appearance = { version: 'appearance/1' | 'appearance/2', seed, parts }`，`parts` 中七个字段均为 `{ styleId, color }`。上表为版本 2 的目录；版本 1 保留五种上衣和四种裤子。`appearanceCatalogFor(version)` 返回对应的深冻结目录，模型通过 `validateAppearance` 校验，生成和修改操作不改变输入模型。工坊默认版本 2，旧数据生成接口默认版本 1，以保留历史种子结果。

种子必须为 1–128 字符，不能全为空白。算法使用 FNV-1a 初始化 Mulberry32，每个部件使用 `版本:种子:部件名` 的独立随机序列。相同版本、目录与种子保证一致输出；重抽一个部件不会改变其他部件。随机可能再次抽中原样式，不保证每次不同；不用于密码或安全随机。

只有初始的完整随机模型可以单凭种子复现。锁定后重抽、单部件重抽、手动修改会产生组合模型，其中 `seed` 表示最近使用的生成种子；复现这类模型应保存完整 JSON。导出的模型包括所有部件，但不包括工坊临时锁定状态。当前没有网页导入或持久存档功能。

## 公开接口

从 `src/modules/characters/index.ts` 导入：

```ts
import {
  generateAppearance, rerollAppearance, rerollAppearancePart,
  setAppearancePart, validateAppearance,
} from '../modules/characters';

const first = generateAppearance('world-1:npc-42');
const next = rerollAppearance(first, 'world-1:npc-42:2', ['hair', 'body']);
const shirt = rerollAppearancePart(next, 'top', 'shirt-3');
const edited = setAppearancePart(shirt, 'accessory', {
  styleId: 'satchel', color: '#795e45',
});
validateAppearance(edited);
```

应用层 `CharacterStudio` 拥有锁定集合；拒绝对锁定部件的手动修改和单独重抽。失败不会部分改变状态，查询返回独立、深冻结快照。展示层只依赖应用公开类型和目录，不读取人物领域内部文件。

旅程人物版本提升为 `characters/2`，每局使用 `runId:actorId` 生成不同人物；换幕、搬箱劳累等操作保留外观。该分支尚未支持持久存档，因此没有旧版本存档迁移。

## 像素绘制与扩展

绘制顺序为背部头发、身体、下装、鞋、上衣、脸、前部头发及饰品。男女身体和衣物使用各自原型图中的部件，按身材调整衣宽；脸型不随身体横向拉伸。肤色由 body 控制，锁定脸型只锁定面部轮廓与眼睛颜色。生成 PNG 使用真实透明背景和最近邻放大。

新部件样式需要添加版本化目录 ID 和 `character-art-layout.ts` 中的源图切片及装配坐标，再检查透明边缘与装配位置。改变目录顺序、随机算法或既有 ID 会影响种子复现，须提升外观版本。`character-art.ts` 加载素材、清理透明边缘、着色并装配；`character-sprite.ts` 负责页面图片容器。移动、动作、战斗动画仍需单独实现。

## 验证

执行 `npm run typecheck`、`npm test`、`npm run check:boundaries`、`npm run build`。逻辑测试覆盖七部件、1000 个固定种子的合法性与目录覆盖、锁定、单部件隔离、非法输入、JSON 往返、不可变快照及故事外观稳定性。浏览器测试覆盖桌面和窄屏的种子复现、锁定、手动选择、重抽、错误提示、JSON 下载和返回故事。

模块检查允许同一领域的内部文件互相导入，仍禁止跨领域内部导入、展示层直读领域及领域依赖浏览器。

最新装配验收结果见 [character-assembly-validation.json](evidence/character-assembly-validation.json)。检查包括带参数据保留、旧版本兼容、所有切片与目标坐标边界、男女身体切换、裙装、PNG 尺寸与二值透明边缘、桌面/窄屏和旧故事流程。测试服务器绑定回环地址；独立 Chromium 运行包未加入项目依赖。

工坊页面截图：[桌面](evidence/character-generator-desktop.png)、[窄屏](evidence/character-generator-narrow.png)。此前故事小样的验收文件保持原始记录。

## 完整随机人物资料 v1

新增公开接口 `generateCharacter(seed, options?)`，版本为 `random-character/1`。默认生成 NPC：姓名、性别、18–70 岁年龄、职业、职业背景、专长、初始性格、当前动机，以及完整七部件外观。职业目录包含递信人、草药师、铁匠、巡林人、商队护卫、旅店掌柜、法师学徒、抄写员；背景、动机、衣裤鞋和饰品按职业选择，姓名和外观不按性格贴标签。

```ts
import { generateCharacter, generatedCharacterSnapshot } from '../modules/characters';

const npc = generateCharacter('world-1:npc-42');
const player = generateCharacter('world-1:player-1', {
  control: 'player', gender: 'female', age: 24,
  occupationId: 'ranger', name: '自定义旅人', background: '在林地长大，后来离乡旅行。',
});
const immutable = generatedCharacterSnapshot(npc);
```

NPC 初始性格来自三个独立维度，各取一项，不代表已观察到的行为证据。玩家初始 `personality.traits` 为空，来源为 `choice-evidence`，后续仍由性格领域根据选择描述倾向。自定义背景原样保留并标记 `provided`，不另外推断出生地。动机只是背景设定，生成器不会创建任务、地图、遭遇或已确认事实。

种子对各字段独立派生随机序列；相同版本、目录、种子和参数可以完整复现。覆盖性别不会扰动年龄、职业与外观。`actorId` 为 `character:<seed>`，同种子视作同一人物；调用方应为不同人物分配不同种子。这不是全球唯一编号服务。仅初始成年人物范围已实现，后续可扩展年龄和身份目录。

完整资料生成器通过以下命令调用，不需要启动网页：

```sh
npm run characters:generate -- --seed hi-story-20261014 --count 5
```

命令逐次调用生成接口，使用 `hi-story-20261014:1` 至 `:5` 五个子种子，输出一个包含五份完整人物资料的 JSON。不指定种子时使用新 UUID；调用次数范围为 1–100。原始五次返回结果在 [random-characters-v1.json](examples/random-characters-v1.json)。

当前网页工坊为外观编辑器，完整资料接口尚未替换固定故事中的沈青与陆砚。数据生成不依赖素材文件；图片装配已使用本地 PNG 源素材和实际人物资料完成，[五个人物图片](examples/assembled/gallery.png) 对应此前五次返回数据。新带参接口 `generateCharacterWithParams` 支持自定义职业、专长、背景、NPC 性格与数值参数、喜好/厌恶、动机及外观覆盖；用法和字段限制见 [人物生成器说明](../人物生成器说明.md)。
