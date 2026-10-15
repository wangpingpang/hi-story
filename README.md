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
- `src/input` / `src/presentation`：快照绑定输入、可访问 HTML 与像素 SVG。
- `src/infrastructure`：内存快照存储；`content`：版本化场景配置。
- [架构、选型与模块清单](docs/architecture.md)
- [最终验收报告](docs/test-report.md)
- [测试证据](docs/evidence/)

剧情小样没有服务器、数据库、战棋或多人；帮助不等于组队。性格记录只描述本局角色取舍，不推断真实用户。独立地图生成接口见下方说明。

### 在线试玩

公开 demo：https://wangpingpang.github.io/hi-story/

发布使用独立 `gh-pages` 静态分支；开发分支推送不会直接发布，未合并 main。[部署与公网验收记录](docs/deployment.md)。

### 随机人物工坊

开发分支 `codex/character-profiles` 新增七部件像素外观：**发型、脸型、身材、上衣、裤子、鞋、饰品**。运行开发服务器后，访问 `/?view=character-generator`，或从旅程中的人物资料卡打开「人物工坊」。

- 整人随机、单部件重抽、手动选样式与颜色；支持锁定任意部件。
- 同一种子复现同一初始人物；导出 JSON 完整保留锁定和手动组合后的外观数据。
- 沈青和陆砚每局生成外观，同局内保持稳定；人物资料及场景使用同一模型。
- 使用本地代码生成 SVG 像素人物，不依赖图片服务；七部件共用骨架，衣裤随身材调整。

[模型结构、公开接口与扩展说明](docs/character-generator.md)。这是静态二维外观模型，动作动画尚未实现。开发分支的工坊尚未发布到上述在线 demo。

### 人物图片素材（首版源图）

`public/assets/characters/` 新增两张由图像生成能力制作的 RGBA PNG 源素材图：

- `character-parts-v1.png`：发型、脸型、身材、上衣、下装、鞋及饰品七类部件。
- `female-parts-v1.png`：女性纤细、匀称、运动型宽肩、敦实四种身材，六种上衣与六种下装（含及膝裙、长裙）。
- `manifest.json`：各行部件清单、源图尺寸、完整生成和清理提示词。

这是尚待切片和校准的首版图片素材，不是已经对齐的等尺寸图集；当前工坊仍使用 SVG，女性身材和裙装尚未写入运行时枚举。后续接入前需检查透明边缘、统一骨架锚点与服装适配。图片已归入开发分支，未发布到线上。

### 随机故事工坊

访问 `/?view=story-generator`，体验中世纪剑与魔法背景的规则故事原型：种子生成、18个初始行动、NPC死亡联动、时间期限、地图通行变化与主支线结局。无AI API。战斗结算按钮用于模拟外部结果，地图输出需求而非地图本身。详见[接口与本版边界](docs/story-generator.md)。开发版尚未发布线上。
### 完整随机人物资料 v1

`generateCharacter(seed, options?)` 生成姓名、性别、年龄、职业、背景、专长、NPC 初始性格、动机及七部件外观。职业与背景、穿搭相互匹配；支持指定参数和玩家自定义背景。玩家性格留待后续选择证据，不在初始化时随机贴标签。

```sh
npm run characters:generate -- --seed hi-story-20261014 --count 5
```

[接口与范围](docs/character-generator.md#完整随机人物资料-v1) · [五次实际返回结果](docs/examples/random-characters-v1.json)。网页仍展示固定故事人物，此接口可供后续初始化和 NPC 生成调用。

### 参数驱动的有界地图生成器 v1

`generateMap(storyMapParameters)` 接收故事确定的区域、连接、地貌、关键点和对象，生成具体格子、轮廓与坐标，检查边界、碰撞和必达路线。单人、有界、种子可复现；布局算法通过策略注册表扩展。

```sh
npm run maps:generate -- --request content/maps/example-request.json --output docs/examples/generated-map-v1.json --svg docs/examples/generated-map-v1.svg
```

[地图生成器说明](地图生成器说明.md) · [完整示例请求](content/maps/example-request.json) · [实际生成结果](docs/examples/generated-map-v1.json) · [空间校验图](docs/examples/generated-map-v1.svg)。地图接口尚未自动接入故事工坊或剧情小样；地貌和对象内容均由调用方指定。
