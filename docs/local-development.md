# Windows 本地开发与交接

本地目标目录为 `F:\codexWorkSpace\hi-story`。这是可独立运行的 Vite / TypeScript 工程，当前产品版本 0.5.0；游戏运行不需要 AI API。运行本地服务后仍通过浏览器使用游戏界面，源码、素材与开发工具在本地维护。

## 首次准备

安装 Node.js 24（附带 npm）和 Git。准确的 Node 版本范围以 `package.json` 的 `engines.node` 为准，目前是 `^22.12.0 || ^24.0.0 || >=26.0.0`。安装后重新打开终端。

在 PowerShell 中执行：

```powershell
Set-Location 'F:\codexWorkSpace\hi-story'
powershell -NoProfile -ExecutionPolicy Bypass -File .\tooling\setup-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tooling\start-local.ps1
```

`-ExecutionPolicy Bypass` 仅作用于该次 PowerShell 进程，无须修改全局执行策略。脚本使用 UTF-8 BOM，兼容 Windows PowerShell 5.1 的中文读取。也可直接使用 Node / npm 命令：

```powershell
node .\tooling\check-local.mjs
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

准备脚本先校验 Node 版本，然后依次执行 `npm ci`、类型检查、模块边界检查、逻辑测试、生产构建；任一步失败即停止。第一次安装依赖需要网络。不要从 Linux 复制 `node_modules`，应在 Windows 执行 `npm ci`。脚本不会推送 GitHub 或部署网站。

开发入口为 <http://127.0.0.1:5173/>；保持终端运行，修改 `src/` 后 Vite 自动更新，按 `Ctrl+C` 停止。端口被占用时脚本会报错，先关闭占用进程或手动选择其他端口并相应修改访问地址。

## 页面入口

以下入口根据 `src/main.ts` 与冒险设置面板核对。

| 内容 | 本地地址与用途 |
| --- | --- |
| 当前冒险 / 地图 | <http://127.0.0.1:5173/?view=demo>，默认首页也是此入口；地图生成、移动、探索、天气、任务和战斗在这里联动 |
| 人物素材馆 | <http://127.0.0.1:5173/?view=character-library>，浏览人物、动作、八方向，选择旅人外形 |
| 故事工坊 | <http://127.0.0.1:5173/?view=story-generator>，独立故事生成与选择预览 |
| 职业装备衣橱 | <http://127.0.0.1:5173/?view=equipment-book>，职业推荐装备和正面静态虚拟试穿 |
| 职业规则 | 进入主冒险 → 底部“旅程” → “职业规则（新旅程启用）” → 选择职业并“生成新旅程” |
| 旧探索 Demo | <http://127.0.0.1:5173/?view=demo-legacy>，历史回归 |
| 原雾桥小样 | <http://127.0.0.1:5173/?view=fog-bridge>，历史小样 |

当前没有独立 `?view=map-generator` 页面；地图开发入口是主冒险和 `src/modules/world/index.ts`。旧 `?view=character-generator` 与 `?view=character-motion` 已转到人物素材馆。查询参数不是任意新增路由，开发新页面时需同步 `src/main.ts`。

## 检查与浏览器测试

```powershell
# 依赖未改变时复用当前 node_modules，执行全部逻辑检查与构建
node .\tooling\check-local.mjs --skip-install

# 首次安装测试浏览器，并执行完整逻辑检查、构建与 E2E
powershell -NoProfile -ExecutionPolicy Bypass -File .\tooling\setup-local.ps1 -InstallBrowser -E2E

# 已安装测试浏览器时
node .\tooling\check-local.mjs --skip-install --e2e

# 单独构建后预览
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

跨平台检查脚本也可在 macOS / Linux 使用 `node tooling/check-local.mjs`。E2E 使用 4173 端口，会自己启动构建预览；测试前先停止同端口预览服务。默认测试桌面和 375px 窄屏，结果报告写入 `docs/evidence/browser-results.json`，失败 trace 由 Playwright 保存。

Playwright 优先使用 `CHROMIUM_PATH` 指定的浏览器；Linux 检测已有 `/usr/bin/chromium` 或 `/usr/bin/chromium-browser`，其他情况使用 `playwright install chromium` 安装的浏览器。Windows 不再硬编码 Linux 路径。需要指定已有浏览器时可执行：

```powershell
$env:CHROMIUM_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run build
npm.cmd run test:e2e
Remove-Item Env:CHROMIUM_PATH
```

此交接环境是 Linux：可以检查脚本逻辑、工程类型、边界、测试与构建，但没有实际运行 Windows PowerShell 和 Windows 浏览器。Windows 首次执行结果需以本机输出为准。

## 素材范围与未完成接入

运行所需静态资源放在 `public/assets/`，数据目录包括 `content/` 和 `src/data/`；Vite 构建会复制公开资源。人物素材是已离线导入的默认风格一、空手：28 人、19 类动作、8 方向、4,256 组、21,368 帧。游戏和人物馆同源加载 WebP 图集，不要求魔力百科在线。具体文件与数量以 `public/assets/characters/molibaike/import-report.json`、`verification.json` 及各人物 manifest 为准。

原站另外可选的风格、配色、武器不表示都已下载；默认包没有全部武器的独立动画，也没有可分层替换的外部人物装备。重击、交谈、部分休息姿势和法术类型存在动作复用，详见《外部人物素材接入说明.md》。人物版权和来源信息随素材保留。

职业装备模块的 102 件设计、36 套配置和静态图集已在公开工程中；衣橱是正面静态虚拟试穿，尚未接入真实游戏的装备获取、背包穿脱、装备战斗数值或存档，也未适配新人物的八向换装。内部职业动作、具体变身形态与制作规范属于独立材料，不应上传到公开仓库；其实际保留情况见本次交接清单。

素材再下载工具 `tooling/import-molibaike.py` 是可选维护工具，需要 Python、Pillow、requests 和源站网络；现有游戏启动不需要安装这些 Python 依赖。没有一起交付的原 GIF 下载缓存不影响已生成 WebP 的运行。

游戏存档位于浏览器的 `localStorage`，不在 Git 仓库里。GitHub Pages 与 localhost 的存档隔离；迁移进度需要先在原页面“旅程”面板导出存档 JSON，再在本地页面导入。`localhost`、`127.0.0.1` 和不同端口也各自独立，建议一直使用上面的固定地址。

## 接续开发

先读根目录 `AGENTS.md`、《模块边界与开发同步说明.md》与所属模块说明；当前功能、公开 API 和未接入事项以代码和最近验收记录交叉确认。日常修改后运行 `node tooling/check-local.mjs --skip-install`，涉及表现或交互时增加对应 E2E；自测通过后才提交与推送。决定性接口或职责变化需同步模块说明和 `docs/decisions.md`。
