# 项目约定

在需要人物生成时，调用人物生成器：《人物生成器说明.md》

在需要地图生成时，调用地图生成器：《地图生成器说明.md》

在需要职业定义、角色成长、专精、兼职或职业技能时，调用职业模块：《职业模块说明.md》；公开入口 `src/modules/professions/index.ts`。

## 开发与同步

- 在 `codex/<task>` 开发分支工作，正常提交与推送属于已授权开发流程；不强制推送、不覆盖其他窗口修改。
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

随机任务生成器是任务生成模块的参与者；人物生成器是现有独立依赖。当前协议为 demo-contract/2、快照 schemaVersion=2；当前验收见 docs/demo-next-stage-report.md，首阶段历史记录见 docs/demo-integration-report.md，后续工作见 docs/development-backlog.md。

## 当前阶段 v0.1.0

- 下一阶段统一交付依据为《v0.1.0阶段说明.md》，开发前读取。V01—V03 是内部批次，完整冒险、结构化效果/背包/任务、连续事件、检定战斗和存档恢复统一验收发布。
- 阶段说明和各模块“v0.1.0 开发目标”是待实现范围，当前 demo-contract/2/schemaVersion=2 保持有效；新增接口和版本随代码同步。
- 自测通过后才能推送；发布再等真实浏览器整局验收。批次进度更新 docs/development-backlog.md，决定性改动更新受影响说明与 docs/decisions.md。

## v0.1.0 冒险执行基线

开发分支 codex/v010-adventure。新冒险公开入口为 application.createAdventureApplication，协议 demo-contract/3 / schemaVersion=3；原 GameApplication/schema2 保留回归。新界面默认入口与 ?view=demo，原 Demo 为 ?view=demo-legacy，原雾桥为 ?view=fog-bridge。当前逻辑自测已通过，浏览器/发布状态见 docs/v0.1.0-validation.md；不要把云端候选提交当作已发布。

## 职业规则初版

开发分支 codex/profession-module。职业目录 class-framework/1；可选接入规则 adventure-dnd/2-professions。252项为目录，主动执行9项；未实现项必须拒绝，不能扣资源或伪造成功。职业状态只由运行器持有，生命周期统一提交。默认页面/旧存档保持原模式，本轮不发布游戏。见《职业模块说明.md》及 docs/profession-validation.md。
