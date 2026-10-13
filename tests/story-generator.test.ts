import { describe, it, expect } from "vitest";
import {
  initializeStory,
  storyOptions,
  processPlayerAction,
  receiveWorldChange,
} from "../src/modules/story-planning";
const act = (w: ReturnType<typeof initializeStory>, optionId: string) =>
  processPlayerAction(w, {
    id: `${w.revision}:${optionId}`,
    revision: w.revision,
    optionId,
  }).world;
describe("随机故事闭环", () => {
  it("种子复现，背景保存，初始选项丰富", () => {
    const a = initializeStory("abc", { text: "流亡者", tags: ["贵族"] });
    expect(a).toEqual(
      initializeStory("abc", { text: "流亡者", tags: ["贵族"] }),
    );
    expect(storyOptions(a).length).toBeGreaterThan(15);
    expect(a.background.tags).toEqual(["贵族"]);
  });
  it("死亡移除互动并终止委托，但既存笔记和其他线索保留", () => {
    let w = receiveWorldChange(initializeStory("death"), "kill", {
      kind: "npc-death",
      npcId: "npc-0",
    });
    expect(w.quests[1].status).toBe("failed");
    expect(storyOptions(w).some((o) => o.id.endsWith(":npc-0"))).toBe(false);
    expect(w.quests[0].status).toBe("active");
    w = act(w, "notes");
    expect(w.clue).toBe(true);
  });
  it("所有线索消失才结束主线", () => {
    let w = initializeStory("fail");
    for (const n of w.npcs)
      w = receiveWorldChange(w, n.id, { kind: "npc-death", npcId: n.id });
    w = receiveWorldChange(w, "burn", { kind: "notes", available: false });
    expect(w.quests[0].status).toBe("failed");
    expect(storyOptions(w)).toEqual([]);
  });
  it("时间到期且重复结果幂等", () => {
    const a = initializeStory("time");
    const b = receiveWorldChange(a, "clock", { kind: "time", hours: 50 });
    expect(b.quests[1].status).toBe("expired");
    expect(receiveWorldChange(b, "clock", { kind: "time", hours: 50 })).toEqual(
      b,
    );
    expect(a.time).toBe(0);
  });
  it("地点变化撤销依赖行动并可恢复", () => {
    const w = initializeStory("map");
    const closed = receiveWorldChange(w, "close", {
      kind: "access",
      accessible: false,
    });
    expect(storyOptions(closed).some((o) => o.id === "buy")).toBe(false);
    expect(
      storyOptions(
        receiveWorldChange(closed, "open", {
          kind: "access",
          accessible: true,
        }),
      ).some((o) => o.id === "buy"),
    ).toBe(true);
  });
  it("拒绝支线仍可完成主线", () => {
    let w = act(initializeStory("finish"), "decline");
    w = act(w, "notes");
    w = act(w, "buy");
    w = act(w, "travel");
    w = act(w, "resolve");
    expect(w.quests.map((q) => q.status)).toEqual(["success", "abandoned"]);
    expect(w.ending).toContain("完成");
  });
  it("离开闭环，过期选项拒绝且不修改原状态", () => {
    const w = initializeStory("leave");
    expect(() =>
      processPlayerAction(w, { id: "x", revision: 9, optionId: "buy" }),
    ).toThrow("过期");
    expect(act(w, "leave").quests.every((q) => q.status === "abandoned")).toBe(
      true,
    );
    expect(w.revision).toBe(0);
  });
  it("战斗请求不能被当成已经杀死目标", () => {
    const w = initializeStory("combat");
    const r = processPlayerAction(w, {
      id: "combat",
      revision: 0,
      optionId: "attack:npc-0",
    });
    expect(r.request?.kind).toBe("combat");
    expect(r.world).toEqual(w);
  });
  it("100个种子都存在可完成的路径且内容变化", () => {
    const combinations = new Set<string>();
    for (let i = 0; i < 100; i++) {
      let w = initializeStory(String(i));
      combinations.add(JSON.stringify([w.conflict.id, w.location, w.npcs]));
      w = act(w, "notes");
      w = act(w, "buy");
      w = act(w, "travel");
      w = act(w, "resolve");
      expect(w.quests[0].status).toBe("success");
    }
    expect(combinations.size).toBeGreaterThan(90);
  });
});
