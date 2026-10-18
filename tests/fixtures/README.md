# 存档回归样本

`v050-save.json.gz` 来自 2026-10-18 对已发布 v0.5.0 的独立无用户数据浏览器访问：

`https://wangpingpang.github.io/hi-story/?view=demo&seed=v060-legacy-fixture`

读取该新旅程实际写入的 `hi-story:adventure:world-v2` 封套后无损 gzip 保存。原 JSON 的 UTF-8 大小为 525,566 字节，SHA-256 为 `e1ee386fc21824ccc3dc1c8e1adb0c42ca8f63f08aedd666e3682da344e0edb4`；`schemaVersion=4`、快照 `version=0.2.1`、`demo-contract/4`，没有装备字段；不是用新版类型手工制造的“旧档”。

逻辑与桌面/375px 导入检查均使用此文件，核对旧 runtime/story/things 字段及随机状态保留、新增空装备账本。样本是初始旅程，进阶装备与战斗恢复另由真实操作和确定性战斗用例覆盖。
