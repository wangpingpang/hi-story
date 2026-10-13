# story-planning

本地规则包驱动的随机故事原型，公开接口由 index.ts 导出。业务规则位于 content/story，运行时使用 RuleRegistry 注册、替换和卸载扩展包。

世界类型、初始化、解释器、注册表、字段接口和事务引擎分离。基础包保留主支线闭环，扩展包通过 JSON 增加行动和反应。地图、战斗经过外部结果入口接入。

能力、字段契约及限制见 docs/story-rule-packs.md；故事原型范围见 docs/story-generator.md。

阶段图规划、候选路线计算与字段依赖调度见 docs/story-stage-planning.md。
