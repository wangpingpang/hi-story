# hi-story 架构与范围

## 当前生成与探索Demo

2026-10-14在codex/demo-integration-v1基于d0d4346接入地图与六组模块的首个增量。入口`/?view=demo`；原雾桥、人物工坊、故事工坊继续保留。沿用项目现有Vite、TypeScript、DOM/SVG与像素人物素材。

| 工作模块 | 代码入口 | 数据归属 |
| --- | --- | --- |
| 生命周期 | application/index.ts | 本局身份、应用revision、提交、回执和队列 |
| 运行器 | modules/runtime/index.ts | 坐标、HP、视野、战斗和随机状态 |
| 事物 | modules/things/index.ts | 金币物品、任务实例、事件结算及事实 |
| 随机故事 | modules/story-planning/index.ts | 计划、规则、选项、叙事设定及空间需求 |
| 任务生成 | modules/quest-generation/index.ts | 参与者聚合与校验后的蓝图 |
| 地图生成 | modules/world/index.ts | 静态空间、锚点与落点 |

人物生成器提供资料，运行器持有独立实例。已有World物资、任务及存活字段作为兼容结构：事务开始输入事物数据，故事计算一次候选效果，事物接收结果，生命周期校验并一次发布。禁止两处独立扣费。

初始化：故事/NPC、空间需求、地图、玩家、运行器、任务蓝图、事物实例、校验提交。命令先复制输入，在串行队列校验，在工作副本调用领域、协调物资/任务投影、检查一致性，最后一次提交。epoch阻止重开后的旧事务发布。

依赖只走公开入口：故事引用地图请求类型；任务生成依赖契约工具；运行器引用地图与人物类型；事物使用故事、任务和运行器接口；生命周期组合模块，展示只读应用投影。没有隐式事件总线。拆除World兼容字段需要独立迁移契约。

当前逻辑实现探索、空间交互、阶段更新、踩点任务、最小骰子战棋、成功/战败/主动退出与重开。地图已扩展为四种声明式布局，交互地点和NPC落点随种子变化，战斗为7×5简化回合；任意随机迷宫、伙伴、完整DND、动态区域/NPC创建和存档尚未完成。当前151项逻辑和30项桌面/375px浏览器检查通过，包含完整目标与骰子战斗，见demo-next-stage-report.md。

下面保留原雾桥架构与历史验收，其17领域表描述原小样，不代表新Demo模块的当前进度。

## 来源与初始状态

2026-10-13 成功读取项目的[领域模块与开发边界](https://chatgpt.com/space/page_4cc1da4ba8cc8191b4aba97d9e2a8900)与[最终游戏场景设想](https://chatgpt.com/space/page_8a5ae7fdb8088191962d3b68f3d67cb0)。本次按实际页面及授权玩法实施，不需要降级到摘要。透明成本、合理取舍、持续后果与小循环试玩来自任务中已研究的 game-design-core 原则；本轮未安装第三方 skill 或执行其脚本。

检查结果：工作区原始分支 `work`，干净；本地及远端 main 为 `78f8e4b7852037da26105cad1f3f30c2741960f7`，内容仅 README。`git ls-remote --heads origin` 仅列 main；GitHub API 对 `codex/project-setup`、`beee112` 返回 422；本地 `git cat-file -t beee112` 无对象，reflog 仅初始获取。不能据此推断先前环境的未推送提交已永久丢失。当前工作区没有 AGENTS.md 或 .agents/skills。保留原 README 首两行，从原始提交创建 `codex/fog-bridge-demo`。

## 框架选择

Vite 8.3.4 + TypeScript 7.0.2，原生 DOM 与 SVG。三幕确定性选择不需要物理、碰撞、镜头或游戏主循环，暂不引入 Phaser；原生按钮同时服务键盘、触摸与辅助技术。领域逻辑独立于浏览器。Vitest 5.0.4 验证逻辑，Playwright 1.64.0 验证生产预览；包版本在 npm registry 实际查询后以精确版本及 package-lock 锁定。运行环境 Node 24.19.0，npm 11.9.0，Chromium 154.0.8037.57。

官方核对：[Vite](https://vite.dev/guide/)、[Vitest](https://vitest.dev/guide/)、[Playwright](https://playwright.dev/docs/intro)。Node 需符合 package.json engines；本次使用 Node 24。

## 编排及数据流

`input → application → 领域公开接口 → infrastructure 原子提交 → presentation 只读投影`

- application 验证 actorId、runId、eventInstanceId、revision、阶段、物资及命令编号。同步执行工作副本上的所有领域操作，最后仅一次 store.commit；异常不发布事实、不扣资源、不留 receipt。
- commandId 同载荷返回原 revision，不重复生效；同编号不同载荷拒绝。载荷使用显式字段数组规范化。新局先检查 runId，不能让旧局 receipt 掩盖旧命令。
- input 在渲染时捕获快照，旧按钮不会临时读取新 revision。UI 在一次提交后锁定 240ms，避免双击跨幕；重开时新 runId 使旧 timeout 直接失效。
- presentation 只消费深冻结的独立投影，展示所有成本、绳索禁用原因、任务/资源/关系变化、事实与证据。焦点在换幕后进入标题。
- content/fog-bridge.ts 保存版本 `fog-bridge/1.0.0` 的场景与选项。全配置深冻结。
- infrastructure/MemoryStore 保存单个内存快照，每次读取和提交均复制。首版不支持刷新恢复，不接入数据库、账户、网络存档。刷新会新开局。
- 跨模块只导入 index.ts 公开接口；不建立共享可写角色大对象。State 只作为应用聚合快照，浏览器拿不到权威引用。唯一写入规则由公开领域函数维护。

## 原雾桥的17个领域实现清单

| 领域 | 本次状态 / 公开能力 | 数据归属、规则与边界 |
| --- | --- | --- |
| adventure | 已实现 start / advance | runId、stage、revision、elapsed；只推进三幕，不计算任务具体条件 |
| world | 未实现，README 边界 | 后续拥有地图、地形、对象位置；本次 SVG 仅装饰，不伪造可探索地图 |
| exploration | 未实现，README 边界 | 后续视野、可达交互；本次选择不模拟移动 |
| characters | 最小 create | 唯一角色身份「沈青」及 courier ID；无成长、生命系统 |
| inventory | 已实现 create / consume | 铜钱、绳索、草图唯一写入；余额不得负数；草图不重复发放 |
| rules | 未实现，README 边界 | 后续纯计算骰子/属性规则；本次没有随机检定 |
| combat | 未实现，README 边界 | 无战棋、战斗回合、伤害 |
| objectives | 已实现 create / complete | 任务完成、今晚/次晨处理、公开簿姓名；耗时 ≤3 今晚，否则明早，都成功 |
| story-planning | 独立随机故事工坊：规则包注册表、通用解释器与事务结算 | 世界事实保留，扩展包运行时装卸；详见 story-rule-packs.md |
| story-runtime | 已实现 eventId / append | 事件实例身份、已确认选择事实；唯一事件不重复结算。未实现通用 proposed/prepared 生命周期 |
| npc | 最小 create / observeRiver | 陆砚只记忆亲历合作，能安全独立搬箱；不知道桥上取舍、信件内容和投递方式 |
| party | 未实现，README 边界 | 没有招募和组队。帮助不会创建队伍；UI「独自旅行」是本次固定事实 |
| relations | 已实现 create / acknowledgeHelp | 陆砚信任唯一写入；合作 +1，独行无惩罚 |
| personality | 已实现 record / describe | 保存原始选择证据；不同场景重复才描述本局取舍、低置信度、保留反证；不稳定贴标签、不推断真实用户、不改变历史 |
| encounters | 未实现，README 边界 | 没有随机遭遇或难度适配；陆砚是固定故事事件 |
| economy | 未实现，README 边界 | 桥费是固定事件成本；无通用交易、报价、制造 |
| sessions | 未实现，README 边界 | 无多人、匹配、位面迁移、服务器、数据库 |

## 接口、依赖、版本与验收约定

所有已实现领域仅依赖自身类型和 contracts；没有领域间内部导入。application 显式组合调用，避免隐式事件总线链。content 依赖稳定 ChoiceId/Stage 协议；presentation 从 application 获得只读 View。

命令：`{commandId, runId, actorId, eventInstanceId, revision, choiceId}`。结果为成功 revision/duplicate 或失败原因。事实：`{eventId, runId, sequence, sourceCommandId, schemaVersion:1, stage, choiceId, text}`。领域不向外发布半提交事实。重开丢弃旧局内存并创建全新 ID。

内容版本写入聚合快照；事实 schemaVersion 为 1；尚未承诺可持久化存档格式/迁移兼容性。新增场景或存档应增加内容语义校验和版本迁移。beforeCommit 仅为可选故障注入测试口，收到独立副本，不能修改待提交权威数据。

原雾桥验收见 tests/game.test.ts、tests/e2e/game.spec.ts、tooling/boundaries.mjs 和 test-report.md。新Demo能力与验证见本文件开头及demo-integration-report.md。完整DND与多人世界仍未实现。

空间v2初始化在地图之后检查运行器真实通路，并用NPC迁移事实对齐叙事地点。RunSnapshot.schemaVersion=2，spatial元数据保存布局、目录和空间版本；本局行动不重建地图。声明式目录与地图几何保持分层，新增目录布局不需要扩大故事解释器分支。
