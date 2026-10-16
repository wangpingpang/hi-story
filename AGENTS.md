# 项目约定

## 场景卡顿修复

已发布源码1517e82、部署7feee2c，Pages38933988725成功；公网5文件哈希和两种尺寸4倍CPU减速真实交互复验通过。分支codex/fix-scene-freeze继承0357269。真实减速复现持续景物重绘阻塞，改为静态景物层缓存、可视区域裁切、演员/地标/遮挡区域按原深度局部重绘；空闲与慢设备降低绘制频率，后台跳过绘制。保留人物中心、权威规则和schema4存档。本地10项交互回归与2项真实计时慢设备检查分批通过，类型/边界/构建通过；发布与限制见docs/scene-freeze-validation.md。

## 人物中心镜头修复

已发布源码250d837、部署9788c58，Pages38842648227成功，公网桌面/375px中心跟随复验通过。分支codex/player-centered-camera，基于30ba3ae。按用户要求移除构图偏移和拖图脱离，Canvas与SVG按同一显示人物中心同步；探索、战术移动、缩放和屏幕变化均保持人物居中。产品0.4.0及存档不变。12项桌面/375px浏览器复验通过，发布状态见docs/player-camera-validation.md。

## v0.4.0 体验自测迭代

已发布源码eaa7c78，部署3d1b154；Pages38803285718成功。320项逻辑、44个浏览器用例分批通过，公网80文件/10交互检查通过。分支codex/v040-world-polish继承99f1bc8。依据《v0.4.0阶段说明.md》，重构场景地表/密林/高差/软迷雾与遮挡，步行保留DOM，NPC实际靠近后交谈；战斗保留所在地背景，queryCombatMovement委托运行器。产品0.4.0，schema4与存档槽不变。实际状态见docs/v0.4.0-validation.md。

## v0.3.0 跨会话集成

本轮已发布：产品源码d2cec6b，部署7db836b，Pages38785236384与公网38785358454成功。315项逻辑、104项浏览器用例分批验收通过，80文件公网哈希一致；不是一次全量全绿。整合入口codex/v030-convergence，证据与限制见docs/v0.3.0-validation.md。main和先前被拦截的共享分支仍不改动。

动作接线复查分支codex/v030-motion-fix：纠正战斗结束后的坐标来源、攻击朝向、徒手与治疗动作；不改权威结算。补充7项动作适配单测和实际战斗后探索用例，受影响浏览器复验与原102项整局候选记录分开保留，成功后保留历史回到版本分支。

本轮开发codex/v030-convergence，依据《v0.3.0阶段说明.md》，继承bbc22a0/8899a31/8d0a007/536de30/dc2f0a5并保留来源历史。产品0.3.0，领域snapshot仍0.2.1/schema4。共享分支先前拦截未解除，本轮不更新其引用。浏览器通过后才能发布，实际状态见docs/v0.3.0-validation.md。

## v0.2.1 连续探索地图

当前开发分支 `codex/map-world-v2`，基于已推送整合版 `bbc22a0`。产品与新冒险 snapshot.version 为 `0.2.1`，新协议 `demo-contract/4 / schemaVersion=4 / adventure-content/2`；地图生成接口继续 `bounded-map/2`。下方 v0.2.0 与 schema3 为历史版本。验证状态见 `docs/map-world-v2-validation.md`。

新冒险64×50、free-movement/1，战斗9×7不变。新档使用 `hi-story:adventure:world-v2`，旧v010槽保留，不静默迁移。不得将此前已丢失的本地 `a81826b` 当作本轮提交；本轮重新实现并独立验证后正常推送，未合并共享分支或切换线上版本。公开素材使用恢复的五套原创图集，内部装备/动作制作规范仍不公开。

## v0.2.0 当前集成迭代

本轮完整交付在codex/v020-hd2d。共享codex/demo-integration-v1仍为3caaeb4：更新被安全审查拦截，未绕过；需用户确认保留历史的合并后再同步，不能宣称共享集成已完成。

开发分支 codex/v020-hd2d，阶段依据《v0.2.0阶段说明.md》。集成公开职业模块14e9080、公开装备包与原创HD-2D场景；内部动作/形态制作规范不得复制至公开仓库。产品版本0.2.0，领域快照版本0.1.0/schema3保持兼容。213项逻辑/58项浏览器及公网12文件/恢复验证通过，已发布d6de277；完整状态以docs/v0.2.0-validation.md为准。

在需要人物生成时，调用人物生成器：《人物生成器说明.md》

在需要地图生成时，调用地图生成器：《地图生成器说明.md》

在需要职业定义、角色成长、专精、兼职或职业技能时，调用职业模块：《职业模块说明.md》；公开入口 `src/modules/professions/index.ts`。

## 开发与同步

- 在 `codex/<task>` 开发分支工作，本公开仓库的正常开发提交与上传已获用户明确授权（2026-10-16再次确认），无需逐次重复请求；不强制推送、不覆盖其他窗口修改。
- 每个决定性改动必须同时更新所有受影响的模块说明、接口版本与集成记录。说明和代码放在同一个提交中。
- 开发前读取《模块边界与开发同步说明.md》及所属模块说明；跨模块只调用公开入口。
- 报告实际测试结果、分支和提交；说明已完成不代表功能已实现或集成验收通过。

## 六模块说明入口

| 模块 | 必读说明 | 公开代码入口 |
| --- | --- | --- |
| 生命周期 | 应用编排与本局状态模块说明.md | src/application/index.ts |
| 运行器 | 运行器模块说明.md | src/modules/runtime/index.ts |
| 事物 | 事物模块说明.md | src/modules/things/index.ts |
| 随机故事 | 随机故事生成器说明.md | src/modules/story-planning/index.ts |
| 任务生成 | 任务生成模块说明.md | src/modules/quest-generation/index.ts |
| 地图生成 | 地图生成器说明.md | src/modules/world/index.ts |

随机任务生成器是任务生成模块的参与者；人物生成器是现有独立依赖。旧 Demo 协议为 demo-contract/2、快照 schemaVersion=2；历史空间 v2 验收见 docs/demo-next-stage-report.md，首阶段历史记录见 docs/demo-integration-report.md，后续工作见 docs/development-backlog.md。

## 当前阶段 v0.1.0

- 下一阶段统一交付依据为《v0.1.0阶段说明.md》，开发前读取。V01—V03 是内部批次，完整冒险、结构化效果/背包/任务、连续事件、检定战斗和存档恢复统一验收发布。
- 阶段说明和各模块“v0.1.0 开发目标”是待实现范围，当前 demo-contract/2/schemaVersion=2 保持有效；新增接口和版本随代码同步。
- 自测通过后才能推送；发布再等真实浏览器整局验收。批次进度更新 docs/development-backlog.md，决定性改动更新受影响说明与 docs/decisions.md。

## v0.1.0 冒险执行基线

开发分支 codex/v010-adventure。新冒险公开入口为 application.createAdventureApplication，协议 demo-contract/3 / schemaVersion=3；原 GameApplication/schema2 保留回归。新界面默认入口与 ?view=demo，原 Demo 为 ?view=demo-legacy，原雾桥为 ?view=fog-bridge。本轮167项逻辑/52项浏览器及公网验证通过并发布，最终状态见 docs/v0.1.0-validation.md。集成窗口从更新后的 codex/demo-integration-v1 读取；旧段落为历史基线。

开发分支 codex/v010-adventure。新冒险公开入口为 application.createAdventureApplication，协议 demo-contract/3 / schemaVersion=3；原 GameApplication/schema2 保留回归。新界面默认入口与 ?view=demo，原 Demo 为 ?view=demo-legacy，原雾桥为 ?view=fog-bridge。当前逻辑自测已通过，浏览器/发布状态见 docs/v0.1.0-validation.md；不要把云端候选提交当作已发布。

## 职业规则初版

开发分支 codex/profession-module。职业目录 class-framework/1；可选接入规则 adventure-dnd/2-professions。252项为目录，主动执行9项；未实现项必须拒绝，不能扣资源或伪造成功。职业状态只由运行器持有，生命周期统一提交。默认页面/旧存档保持原模式，本轮不发布游戏。见《职业模块说明.md》及 docs/profession-validation.md。

## 骰子反馈开发入口

codex/dice-feedback 的 dice-feedback/1 增量见《骰子动画与反馈说明.md》及 docs/dice-feedback-validation.md。骰子结果由已提交快照提供；表现层禁止额外掷骰、重放命令或结算。基于3caaeb4，后续场景分支应按公开入口集成，不能直接覆盖新版地图界面。

人物动作、表情和新版外观扩展遵循《人物动作与表情说明.md》。生命值为 0 不等于死亡；死亡须由运行器明确传入。


## 2026-10-15 职业装备扩展

需要职业装备、穿戴、体型适配或通用动作/可见策略时，读取《装备系统说明.md》，公开入口src/modules/equipment/index.ts。102设计/36配置/纯规则/正面静态原型已完成；真实背包、战斗和存档未接入。详细动作与具体形态资料独立内部保存，禁止放入公开仓库和职业之书页面/下载。
