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

计划使用独立Git索引把已验收dist生成静态树，逐个blob比对清单SHA-256，以当前`gh-pages`为父提交正常推送。源码、测试、报告及`_handoff`不会放入发布树；不修改main或Pages来源。

当前记录为发布准备阶段，尚未宣称部署完成。完成后在本页补充源码/部署SHA、Pages任务状态、733文件公网哈希、桌面/375px启动、特效、闭环与旧档验收结果，并保留首次失败和重试。

