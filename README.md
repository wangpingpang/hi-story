# hi-story
你的故事写到了哪

## 雾桥递信 · 可玩小样

你是递信人沈青。过桥、经过旧渡口、递交信件；铜钱、绳索、时间、信任与公开姓名，都由你的选择决定。共 22 条合法路径，17 条今晚处理、5 条明早处理，两种结局都完成任务。

### 本地运行

使用 Node 24（本次 24.19.0）与 npm：

```sh
npm ci
npm run dev
```

打开终端输出的地址。点按选项即可游玩；键盘用 Tab 聚焦按钮、Enter/空格确认。所有阶段可重新开始。刷新页面会新开局；首版没有持久存档。

### 生产预览与验证

```sh
npm run typecheck
npm test
npm run check:boundaries
npm run build
npm run preview
```

浏览器端到端测试在 `vite preview` 的生产构建上运行：

```sh
# 先执行 npm run build；默认使用 /usr/bin/chromium
npm run test:e2e
# 其他系统：指定已安装 Chromium 的绝对路径
CHROMIUM_PATH=/path/to/chromium npm run test:e2e
```

如果没有 Chromium，可安装 Playwright 对应浏览器后，将 `CHROMIUM_PATH` 指向它；项目不会在运行游戏时联网下载素材。生产文件在 dist，可由任意 HTTP 静态服务器提供；不要直接以 file:// 打开。

### 结构与报告

- `src/modules`：17 领域边界，8 个必要领域有最小实现，其余明确未实现。
- `src/application`：命令验证、幂等、工作副本与原子提交。
- `src/input` / `src/presentation`：快照绑定输入、可访问 HTML、场景 SVG 与 PNG 人物装配。
- `src/infrastructure`：内存快照存储；`content`：版本化场景配置。
- [架构、选型与模块清单](docs/architecture.md)
- [最终验收报告](docs/test-report.md)
- [测试证据](docs/evidence/)

没有服务器、数据库、战棋、随机地图或多人；帮助不等于组队。性格记录只描述本局角色取舍，不推断真实用户。

### 在线试玩

公开 demo：https://wangpingpang.github.io/hi-story/

发布使用独立 `gh-pages` 静态分支；开发分支推送不会直接发布，未合并 main。[部署与公网验收记录](docs/deployment.md)。

### 随机人物工坊

开发分支 `codex/character-profiles` 新增七部件像素外观：**发型、脸型、身材、上衣、下装、鞋、饰品**。运行开发服务器后，访问 `/?view=character-generator`，或从旅程中的人物资料卡打开「人物工坊」。

- 整人随机、单部件重抽、手动选样式与颜色；支持锁定任意部件。
- 同一种子复现同一初始外观；导出 JSON 完整保留手动组合后的外观和所选身体类型，支持透明 PNG 导出。
- 沈青和陆砚每局生成外观，同局内保持稳定；人物资料及场景使用同一模型。
- 使用已归档的本地 PNG 部件装配人物；可切换男性/女性身体，选择交叠式上衣、及膝裙和长裙，衣物按身材调整。

[模型结构、公开接口与扩展说明](docs/character-generator.md)。这是静态二维外观模型，动作动画尚未实现。开发分支的工坊尚未发布到上述在线 demo。

### 人物图片素材（首版源图）

`public/assets/characters/` 新增两张由图像生成能力制作的 RGBA PNG 源素材图：

- `character-parts-v1.png`：发型、脸型、身材、上衣、下装、鞋及饰品七类部件。
- `female-parts-v1.png`：女性纤细、匀称、运动型宽肩、敦实四种身材，六种上衣与六种下装（含及膝裙、长裙）。
- `manifest.json`：各行部件清单、源图尺寸、完整生成和清理提示词。

源图已经通过版本化切片坐标、透明边缘清理、锚点校准和材质着色接入工坊与原故事人物展示；原图保持原样。规范画布为 144 × 288，工坊导出 576 × 1152 透明 PNG。女性身体、衣物与裙装已接入 `appearance/2`，`appearance/1` 的旧种子结果保持兼容。当前为固定正面站姿，尚无动作动画。

五次人物资料的装配结果：[总览](docs/examples/assembled/gallery.png) · [图片与数据](docs/examples/assembled/) · [下载包](artifacts/assembled-characters-v1.zip)。

### 随机故事工坊

访问 `/?view=story-generator`，体验中世纪剑与魔法背景的规则故事原型：种子生成、18个初始行动、NPC死亡联动、时间期限、地图通行变化与主支线结局。无AI API。战斗结算按钮用于模拟外部结果，地图输出需求而非地图本身。详见[接口与本版边界](docs/story-generator.md)。开发版尚未发布线上。

支持运行时加载、使用和卸载「营地故事」，或导入 JSON 故事规则包；已发生的事实和资源变化保留。规则包可通过应用层替换版本，基础包负责闭环。[热插拔规则设计与接口](docs/story-rule-packs.md)。

主线新增「线索→物资→抵达→完成」阶段任务，人物死亡/离场、资源丢失和道路变化会更新可行路线，完成记录保留；反应使用字段依赖索引调度。[阶段任务与依赖更新](docs/story-stage-planning.md)。
### 完整随机人物资料 v1

`generateCharacter(seed, options?)` 生成姓名、性别、年龄、职业、背景、专长、NPC 初始性格、动机及七部件外观。职业与背景、穿搭相互匹配；支持指定参数和玩家自定义背景。玩家性格留待后续选择证据，不在初始化时随机贴标签。

```sh
npm run characters:generate -- --seed hi-story-20261014 --count 5
```

[接口与范围](docs/character-generator.md#完整随机人物资料-v1) · [五次实际返回结果](docs/examples/random-characters-v1.json)。网页仍展示固定故事人物，此接口可供后续初始化和 NPC 生成调用。

### 故事传参生成 NPC

`generateCharacterWithParams({ seed, name?, occupation?, background?, personality?, preferences?, appearanceParts?, ... })` 保留故事已确定的性格、喜好、厌恶、动机和外观参数，自动补齐其余字段。支持 0–1 的自定义性格数值，并校验参数冲突与非法值。

```sh
npm run characters:generate -- --params docs/examples/story-npc-params.json
CHROMIUM_PATH=/path/to/chromium npm run characters:render -- --input docs/examples/random-characters-v1.json
```

[人物生成器说明](人物生成器说明.md) 包含公开接口、参数、枚举、素材装配和故事模块边界；[带参输入](docs/examples/story-npc-params.json) 与 [实际返回结果](docs/examples/story-npc-result.json) 可直接参考。根目录 `AGENTS.md` 已约定需要人物生成时调用本生成器。
