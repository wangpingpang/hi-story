# 《雾桥递信》架构与范围

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

## 17 个领域实现清单

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

具体验收见 tests/game.test.ts、tests/e2e/game.spec.ts、tooling/boundaries.mjs 和 test-report.md。本项目不声称实现完整 DND、随机地图或愿景中的多人世界。

## 2026-10-14 随机故事任务、物品与事件接入

随机故事工坊已有通用事件实例、物品数量/线索状态、任务领域校验与应用层原子结算。物品的唯一来源为 `World.inventory`，旧规则字段是兼容投影。事件定义可声明一次性或重复行动，同事件的多个选择共用实例，重复请求不再次生效。任务与阶段类型由 objectives 提供，故事规划提出阶段方案后由任务领域保护历史。

详情见根目录《事物模块说明.md》，测试记录见 `docs/things-events-validation.md`。固定雾桥流程保留原行为；当前分支没有独立地图生成器，没有新增空间移动或真实战斗模块。
