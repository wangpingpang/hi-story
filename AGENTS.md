# 项目约定

在需要人物生成时，调用人物生成器：《人物生成器说明.md》

在需要地图生成时，调用地图生成器：《地图生成器说明.md》

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
