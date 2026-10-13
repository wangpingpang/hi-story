import { describe, it, expect } from "vitest";
import {
  initializeStory,
  processPlayerAction,
  receiveWorldChange,
  storyOptions,
  parseRulePack,
  type World,
} from "../src/modules/story-planning";
import { StoryStudio } from "../src/application/story-studio";
const act = (w: World, id: string) =>
  processPlayerAction(w, {
    id: `${w.revision}:${id}`,
    revision: w.revision,
    optionId: id,
  }).world;
const plan = (w: World) => w.plans.find((p) => p.id === "core/journey")!;
const stub = (id: string) => ({
  schemaVersion: 1,
  id,
  version: "1",
  name: id,
  requires: ["core"],
  actions: [],
  reactions: [],
});
const extraPlan = {
  id: "extra",
  title: "额外研究路线",
  questId: "main",
  stages: [
    {
      id: "read",
      title: "取得线索",
      requires: [],
      complete: { op: "eq", left: { ref: "clue" }, right: true },
      routes: [
        {
          id: "notes",
          title: "阅读笔记",
          when: { op: "eq", left: { ref: "notes" }, right: true },
          actionIds: ["notes"],
        },
      ],
    },
  ],
};
describe("阶段规划与依赖索引", () => {
  it("四阶段逐步推进，最终操作必须先抵达，目标保持不变", () => {
    let w = initializeStory("stages");
    const goal = w.goal;
    expect(plan(w).currentStageId).toBe("learn");
    w = act(w, "notes");
    expect(plan(w).currentStageId).toBe("gather");
    w = act(w, "buy");
    expect(plan(w).currentStageId).toBe("reach");
    expect(storyOptions(w).some((o) => o.id === "resolve")).toBe(false);
    w = act(w, "travel");
    expect(plan(w).currentStageId).toBe("finish");
    w = act(w, "resolve");
    expect(plan(w).status).toBe("success");
    expect(plan(w).stages.every((s) => s.status === "completed")).toBe(true);
    expect(w.goal).toBe(goal);
  });
  it("提前取得物资可以保留，自由行动不会被推荐阶段强制限制", () => {
    let w = act(initializeStory("ahead"), "buy");
    expect(plan(w).currentStageId).toBe("learn");
    expect(plan(w).stages[1].completedAt).toBe(1);
    w = act(w, "notes");
    expect(plan(w).currentStageId).toBe("reach");
  });
  it("关键人物死亡关闭对应路线，笔记和剩余知情者继续有效", () => {
    let w = receiveWorldChange(initializeStory("death-route"), "kill0", {
      kind: "npc-death",
      npcId: "npc-0",
    });
    const witness = plan(w).stages[0].routes.find((r) => r.id === "witness")!;
    expect(witness.optionIds).toEqual(["ask:npc-2", "threat:npc-2"]);
    w = receiveWorldChange(w, "kill2", { kind: "npc-death", npcId: "npc-2" });
    expect(
      plan(w).stages[0].routes.find((r) => r.id === "witness")!.available,
    ).toBe(false);
    expect(
      plan(w).stages[0].routes.find((r) => r.id === "notes")!.available,
    ).toBe(true);
  });
  it("知情者离开现场，未知情人物不能被当成主线线索来源", () => {
    let w = receiveWorldChange(initializeStory("move"), "burn", {
      kind: "notes",
      available: false,
    });
    for (const id of ["npc-0", "npc-2"])
      w = receiveWorldChange(w, `move-${id}`, {
        kind: "npc-move",
        npcId: id,
        location: "远处营地",
      });
    expect(w.quests[0].status).toBe("active");
    expect(plan(w).stages[0].status).toBe("blocked");
    w = receiveWorldChange(w, "return", {
      kind: "npc-move",
      npcId: "npc-2",
      location: w.location,
    });
    expect(plan(w).stages[0].status).toBe("ready");
  });
  it("物资丢失回到准备阶段，首次完成时间和日志不抹除", () => {
    let w = act(act(initializeStory("lost"), "notes"), "buy");
    const completed = plan(w).stages[1].completedAt;
    const log = w.history.find((h) => h.id.includes(":gather"));
    w = receiveWorldChange(w, "lost", { kind: "resource", available: false });
    expect(plan(w).currentStageId).toBe("gather");
    expect(plan(w).stages[1].status).toBe("invalidated");
    expect(plan(w).stages[1].completedAt).toBe(completed);
    expect(w.history).toContainEqual(log);
    w = act(w, "buy");
    expect(plan(w).stages[1].completedAt).toBe(completed);
    expect(w.history.filter((h) => h.id.endsWith(":gather"))).toHaveLength(1);
  });
  it("道路封闭阻止抵达，恢复后可继续；已抵达记录仍保留", () => {
    let w = act(act(initializeStory("road"), "notes"), "buy");
    w = receiveWorldChange(w, "close", { kind: "access", accessible: false });
    expect(plan(w).stages[2].status).toBe("blocked");
    w = receiveWorldChange(w, "open", { kind: "access", accessible: true });
    w = act(w, "travel");
    const time = plan(w).stages[2].completedAt;
    w = receiveWorldChange(w, "close2", { kind: "access", accessible: false });
    expect(plan(w).stages[2].status).toBe("invalidated");
    expect(storyOptions(w).some((o) => o.id === "resolve")).toBe(false);
    w = receiveWorldChange(w, "open2", { kind: "access", accessible: true });
    expect(plan(w).currentStageId).toBe("finish");
    expect(plan(w).stages[2].completedAt).toBe(time);
  });
  it("全部线索消失形成失败终局，未完成阶段关闭", () => {
    let w = initializeStory("failure");
    for (const id of ["npc-0", "npc-2"])
      w = receiveWorldChange(w, id, { kind: "npc-death", npcId: id });
    w = receiveWorldChange(w, "burn", { kind: "notes", available: false });
    expect(plan(w).status).toBe("failed");
    expect(plan(w).stages.every((s) => s.status === "closed")).toBe(true);
    expect(plan(w).currentStageId).toBeUndefined();
  });
  it("人物信任变化只调度本人的扩展反应，跳过不相关人物和计划", () => {
    const studio = new StoryStudio("index");
    studio.install({
      ...stub("trust"),
      reactions: [
        {
          id: "warm",
          scope: "npc",
          priority: 50,
          when: { op: "gte", left: { ref: "npc.trust" }, right: 1 },
          effects: [{ op: "set", path: "npc.response", value: "愿意合作" }],
        },
      ],
    });
    studio.act("comfort:npc-0");
    const trace = studio.query().world.lastUpdate;
    expect(trace.evaluatedReactions).toContain("trust/warm/npc-0");
    expect(trace.evaluatedReactions).not.toContain("trust/warm/npc-2");
    expect(trace.replannedPlans).toEqual([]);
    expect(trace.evaluatedReactions).not.toContain("core/main-failed/world");
  });
  it("集合条件监听人物变化，反应产生的新字段继续向下传播", () => {
    const studio = new StoryStudio("cascade-index");
    studio.install({
      ...stub("cascade"),
      reactions: [
        {
          id: "reward",
          scope: "world",
          priority: 1,
          when: { op: "eq", left: { ref: "clue" }, right: true },
          effects: [{ op: "add", path: "gold", value: 1 }],
        },
        {
          id: "reveal",
          scope: "world",
          priority: 2,
          when: {
            op: "some",
            collection: "npcs",
            where: { op: "gte", left: { ref: "npc.trust" }, right: 1 },
          },
          effects: [{ op: "set", path: "clue", value: true }],
        },
      ],
    });
    studio.act("comfort:npc-0");
    const w = studio.query().world;
    expect(w.clue).toBe(true);
    expect(w.gold).toBe(13);
    expect(w.lastUpdate.firedReactions).toEqual(
      expect.arrayContaining(["cascade/reveal/world", "cascade/reward/world"]),
    );
    expect(plan(w).currentStageId).toBe("gather");
  });
  it("带计划的扩展可装卸，卸载归档阶段记录，再装入保留首次完成时间", () => {
    const studio = new StoryStudio("archive");
    const pack = { ...stub("research"), plans: [extraPlan] };
    studio.install(pack);
    studio.act("notes");
    const recorded = studio
      .query()
      .world.plans.find((p) => p.id === "research/extra")!.stages[0]
      .completedAt;
    studio.uninstall("research");
    expect(
      studio.query().world.plans.find((p) => p.id === "research/extra")!.status,
    ).toBe("retired");
    studio.install(pack);
    expect(
      studio.query().world.plans.find((p) => p.id === "research/extra")!
        .stages[0].completedAt,
    ).toBe(recorded);
  });
  it("阶段循环、缺失前置、重复阶段和未知行动均拒绝安装", () => {
    const make = () => ({
      ...stub("invalid"),
      plans: [structuredClone(extraPlan)],
    });
    let pack = make();
    pack.plans[0].stages[0].requires = ["read"] as never[];
    expect(() => parseRulePack(pack)).toThrow("循环");
    pack = make();
    pack.plans[0].stages[0].requires = ["missing"] as never[];
    expect(() => parseRulePack(pack)).toThrow("不存在");
    pack = make();
    pack.plans[0].stages.push(structuredClone(pack.plans[0].stages[0]));
    expect(() => parseRulePack(pack)).toThrow("重复");
    pack = make();
    pack.plans[0].stages[0].routes[0].actionIds = ["missing"];
    const studio = new StoryStudio("bad-plan"),
      before = studio.query();
    expect(() => studio.install(pack)).toThrow("未知行动");
    expect(studio.query()).toEqual(before);
  });
  it("任务数组换序仍按任务ID结算，已经结束的计划不会重新打开", () => {
    let w = initializeStory("order");
    w.quests.reverse();
    w = act(w, "notes");
    w = act(w, "buy");
    w = act(w, "travel");
    w = act(w, "resolve");
    w = receiveWorldChange(w, "lost-after-end", {
      kind: "resource",
      available: false,
    });
    expect(plan(w).status).toBe("success");
    expect(plan(w).stages.every((s) => s.status === "completed")).toBe(true);
  });
  it("故事NPC通过带参人物接口补齐资料，运行状态变化不重抽身份", () => {
    let w = initializeStory("profiles");
    const before = structuredClone(w.npcs.map((n) => n.profile));
    for (const npc of w.npcs) {
      expect(npc.profile.name).toBe(npc.name);
      expect(npc.profile.identity.occupation).toBe(npc.role);
      expect(npc.profile.personality.traits).toEqual([npc.trait]);
      expect(npc.profile.motivation).toBe(npc.goal);
      expect(npc.profile.appearance.version).toBe("appearance/2");
    }
    expect(new Set(before.map((p) => p.seed)).size).toBe(3);
    w = act(w, "comfort:npc-0");
    w = receiveWorldChange(w, "kill-profile", {
      kind: "npc-death",
      npcId: "npc-0",
    });
    expect(w.npcs.map((n) => n.profile)).toEqual(before);
  });
});
