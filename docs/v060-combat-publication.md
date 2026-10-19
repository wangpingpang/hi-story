# v0.6.0 战斗增量线上发布

日期：2026-10-19。发布源码分支 `codex/publish-v060-combat`，基于已推送的ebe0502，包含此前装备、技能、怪物/特效、战斗跑步、双侧状态/手动骰子、阴影修正和1.5倍缩放。发布前线上为v0.5.0、gh-pages@ce39953。下方为本轮执行记录，部署及公网结果完成后补记。

## 构建与范围

产品/快照0.6.0，schema5/demo-contract/5；save1与world-v2保存槽保持。校验通过的v0.5.0/schema4存档补空装备升级，保留原人物、故事、运行器和随机状态。普通四模板不自动转换成职业旅程；通过“旅程→职业规则→生成新旅程”开启职业，战斗下方“魔法/技能”选择能力、目标并确认。

累计范围及限制沿用各增量报告。当前只有玩家一名友方，没有新增伙伴回合、范围/持续状态或全怪物图鉴。人物和怪物的原帧阴影保留，场景默认1.5倍且可手动调整；树木等景物投影保持。

[本轮发布清单](evidence/v060-combat-release-manifest.json)记录721文件、71,201,436字节，包含.nojekyll，buildId为 `ffc645a5cb37c25d94cc04d9fdc73567efffe5d2ae3a907fcf378bac9052c1cc`。全部路径、字节数及SHA-256已与dist核对，未使用v0.5.0或装备阶段的旧清单代替。

## 发布前实际检查

- typecheck、check:boundaries、build通过，133模块。
- 运行器/领域未在本轮修改；沿用7a67f8a的408/408逻辑证据，不宣称本轮重跑。见[逻辑报告](evidence/battle-side-dice-logic.json)。
- 最终场景的40/40项浏览器检查通过，约474.8秒，覆盖桌面1440×1000、375×812的跑步、两栏/小骰子、职业能力和装备/旧档完整流程；见 [实际报告](evidence/v060-combat-release-browser.json)。
- 人物阴影修正22项和默认缩放6项的既有证据分别见[阴影验证](character-shadow-validation.md)、[缩放验证](default-scene-zoom-validation.md)。不把不同批次相加宣称一次全量通过。
- 新公网战斗核验器先对本地相同生产构建跑通两种尺寸：真实v0.5.0样本恢复、校验封套经导入界面进入魔物战斗、红色敌栏、1.5倍/手动缩放、跑步、火焰弹/一次扣资源、小骰子等待20秒后手动关闭、刷新不重播。受控战斗快照不冒充真实探索生成的整局。

## 发布方式与公网验收

静态文件使用独立Git索引从dist建立发布树，逐个读取树内blob复验清单后，以既有gh-pages提交为父提交正常推送，保留发布历史；不强制推送，不切换/重置源码工作区，不把_handoff内部资料放入发布树。

既有人物馆核验器新增 `HI_STORY_RELEASE_MANIFEST` 参数，本轮使用新清单核对全部公网资源；默认行为继续读取旧人物发布清单，历史核验不变。新增 `tooling/verify-v060-combat-publication.mjs` 对公网页面检查本轮行为。

```powershell
$env:CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:HI_STORY_RELEASE_MANIFEST='docs/evidence/v060-combat-release-manifest.json'
$env:HI_STORY_EVIDENCE_DIR='docs/evidence/v060-combat-public'
node tooling/verify-external-character-publication.mjs
node tooling/verify-v060-combat-publication.mjs
```

新核验器开发时两次本地失败均已定位为核验脚本问题：带显式seed的URL在导入不同seed存档后刷新会按URL新建旅程；战斗人物绘制在SVG而不是背景Canvas。分别改用无seed默认入口和等待战斗SVG真实帧；未修改产品或放宽恢复断言，最终本地两种尺寸通过。原始诊断保留在Git忽略的_handoff/audit/v060-combat-public-local*。
