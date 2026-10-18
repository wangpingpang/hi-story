# GitHub Pages 发布

## 2026-10-18 v0.5.0 人物素材馆

新版入口：<https://wangpingpang.github.io/hi-story/?view=character-library>。已将交接包中通过验收的 695 个构建文件和 `.nojekyll` 发布到 `gh-pages@ce39953dd5b221c0550c5be73347b9b60bcbd1f1`，保留上一版发布历史。包含 28 人、19 类动作、8 方向、默认风格一/空手；主冒险采用新人物，旧人物/动作工坊入口转入素材馆。

[Pages 构建与部署 #39115009820](https://github.com/wangpingpang/hi-story/actions/runs/39115009820) completed/success。695 个公网文件逐一与验收清单比对 SHA-256 一致；1440×1000 和 375×812 实际选人、北向攻击、返回冒险、连续移动、人物居中和刷新恢复通过，无页面错误、HTTP 失败或请求失败。详细验证见 `external-character-validation.md` 最新发布记录，本机证据在 `_handoff/audit/public-20261018/`。

本轮只发布公开 `dist` 产物；源码维护分支 `codex/publish-character-library` 仍在本地，原始交接源码/归档分支未补推。下文为较早版本的历史发布记录。

公开地址：https://wangpingpang.github.io/hi-story/

2026-10-13 用户授权公开发布后，将已验收的 dist 原样提交到独立 `gh-pages` 分支；发布提交 `31082c3a1278b66b4716d4a620873fd8775cb291`，产品源码提交 `2bd0f51b43bfacbdb2e4e9b757efd82c127857ea`。没有合并 main、创建持久密钥、修改账户权限或使用付费服务。

GitHub 自动建立的 [Pages 构建与部署 #38414021071](https://github.com/wangpingpang/hi-story/actions/runs/38414021071) 的 build、report-build-status、deploy 均成功。官方 deploy 日志在 `2026-10-13T14:31:32Z` 报告成功，并返回上述环境 URL。

## 发布范围

仅 `gh-pages` 分支根目录的静态文件用于发布。它只含 index.html、哈希命名的 JS/CSS 和 .nojekyll；源码、测试、报告不在站点产物中。原有 `base: './'` 未改变，HTML 资源引用从 `/hi-story/` 相对解析到 `/hi-story/assets/`。

更新源码分支不会直接更新公开站点。后续版本需先验收、构建，再把完整 dist 同步到 `gh-pages`，删除过时静态资产并提交/推送。GitHub 仅对这个发布分支运行 Pages 构建。不要将任意开发分支改成 Pages 来源，也不要为了发布合并 main。

## 公网验证

云端终端与浏览器最初对 github.io 的请求被网络代理拒绝（HTTP CONNECT 403 / ERR_TUNNEL_CONNECTION_FAILED）。这不是公开站点 HTTP 状态，不能记为站点通过或失败。

为完成真实公网验收，源码分支增加 `Verify public demo` Actions：仅在 `codex/fog-bridge-demo` 的验收 workflow / smoke 脚本改变时触发；任务只授予 contents:read、checkout 不保留凭据，官方 actions 固定到核实后的提交 SHA。没有网站发布权限，也不发布其他分支。

脚本 tooling/verify-published.mjs 用真实 Chromium 打开公开 URL，验证 HTML 200、中文标题、JS/CSS 从 /hi-story/assets/ 加载且 200、375px 无横向溢出、D/独行/匿名完整玩法及耗时4次晨结局，检查无 console.error/pageerror/失败网络请求。JSON 与截图保存为 public-pages-evidence 构建产物（保留30天）。

最终公网验收：**通过**。任务 [#38414260701](https://github.com/wangpingpang/hi-story/actions/runs/38414260701) completed/success，`2026-10-13T14:33:11Z` 日志报告 PASS。页面 HTML、`/hi-story/assets/index-nZ_enpvH.js`、`/hi-story/assets/index-BYpHuItf.css` 均返回 200。使用 Chrome for Testing 156.0.8078.4 完成真实公网路径 D/solo/anonymous，耗时 4、明早处理；无控制台错误、失败请求或横向溢出。

[公网试玩 JSON 与截图下载](https://github.com/wangpingpang/hi-story/actions/runs/38414260701/artifacts/11823029476)（GitHub 登录后访问，构建产物保留30天）。持久摘要见 evidence/pages-public-verification.json。公网验证脚本提交 `9f9e0c10d29822df9b28eaa0d74eea0f99117ee0`。


## 2026-10-14 生成与探索Demo上线

试玩入口：https://wangpingpang.github.io/hi-story/?view=demo 。人物工坊和故事工坊分别使用同站点的?view=character-generator和?view=story-generator，默认入口保留雾桥小样。

构建基于463c908集成代码，并修复Demo页头的相对导航，防止离开/hi-story/项目路径。首个发布提交d9001cb1940f78ed43496eaa8fb336028a6c3bed；修复后最终发布提交cac3007996b947effd3420c4764f4046622c62f6。继续使用原有gh-pages来源，完整替换静态文件并清除过时哈希资产，人物PNG与manifest一并发布；未合并main或改变站点权限。

[Pages构建与部署 #38565291574](https://github.com/wangpingpang/hi-story/actions/runs/38565291574) completed/success。本轮生产构建通过；公网index.html、JS、CSS、两张人物PNG和manifest均HTTP 200，逐字节与本地dist相同。[产物验证记录](evidence/demo-pages-publication.json)。

云端浏览器已打开探索入口，显示中文标题、世界地图、人物资料和任务列表。此次只验证初始渲染与公网产物，完整探索、胜负、键盘和窄屏交互测试仍未执行，不能据此替代完整Demo验收。原2026-10-13的完整公网验收仅适用于旧雾桥小样。


## 2026-10-14 空间v2与完整Demo验收

原地址https://wangpingpang.github.io/hi-story/?view=demo已更新。产品代码验收提交176de8745a734e8fc6be37a280f9e8b9396cd5da，151项逻辑、30项桌面/375px浏览器用例通过；详见[下一阶段报告](demo-next-stage-report.md)。

发布提交462e44752afb6332685eff7e410317527381617b；[Pages #38575627985](https://github.com/wangpingpang/hi-story/actions/runs/38575627985) completed/success。仍使用gh-pages静态来源，未更改访问权限或合并main。6个公网文件均HTTP 200且与生产构建字节相同，[公开产物比对](evidence/demo-next-stage-publication.json)。

完整浏览器验收在GitHub Actions的生产预览中执行；公网验证覆盖部署与静态资源，不表示对公网重新执行了全部30个浏览器用例。原雾桥与人物/故事工坊保持入口。
