# 魔力百科人物素材导入

来源：[人物目录](https://www.molibaike.com/Role)、[卡兹展示页](https://www.molibaike.com/Role/Detail/c10b727d-3591-42ff-8ca2-aa20229e67ce?u=True)。人物、动作和选项均读取原站实际页面；本目录不是原创人物库。

原站声明图档版权归史克威尔艾尼克斯（中国），资料来自网友或其他魔力资料站。未发现开放素材许可证；本仓库的代码许可证不覆盖这些素材，来源记录不构成使用或再分发授权。

## 本次范围

原站 28 名人物，每人 4 种风格、6 种武器、19 种动作、8 个方向，共 102,144 个候选组合。默认导入只选择“风格一”（color=0）、“空手”（weapon=2），目标为 28 × 19 × 8 = 4,256 个组合。其他配色与武器仅保留完整目录，不能视为已经下载。实际成功、失败和重复资源分别记录在 `import-report.json` 和 `verification.json` 中。

方向编号：0 西北、1 北、2 东北、3 东、4 东南、5 南、6 西南、7 西。

动作编号：0 站立、1 行走、3 冲刺、5 攻击、6 魔法、7 投掷、8 受伤、9 防御、10 倒下、11 静坐、12 挥手、13 胜利、14 生气、15 悲伤、16 点头、17 石子、18 剪子、19 布、20 钓鱼。

## 数据和播放约定

- `source-catalog.json` 保留网站所有选项；编译目录为 `src/data/molibaike-catalog.json`。每个人物有独立的 `manifest.json`、静态 `portrait.webp` 和按动作拆分的无损 WebP 图集。
- `clips` 键为 `动作编号:方向编号`。每帧记录图集区域、原始毫秒时长和基点；每段记录原 GIF 地址、SHA-256、原循环信息，每张图集记录文件大小、尺寸和 SHA-256。
- GIF 已离线合成帧，包括 GIF disposal 规则。没有逐帧重新裁切、调色、缩放或匀速抽帧；透明度与有效像素保持一致。浏览器直接绘制同源图集，不解码 GIF、不读取 Canvas 像素。
- 原站 GIF 均配置无限循环，攻击和倒下等也如此。游戏必须根据自身动作语义决定循环或停在末帧，不能把源循环标记当作战斗结算规则。
- 网站没有提供原游戏坐标锚点。当前 `pivotPolicy=source-canvas-bottom-center` 明确采用完整 GIF 画布底部中心估算，包含源图自带阴影。姿势切换的原始游戏精确锚点尚未恢复。
- `standHeight` 是南向站姿的原始画布高度。一个人物的所有动作共用 `60 / standHeight` 显示比例，不能根据每个动作的画布高度分别缩放。单帧区域保留完整源画布，避免逐帧裁切产生抖动。

## 可复跑导入和验证

在仓库根目录执行（Python 3.10+）：

```sh
python -m pip install Pillow requests

# 所有默认风格/空手人物；最多八并发，总请求启动速率不超过每秒四次。
python tooling/import-molibaike.py --workers 8 --rate 4

# 只下载一个人物；已下载 GIF 使用缓存，失败项保留在报告中。
python tooling/import-molibaike.py --roles 1024

# 明确扩展一个风格/武器；写入独立变体目录，不覆盖游戏默认目录。
python tooling/import-molibaike.py --roles 1024 --color 1 --weapon 3

# 仅使用缓存重建，或逐帧校验现有图集。
python tooling/import-molibaike.py --offline
python tooling/import-molibaike.py --verify
```

默认缓存为 `/tmp/molibaike`，可用 `--cache` 指定其他目录；原 GIF 不加入运行时包。`--catalog` 可读取先前观察到的网站选项目录 JSON 数组；未指定时从网站页面发现。`--actions` 可显式选择动作编号；重新导入部分动作保留已有其他动作。HTTP 429 / 5xx 会有限重试并退避，不能成功获取或不能正确解码的组合会使命令以非零退出，不伪造替代图。

`--verify` 不访问网络，逐帧比较缓存原 GIF 与图集裁切结果的像素、透明度和时长，并校验全部哈希、矩形边界与单文件小于 700,000 字节的限制。透明像素的不可见 RGB 统一为零再比较，透明度本身仍严格相等。
