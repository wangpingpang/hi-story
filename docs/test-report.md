# 《雾桥递信》验收报告

日期：2026-10-13 UTC。运行环境：Node 24.19.0 / npm 11.9.0 / Linux / Chromium 154.0.8037.57。

本报告关联功能提交 `3393f0a34223c747e204c896fd72010c7fa2b155` 及同分支后续验收配置/证据提交。产品代码在最终浏览器验收期间未改变。

## 逻辑与工程检查

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| TypeScript 类型检查 | 通过 | evidence/typecheck.txt |
| Vitest 逻辑、内容、边界 | 42/42 通过 | evidence/logic-results.json、logic-run.txt |
| 22 条合法路径 | 22/22 通过，17 今晚、5 明早 | evidence/routes.csv；逐幕和结局资源均验证 |
| 模块边界 | 通过 | evidence/boundaries.txt |
| Vite 生产构建 | 通过 | evidence/build.txt |

逻辑测试覆盖：每幕铜钱/绳索/耗时/关系/目标阶段，最终草图、信任、公开姓名与任务结果，累计耗时 3/4 边界；非负物资；同 commandId 同载荷幂等、异载荷拒绝；不同 commandId 同一渲染版本仅一次提交；旧 runId/eventInstanceId/revision、错误角色拒绝且状态不变；物资不足和准备完毕后故障的原子回滚；不重复奖励；每幕及结束重开；旧局命令不污染新局；结束后拒绝新选择；深冻结查询与内容不能修改权威数据；NPC 不知道桥上及投递选择；历史事实保持不变；单次/同场景重复证据不贴性格标签；跨场景重复只给低置信描述并保留反证。

5 条明早路径准确为 B/抬箱/匿名、D/独行/匿名、D/绳助/匿名、D/抬箱/公开、D/抬箱/匿名。C 后没有绳助选项的合法路径，UI 显示禁用原因；强行命令也会被拒绝。

## 生产浏览器验收

最终结果：**8/8 通过，0 失败、0 跳过、0 重试，59.3 秒**。真实 Chromium，`npm run build` 后由 `vite preview` 提供 dist；桌面 1440×1000、窄屏 375×812。浏览器测试没有模拟领域对象或调用测试专用游戏接口，使用实际按钮/键盘和 DOM。

覆盖今晚公开合作结局、明早匿名独行结局、资源/草图/关系反馈、Tab/Enter 和换幕后焦点、禁用按钮与原因、每幕重开、结束重开、快速不同按钮点击、重开时旧 timer 回调、各关键阶段无横向溢出；自动收集 pageerror、console.error、requestfailed、HTTP ≥400 并要求为空。截图人工检查桌面和窄屏完整页面。完整日志与 JSON 位于 evidence/browser-run.txt、browser-results.json。

## 修复与复测记录

1. 首次类型检查发现 Node 类型/CSS 导入声明缺失，以及 crypto.randomUUID 默认参数的模板字符串推断过窄。补充 @types/node、vite/client 声明、显式 string 参数；复测通过。
2. 首轮浏览器 2 通过/6 失败：资源 UI 正确显示 `1 枚`/`3 枚`，断言错误期待纯数字。保留 browser-first-run.json；修正预期为含单位，并将键盘测试加强为实际 Tab 导航。
3. 第二轮在共享云端双 worker 运行期间出现 30 秒测试超时，截图停在已正确推进的渡口；中止该轮，未视为通过。保留 browser-second-run.json/.txt。测试调整为单 worker、每用例 90 秒预算，保持零重试，不放宽功能断言，完整复跑。

## 交付与限制

- 框架与 17 领域清单详见 architecture.md；8 个必要领域有实现，9 个明确未实现。
- `artifacts/hi-story-preview.zip` 为可运行生产包，解压后 `python3 -m http.server 8080`，访问 `http://localhost:8080`。包内文件逐字节等于本次测试 dist，SHA-256 见 evidence/artifact-sha256.txt。
- 没有公开部署；GitHub 功能分支为 `codex/fog-bridge-demo`，未合并 main。
- `gh auth status` 报 GH_TOKEN 无效，但实际 `git push` 成功，`git ls-remote` 已确认远端功能提交；没有新建密钥或修改权限。
- 仅验证此 Chromium 版本的桌面/窄屏模拟环境；未声称跨 Firefox、Safari、真实移动设备或完整 WCAG 审计通过。
- 内存存档，刷新新开局；无服务器、数据库、随机地图、战棋、DND、多人或持久人格推断。
