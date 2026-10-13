import { describe, it, expect } from "vitest";
import camp from "../content/story/camp-rules.json";
import { StoryStudio } from "../src/application/story-studio";
import {
  createStoryRegistry,
  initializeStory,
  storyOptions,
  processPlayerAction,
  parseRulePack,
} from "../src/modules/story-planning";
const copy = () => structuredClone(camp);
const stub = (id: string, requires: string[] = []) => ({
  schemaVersion: 1,
  id,
  version: "1",
  name: id,
  requires,
  actions: [],
  reactions: [],
});
describe("可装卸故事规则包", () => {
  it("运行时装卸，已产生资源和人物变化保留", () => {
    const studio = new StoryStudio("pack");
    const start = studio.query();
    studio.install(camp);
    expect(studio.query().options.some((o) => o.id === "camp/rest")).toBe(true);
    studio.act("camp/rest");
    const after = studio.query();
    expect(after.world.gold).toBe(start.world.gold - 2);
    expect(after.world.npcs[0].trust).toBe(1);
    studio.uninstall("camp");
    expect(studio.query().options.some((o) => o.packId === "camp")).toBe(false);
    expect(studio.query().world.gold).toBe(after.world.gold);
    expect(studio.query().world.npcs).toEqual(after.world.npcs);
    expect(() => studio.act("camp/rest")).toThrow("不可用");
    studio.install(camp);
    expect(studio.query().packs.filter((p) => p.id === "camp")).toHaveLength(1);
  });
  it("替换同编号规则立即生效，原世界身份不重抽", () => {
    const studio = new StoryStudio("replace");
    studio.install(camp);
    const before = studio.query();
    const replacement = copy();
    replacement.version = "1.1";
    replacement.actions[0].cost = 4;
    studio.replace(replacement);
    expect(studio.query().options.find((o) => o.id === "camp/rest")!.cost).toBe(
      4,
    );
    expect(studio.query().world.npcs).toEqual(before.world.npcs);
    expect(() =>
      studio.act("camp/rest", before.world.revision, before.rulesRevision),
    ).toThrow("过期");
  });
  it("重复包、行动编号冲突和未知指令在注册时拒绝，不影响现状", () => {
    const studio = new StoryStudio("bad");
    studio.install(camp);
    const snapshot = studio.query();
    expect(() => studio.install(camp)).toThrow("已注册");
    const duplicate = copy();
    duplicate.id = "duplicate";
    expect(() => studio.install(duplicate)).toThrow("编号冲突");
    const invalid = copy() as unknown as Record<string, unknown>;
    invalid.id = "bad";
    invalid.actions = [
      {
        ...copy().actions[0],
        id: "bad/rest",
        effects: [{ op: "execute", code: "alert(1)" }],
      },
    ];
    expect(() => studio.install(invalid)).toThrow("未知效果");
    expect(studio.query()).toEqual(snapshot);
  });
  it("缺失依赖、依赖卸载、循环依赖和核心包卸载都拒绝", () => {
    const r = createStoryRegistry();
    expect(() => r.register(stub("a", ["missing"]))).toThrow("缺少");
    r.register(stub("a", ["core"]));
    r.register(stub("b", ["a"]));
    expect(() => r.unregister("a")).toThrow("依赖");
    expect(() => r.replace(stub("a", ["b"]))).toThrow("循环");
    expect(() => r.unregister("core")).toThrow("基础");
    expect(() => r.replace(stub("core"))).toThrow("基础");
  });
  it("规则包由注册表快照保存，调用者修改源对象不会改变运行结果", () => {
    const r = createStoryRegistry(),
      pack = copy();
    r.register(pack);
    pack.actions[0].cost = 99;
    expect(
      storyOptions(initializeStory("immutable"), r).find(
        (o) => o.id === "camp/rest",
      )!.cost,
    ).toBe(2);
  });
  it("加载反应失败时，注册表和世界一起回滚", () => {
    const studio = new StoryStudio("rollback");
    const before = studio.query();
    const pack = {
      ...stub("rollback", ["core"]),
      reactions: [
        {
          id: "bad",
          scope: "world",
          priority: 1,
          when: { op: "all", args: [] },
          effects: [{ op: "set", path: "gold", value: { ref: "goal" } }],
        },
      ],
    };
    expect(() => studio.install(pack)).toThrow("字段值");
    expect(studio.query()).toEqual(before);
  });
  it("写入历史、任意字段、错作用域、未知条件及过深结构均拒绝", () => {
    const make = (effect: unknown) => ({
      ...stub("bad"),
      actions: [
        {
          id: "bad/action",
          scope: "world",
          category: "测试",
          text: "测试",
          cost: 0,
          when: { op: "all", args: [] },
          effects: [effect],
        },
      ],
    });
    for (const path of ["history", "__proto__", "npc.trust", "time"])
      expect(() =>
        parseRulePack(make({ op: "set", path, value: 0 })),
      ).toThrow();
    const bad = make({ op: "text", template: "{missing}" });
    expect(() => parseRulePack(bad)).toThrow("字段");
    let deep: unknown = { op: "all", args: [] };
    for (let i = 0; i < 20; i++) deep = { op: "not", arg: deep };
    expect(() =>
      parseRulePack({
        ...stub("deep"),
        reactions: [
          { id: "deep", scope: "world", priority: 0, when: deep, effects: [] },
        ],
      }),
    ).toThrow("嵌套");
  });
  it("旧规则版本行动被拒绝，动作失败不会扣款或写日志", () => {
    const r = createStoryRegistry();
    r.register(camp);
    const w = initializeStory("action");
    const rev = r.revision;
    r.unregister("camp");
    expect(() =>
      processPlayerAction(
        w,
        {
          id: "old",
          revision: w.revision,
          rulesRevision: rev,
          optionId: "buy",
        },
        r,
      ),
    ).toThrow("过期");
    expect(w.gold).toBe(12);
    expect(w.history).toHaveLength(1);
  });
  it("同一结果不重复应用可选包效果，卸载后旧反应不再运行", () => {
    const studio = new StoryStudio("reaction");
    studio.install(camp);
    for (let i = 0; i < 3; i++) studio.act("comfort:npc-0");
    expect(studio.query().world.npcs[0].response).toBe("愿意分享自己的计划。");
    const past = studio
      .query()
      .world.history.filter((h) => h.id.includes("camp/friendship"));
    expect(past).toHaveLength(1);
    studio.act("comfort:npc-0");
    expect(
      studio
        .query()
        .world.history.filter((h) => h.id.includes("camp/friendship")),
    ).toHaveLength(1);
    studio.uninstall("camp");
    for (let i = 0; i < 3; i++) studio.act("comfort:npc-2");
    expect(studio.query().world.npcs[2].response).not.toBe(
      "愿意分享自己的计划。",
    );
  });
  it("反应可启用下一条反应，同一实体每次事务只执行一次", () => {
    const studio = new StoryStudio("cascade");
    const pack = {
      ...stub("cascade", ["core"]),
      reactions: [
        {
          id: "first",
          scope: "world",
          priority: 1,
          when: { op: "eq", left: { ref: "gold" }, right: 14 },
          effects: [{ op: "set", path: "clue", value: true }],
        },
        {
          id: "second",
          scope: "world",
          priority: 2,
          when: { op: "all", args: [] },
          effects: [{ op: "add", path: "gold", value: 2 }],
        },
      ],
    };
    studio.install(pack);
    expect(studio.query().world.gold).toBe(14);
    expect(studio.query().world.clue).toBe(true);
  });
  it("已结束任务不能被规则包重新打开，失败的安装回滚", () => {
    const studio = new StoryStudio("closed");
    studio.act("decline");
    const before = studio.query();
    const pack = {
      ...stub("reopen", ["core"]),
      reactions: [
        {
          id: "open",
          scope: "world",
          priority: 0,
          when: { op: "all", args: [] },
          effects: [{ op: "set", path: "side.status", value: "active" }],
        },
      ],
    };
    expect(() => studio.install(pack)).toThrow("结局不可改写");
    expect(studio.query()).toEqual(before);
  });
  it("等待战斗结果期间禁止卸载，结算与时间消耗完整提交", () => {
    const studio = new StoryStudio("combat");
    studio.install(camp);
    const request = studio.act("attack:npc-0")!;
    expect(() => studio.uninstall("camp")).toThrow("结算");
    expect(() => studio.act("wait")).toThrow("结算");
    studio.settleCombat(request.commandId, true);
    expect(studio.query().world.npcs[0].alive).toBe(false);
    expect(studio.query().world.time).toBe(1);
    expect(() => studio.settleCombat(request.commandId, true)).toThrow("失效");
    studio.uninstall("camp");
  });
  it("扩展字段中的运行时错误让整次行动回滚", () => {
    const r = createStoryRegistry();
    const p = copy();
    p.actions[0].effects = [
      { op: "add", path: "gold", value: 1 },
      { op: "set", path: "resource", value: { ref: "goal" } },
    ] as (typeof p.actions)[0]["effects"];
    r.register(p);
    const w = initializeStory("atomic");
    expect(() =>
      processPlayerAction(
        w,
        { id: "bad", revision: 0, optionId: "camp/rest" },
        r,
      ),
    ).toThrow("字段值");
    expect(w.gold).toBe(12);
    expect(w.processed).toEqual([]);
  });
  it("过量嵌套执行被预算中止，加载事务不产生部分结果", () => {
    const studio = new StoryStudio("budget");
    const before = studio.query();
    let effects: unknown[] = [{ op: "text", template: "测试" }];
    for (let i = 0; i < 10; i++)
      effects = [{ op: "each", collection: "npcs", effects }];
    const pack = {
      ...stub("budget", ["core"]),
      reactions: [
        {
          id: "repeat",
          scope: "world",
          priority: 1,
          when: { op: "all", args: [] },
          effects,
        },
      ],
    };
    expect(() => studio.install(pack)).toThrow("预算");
    expect(studio.query()).toEqual(before);
  });
  it("重新开局保留规则配置，并对新世界应用已加载反应", () => {
    const studio = new StoryStudio("restart");
    studio.install({
      ...stub("start", ["core"]),
      reactions: [
        {
          id: "gift",
          scope: "world",
          priority: 1,
          when: { op: "eq", left: { ref: "gold" }, right: 12 },
          effects: [{ op: "add", path: "gold", value: 1 }],
        },
      ],
    });
    expect(studio.query().world.gold).toBe(13);
    studio.restart("restart");
    expect(studio.query().world.gold).toBe(13);
    expect(studio.query().packs.some((p) => p.id === "start")).toBe(true);
  });
});
