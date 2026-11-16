# 2026-11-17 开局素材预加载与 PixelFX 线上发布

用户明确要求“更新线上”。发布分支 `codex/publish-asset-preload` 从已推送的 `433cbb6` 继续，包含开局素材准备及其父提交 `0314f5e` 的PixelFX接入。本轮不修改玩法、产品0.6.0、schema5或save1，旧存档继续使用。

## 发布范围

进入冒险、新旅程和恢复时，先显示准备页，准备五张场景图集、玩家常用动作、当前可见人物或战斗参战者，以及六类PixelFX特效；完成后自动进入。进度为实际完成项，失败可重试或明确先进入按需补载。当前页面成功缓存可复用，刷新遵循浏览器HTTP缓存，没有持久离线可玩保证。详细范围见 [预加载验收](asset-preload-validation.md) 与 [PixelFX验收](pixelfx-integration-validation.md)。

本轮[发布清单](evidence/preload-release-manifest.json)包含733个文件、74,355,780字节，含`.nojekyll`，buildId为 `aec18f038facac22e7988f901e4575f3ed5b4d9dbdcb59741e97bf3d098cd087`（按路径排序的path/bytes/sha256数组的JSON SHA-256）。与上一线上清单相比715个文件内容一致，新增12个PixelFX图集/说明/清单文件、更新5个哈希命名的JS/CSS及入口HTML；人物、怪物和场景图集保持原样。

## 发布前验证

- 类型、模块边界和生产构建通过。
- 本轮关键逻辑18项通过，[报告](evidence/preload-release-logic.json)。既有全量459项与74项不同浏览器用例沿用上一轮记录，不宣称此次重新全量运行。
- 本轮桌面/375px启动与玩法闭环24项通过，约3分钟，0失败/跳过/重试；[本地浏览器报告](evidence/preload-release-local-browser.json)。包含冷启动等待→操作、失败/跳过/超时/重试、战斗存档恢复与实际施法，以及任务顺序、材料、补救和截止时间回归。

## 发布与公网状态

使用独立Git索引把已验收dist生成静态树，733个blob逐一比对清单SHA-256通过，以`gh-pages@8d25e3a`为父提交正常推送，保留发布历史。源码、测试、报告及`_handoff`均不在发布树内；main和Pages来源保持。

发布源码为 `3c89124ccfaa79ad86f3ea20aa9818d1dd0deb7e`；部署为 [gh-pages@c2a831e](https://github.com/wangpingpang/hi-story/commit/c2a831ea8f04d3fcc993d677e8bffce24b7dc69b)。[Pages #43933730756](https://github.com/wangpingpang/hi-story/actions/runs/43933730756) completed/success，head SHA与本次部署一致，没有其他匹配任务；[部署证据](evidence/preload-pages-deployment.json)。

733/733个公网文件SHA-256与发布清单一致，无下载失败或重试；16个大文件按既有策略通过Windows HTTP读取，其余使用Node。人物馆桌面1440×1000与375×812各7组检查通过，覆盖28人/19动作/8方向、北向攻击、外形选择、实际连续移动、人物居中、刷新恢复及无溢出，页面/HTTP/请求错误均为0；[资源与人物馆结果](evidence/preload-release-public/external-character-public-validation.json)。

## 公网流程验证

- 桌面/375px启动与任务闭环24项通过，约4.8分钟，0失败/跳过/重试；[公网浏览器报告](evidence/preload-release-public-browser.json)。使用与本地相同的生产入口和断言，显式公网baseURL，不启动本地预览服务器。
- 六类特效和魔物的34项公网回归通过（桌面17、375px17），约8.1分钟，首次完整批次0失败/跳过/重试；[特效公网报告](evidence/preload-release-effects-public-browser.json)。覆盖火冰雷风奥术治疗、魔物唤醒/06施法、未命中与豁免、减少动态、损坏/超时/取消以及一次结算和刷新不重播。与前述24项共58项不同公网浏览器用例，分两批通过。
- 独立战斗核验在两种尺寸各10组检查最终通过：真实v0.5.0存档升级、魔物导入、双侧状态、原素材阴影、1.5倍默认与手动缩放、实际跑步、PixelFX火法术一次扣资源、骰子等待20秒后手动关闭、刷新不重播；页面与HTTP错误均为0。[最终战斗证据](evidence/preload-release-public/combat-public-validation.json)。
- 已查看公网桌面和375px准备页、375px手动骰子及桌面火环/375px治疗截图。准备页截图使用受控资源延迟以稳定展示进度，不能解释为该画面所示时间就是自然网络的加载速度。

## 首次失败与核验脚本适配

旧战斗核验器首次在桌面等待骰子时失败：[JSON](evidence/preload-release-public/combat-initial-failure-1440.json) / [截图](evidence/preload-release-public/combat-initial-failure-1440.png)。当时页面/HTTP错误为0，火法术已提交并显示未命中；截图仍处于特效结束前。核验器暂停浏览器时钟后每次轮询只推进100ms，默认真实时间退避间隔导致5秒内模拟时间可能不足以走完新增的1200ms特效。

仅将测试轮询间隔固定为100ms，保持5秒真实等待预算、原动画时长和全部规则断言；同时补充`data-effect-source=pixelfx`及真实图集路径断言。重跑两尺寸均在截图后的900ms模拟时间内进入骰子，并通过手动关闭和刷新不重复结算。没有为测试缩短产品动画、改变玩法或重新部署产品；测试脚本与首次失败记录随发布报告提交。

本地、启动/闭环公网、特效公网、独立资源/战斗核验为不同批次，不描述为一次全量全绿。受控战斗快照由同版应用校验后通过真实导入入口使用，任务边界和故障路由也属于受控测试；不声称所有边界均靠自然随机游玩触发。历史全量逻辑、已发布的早期整局记录与本轮回归范围分别保留。

## 复验入口

```powershell
$env:CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:PLAYWRIGHT_BASE_URL='https://wangpingpang.github.io/hi-story/'
$env:PLAYWRIGHT_REPORT_PATH='docs/evidence/preload-release-public-browser.json'
npm run test:e2e:closure -- tests/e2e/asset-preload.spec.ts --output=test-results/preload-release-public
$env:PLAYWRIGHT_REPORT_PATH='docs/evidence/preload-release-effects-public-browser.json'
npm run test:e2e -- tests/e2e/monster-effects.spec.ts tests/e2e/pixelfx-effects.spec.ts --output=test-results/preload-release-effects-public
$env:HI_STORY_RELEASE_MANIFEST='docs/evidence/preload-release-manifest.json'
$env:HI_STORY_EVIDENCE_DIR='docs/evidence/preload-release-public'
node tooling/verify-external-character-publication.mjs
node tooling/verify-v060-combat-publication.mjs
```

线上入口：[暮光山谷](https://wangpingpang.github.io/hi-story/?view=demo)。刷新即可加载当前版本，不需要清除存档。

[桌面准备页](evidence/preload-release-public/preload-progress-desktop.png) · [375px准备页](evidence/preload-release-public/preload-progress-narrow.png) · [进入后的场景](evidence/preload-release-public/preload-ready-desktop.png) · [375px手动骰子](evidence/preload-release-public/dice-375.png) · [桌面PixelFX火环](evidence/preload-release-public/pixelfx-fire-desktop.png) · [375pxPixelFX治疗](evidence/preload-release-public/pixelfx-healing-narrow.png)
