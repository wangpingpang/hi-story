# HD-2D 素材与表现契约 v1

实机裁切修正：源矩形收紧至主体透明轮廓范围，嵌套SVG明确preserveAspectRatio=none，避免默认留白区域露出相邻图集行；脚底按主体底边校准。完整冒险浏览器回归同时覆盖减少动态效果模式，新增HD-2D用例保留完整动画。

建筑另有明确的透明命中矩形，不依赖图片非透明像素或灯光包围盒命中。命中矩形不扩大碰撞占地；点击仍由生命周期走真实路径并验证移动。

新增图集 `public/assets/scenery/hd2d-scenery-v1.webp`，原始尺寸1774×887，透明通道保留。8个实际源矩形登记于 `src/presentation/scenery.ts`；生成模型并未严格遵守等分格，运行时按实际边界裁取，不能直接假设4×2等分坐标。WebP仅为格式传输优化，没有重新绘制或替换素材内容。

生成方式：内置imagegen，透明背景。提示词：为简化HD-2D中世纪奇幻冒险制作原创等距八物件图集，4列2行，橡树、石木民居、废弃哨塔、月之祭坛、商人帐篷、苔藓岩石、带灯货车、针叶树；统一2:1等距视角，细腻像素材质、左上暖光、冷橄榄阴影、自然低饱和色；独立完整轮廓、空白间隔，无人物、文字、界面或水印。以实际生成结果校准切片。

公开装备源 `profession-equipment/1`：102件定义在 `content/equipment/catalog.json`，5图集在 `public/assets/equipment/*.webp`。按源目录归一化矩形读取，保留原有102件ID与设计。界面仅为本职业静态图鉴，不扣发物品或派生数值，不声明正面概念图已是8方向动画。

天气使用代码原生粒子/渐变，地表使用代码原生可重复纹理；角色继续使用人物生成器的真实PNG装配，不用新通用人物替换身份。现有地图碰撞、迷雾、任务锚点不因美术改变。

素材不足时先登记缺口、补图集和源矩形，再接入可见场景并做浏览器检查，不能只把未使用的图片放进素材目录。本轮未公开装备包的internal-only目录及其制作规格。

## 生成提示词原文（内置 imagegen，transparent_background=true）

```text
Use case: stylized-concept. Asset type: production isometric game scenery atlas for a simplified HD-2D medieval fantasy adventure. Generate one transparent PNG atlas, exactly 4 columns by 2 rows, eight equally sized square cells, each isolated object centered with 12% empty transparent margin; objects never cross cell boundaries. Camera consistent three-quarter isometric 2:1, visible top and two sides. Painterly pixel-art with crisp pixel texture, richly textured but readable small, warm amber highlights from upper left, cool dark olive shadows, muted natural palette. Row 1 left to right: 1 dense tall leafy oak tree with gnarled trunk; 2 rustic timber-and-stone cottage, mossy slate roof, warm lit windows; 3 ruined tall stone watchtower, ivy, broken battlements; 4 ancient moon shrine, stone pedestal and small glowing cyan crystal. Row 2 left to right: 5 merchant canvas tent with crates and lantern; 6 rugged mossy boulder cluster; 7 wooden covered wagon with barrels and warm lamp; 8 tall dark fir tree. All fully visible, grounds minimal small contact shadows only; genuinely transparent outside silhouettes. No characters, no lettering, no labels, no borders, no grid lines, no UI. Output is ONLY a reusable eight-object sprite atlas, not a scene or mockup. Each object's base is centered near 85% of its cell height. No imitation of specific copyrighted game locations.
```
