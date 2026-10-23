# 2026-10-24 玩法闭环修复线上发布

用户明确要求“更新一下线上”。发布分支 `codex/publish-gameplay-closure` 从已推送的 `codex/gameplay-loop-audit@e13f78d` 继续，玩法实现提交为 `1e16f6d`。本轮只发布既有修复并补充公网验收入口，不修改玩法或存档格式。

## 发布范围与产物

沿用产品0.6.0 / schema5 / save1，涵盖任务失败补救、不可逆选择的终态、主线结束收尾、期限一致性、材料提示、人物列表靠近、真实普通法术显示及敌人遮挡绕路。具体规则与未实现范围见 [自检报告](gameplay-loop-audit.md)。用户无需清除旧存档；职业升级、伙伴回合及范围/持续法术仍未实现。

[本轮清单](evidence/gameplay-closure-release-manifest.json)包含721个文件、71,207,352字节，含`.nojekyll`。buildId为 `262f59015e15395d1d2a18dddf432cc12554812c789e125e8f8e2bacba030867`，由按路径排序的文件路径/字节数/SHA-256数组生成。与上一发布相比714个文件内容一致；6个哈希文件名更新，入口HTML更新。人物、怪物和特效素材未改动。

## 发布前验证

- 类型检查、模块边界和生产构建通过；721个dist文件与本轮清单逐一核对通过。
- 本轮重跑关键逻辑18/18通过；全量426项逻辑与40项浏览器的既有自检证据沿用，不宣称本轮重新全跑。
- 本轮桌面/375px本地流程12/12通过，耗时约1.9分钟；报告保存为 `evidence/gameplay-closure-release-local-browser.json`。
- Playwright新增显式 `PLAYWRIGHT_BASE_URL` 外部验收入口；远程验收不启动本地服务器。导航改为相对项目路径，确保公网`/hi-story/`前缀正确。同一套闭环测试用于本地生产构建和线上页面，不放宽结果断言。

## 发布方式

独立Git索引从已验收dist创建静态树，逐个读取树内blob核对SHA-256后，以现有`gh-pages@8e71489`为父提交正常推送，保留发布历史，不覆盖源码工作区。发布树只含清单内的静态文件，不包括源码、测试报告或`_handoff`内部资料。

部署源码为 `cb149b6bc8e67a5151dc13b6746fdfb3ceb59ae6`，静态部署 [gh-pages@8d25e3a](https://github.com/wangpingpang/hi-story/commit/8d25e3a76f39add1fa86b6548133b4a30233f949)，父提交为8e71489。[Pages #40001811707](https://github.com/wangpingpang/hi-story/actions/runs/40001811707)已完成且success；同SHA另一次Pages任务40001808778为cancelled，未把它报告成成功。身份与buildId见 [部署证据](evidence/gameplay-closure-pages-deployment.json)。

## 实际公网验收

- 桌面1440×1000及375×812的闭环流程12/12通过，约141秒，无重试/跳过，见 [公网浏览器报告](evidence/gameplay-closure-release-public-browser.json)。覆盖人物列表实际靠近、缺材料提示→补货→回到地点完成、不可逆委托终态/错序接取、法术真实属性、失败补救/一次耗材和奖励、39.9小时时限提示，均包含刷新核对。
- 地点进度先由同版应用的真实命令生成，再通过公网导入入口恢复；期限边界在已完成路线的有效快照中设置剩余时间，并完整校验。上述受控边界用例与网页实际操作区分记录，不冒充全部历史整局都从开局走完。
- 既有公网战斗核验在两种尺寸均通过，每种10组：真实v0.5.0存档升级、魔物导入、红色敌栏、1.5倍默认与手动缩放、原素材阴影、实际跑步、火焰弹一次扣资源、小骰子等待20秒后手动关闭、刷新不重播。见 [战斗证据](evidence/gameplay-closure-public/combat-public-validation.json)。页面与HTTP错误均为0。
- 已目视核对实际公网375px小骰子和桌面补救任务截图。
- 721/721个公网文件SHA-256与本轮已验收构建一致，buildId一致；人物馆两种尺寸各7组检查通过，涵盖28人/19动作/8方向、北向攻击、外形选择、实际连续移动、人物居中、刷新恢复和无溢出。页面/HTTP/请求失败均为0，见 [资源与人物馆结果](evidence/gameplay-closure-public/external-character-public-validation.json)。
- 资源下载核验发生7次Node HTTP瞬时失败/超时，按既有重试策略改用Windows HTTP成功，最终无文件缺失或哈希差异；共23个文件使用Windows HTTP，逐项记录保留在结果中。这不计为页面流程失败，也未放宽校验。

[桌面补救任务](evidence/gameplay-closure-public/closure-recovered-desktop.png) · [375px材料提示](evidence/gameplay-closure-public/closure-material-narrow.png) · [375px期限提示](evidence/gameplay-closure-public/closure-deadline-narrow.png) · [实际法术属性](evidence/gameplay-closure-public/closure-basic-attack-desktop.png) · [375px手动骰子](evidence/gameplay-closure-public/dice-375.png)

线上入口：[暮光山谷](https://wangpingpang.github.io/hi-story/)。刷新页面即可载入，原存档继续使用。

```powershell
$env:CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PLAYWRIGHT_BASE_URL='https://wangpingpang.github.io/hi-story/'
$env:PLAYWRIGHT_REPORT_PATH='docs/evidence/gameplay-closure-release-public-browser.json'
npm run test:e2e:closure
$env:HI_STORY_RELEASE_MANIFEST='docs/evidence/gameplay-closure-release-manifest.json'
$env:HI_STORY_EVIDENCE_DIR='docs/evidence/gameplay-closure-public'
node tooling/verify-external-character-publication.mjs
node tooling/verify-v060-combat-publication.mjs
```
