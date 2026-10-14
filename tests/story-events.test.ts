import { describe, it, expect } from "vitest";
import { StoryStudio, type EventCommand } from "../src/application/story-studio";
import { createHoldings, adjustQuantity, setClue } from "../src/modules/inventory";
import { transitionQuest } from "../src/modules/objectives";
const command = (studio: StoryStudio, optionId: string, commandId = crypto.randomUUID()): EventCommand => {
  const q = studio.query(), o = q.options.find(o => o.id === optionId)!;
  return { commandId, runId: q.runId, expectedRevision: q.revision, rulesRevision: q.rulesRevision, eventInstanceId: o.eventInstanceId, optionId };
};
const pack = (repeat = "once") => ({
  schemaVersion: 1, id: "cache", version: "1", name: "遗留行囊", requires: ["core"], reactions: [],
  actions: [
    { id: "cache/open", scope: "world", category: "探索", text: "打开行囊", cost: 1,
      event: { id: "satchel", repeat, questId: "main" }, when: { op: "all", args: [] },
      effects: [{ op: "add", path: "item.rope", value: 2 }, { op: "set", path: "clue.main", value: true }] },
    { id: "cache/sell", scope: "world", category: "探索", text: "卖出行囊", cost: 1,
      event: { id: "satchel", repeat, questId: "main" }, when: { op: "all", args: [] },
      effects: [{ op: "add", path: "gold", value: 3 }] }
  ]
});
describe("任务、物品与事件接入", () => {
  it("探索线索、购买物资真实改变背包和阶段，再完成目标", () => {
    const s = new StoryStudio("integrated");
    s.choose(command(s, "notes"));
    expect(s.query().inventory.clues).toContain("main");
    expect(s.query().world.plans[0].currentStageId).toBe("gather");
    s.choose(command(s, "buy"));
    const q = s.query();
    expect(q.world.inventory.items).toMatchObject({ gold: 7, supplies: 1 });
    expect(q.world.resource).toBe(true);
    expect(q.world.quests.find(q => q.id === "side")!.status).toBe("success");
    const receipt = q.events.find(e => e.settlement?.optionId === "buy")!.settlement!;
    expect(receipt.itemChanges).toContainEqual({ id: "gold", before: 12, after: 7 });
    expect(receipt.questChanges).toContainEqual({ id: "side", before: "active", after: "success" });
    s.choose(command(s, "travel")); s.choose(command(s, "resolve"));
    expect(s.query().world.quests.find(q => q.id === "main")!.status).toBe("success");
    expect(s.query().options).toEqual([]);
  });
  it("同一成功命令返回原回执，换编号重放旧事件也不能再次结算", () => {
    const s = new StoryStudio("retry");
    const c = command(s, "buy");
    const r = s.choose(c), after = s.query();
    expect(s.choose(c)).toMatchObject({ duplicate: true, revision: r.revision });
    expect(s.query()).toEqual(after);
    expect(() => s.choose({ ...c, commandId: "second", expectedRevision: after.revision })).toThrow("已结算");
    expect(s.query()).toEqual(after);
  });
  it("命令编号不可换载荷；旧版本、坏结构均拒绝", () => {
    const s = new StoryStudio("invalid"), c = command(s, "wait");
    s.choose(c); const before = s.query();
    expect(() => s.choose({ ...c, optionId: "buy" })).toThrow("更换内容");
    expect(() => s.choose({ ...c, commandId: "new" })).toThrow("过期");
    expect(() => s.choose({ ...c, expectedRevision: NaN })).toThrow("字段不合法");
    expect(() => s.choose({ ...c, unexpected: 1 } as EventCommand)).toThrow("字段不合法");
    expect(s.query()).toEqual(before);
  });
  it("同一行囊两个选择共用一次性事件，卸载、替换、再安装不会重复领奖", () => {
    const s = new StoryStudio("once"); s.install(pack());
    const open = command(s, "cache/open"), sell = command(s, "cache/sell");
    expect(open.eventInstanceId).toBe(sell.eventInstanceId);
    s.choose(open);
    expect(s.query().world.inventory.items.rope).toBe(2);
    expect(s.query().world.plans[0].currentStageId).toBe("gather");
    expect(s.query().options.some(o => o.id.startsWith("cache/"))).toBe(false);
    s.replace({ ...pack(), version: "2" });
    s.uninstall("cache"); s.install(pack());
    expect(s.query().options.some(o => o.id.startsWith("cache/"))).toBe(false);
    expect(s.query().world.inventory.items.rope).toBe(2);
    expect(() => s.choose({ ...sell, commandId: "steal", expectedRevision: s.query().revision, rulesRevision: s.query().rulesRevision })).toThrow("已结算");
  });
  it("重复行动生成新的事件实例；旧实例永远不可重复结算", () => {
    const s = new StoryStudio("repeat"); s.install(pack("repeatable"));
    const a = command(s, "cache/sell"); s.choose(a);
    const b = command(s, "cache/sell");
    expect(b.eventInstanceId).not.toBe(a.eventInstanceId);
    s.choose(b);
    expect(s.query().world.gold).toBe(18);
    expect(s.query().events.filter(e => e.settlement?.optionId === "cache/sell")).toHaveLength(2);
  });
  it("原重复搜寻/安慰语义保留，物资丢失仍可购买，不重写已完成任务", () => {
    const s = new StoryStudio("recover"); s.act("comfort:npc-0"); s.act("comfort:npc-0");
    s.act("buy"); s.change("lost", { kind: "resource", available: false }); s.act("buy");
    expect(s.query().world.inventory.items).toMatchObject({ gold: 2, supplies: 1 });
    expect(s.query().world.quests[1].status).toBe("success");
  });
  it("领域执行中途数量不足，扣费、随机状态、任务、事件与回执全部回滚", () => {
    const s = new StoryStudio("rollback"); const p = pack();
    p.actions[0].effects = [{ op: "chance", probability: .5, then: [{ op: "text", template: "随机调查" }] }, { op: "add", path: "gold", value: -1 }, { op: "add", path: "item.rope", value: -1 }] as never;
    s.install(p); const before = s.query(), c = command(s, "cache/open");
    expect(() => s.choose(c)).toThrow("物资不足");
    expect(s.query()).toEqual(before);
    expect(() => s.choose(c)).toThrow("物资不足");
    s.act("buy"); expect(s.query().world.gold).toBe(7);
  });
  it("提交故障不留下奖励和结算记录，原命令可安全重试", () => {
    let fail = false;
    const s = new StoryStudio("commit", { beforeCommit: () => { if (fail) throw Error("存储故障"); } });
    const before = s.query(), c = command(s, "buy"); fail = true;
    expect(() => s.choose(c)).toThrow("存储故障"); expect(s.query()).toEqual(before);
    fail = false; expect(s.choose(c).duplicate).toBe(false); expect(s.query().world.gold).toBe(7);
  });
  it("规则提交故障也回滚规则表；重开失败保留旧局", () => {
    let fail = false;
    const s = new StoryStudio("rules", { beforeCommit: () => { if (fail) throw Error("故障"); } });
    const before = s.query(); fail = true;
    expect(() => s.install(pack())).toThrow("故障"); expect(s.query()).toEqual(before);
    expect(() => s.restart("next")).toThrow("故障"); expect(s.query()).toEqual(before);
  });
  it("同种子重开换局、恢复背包、清空事件；旧命令与战斗结果失效", () => {
    const s = new StoryStudio("reset"); const c = command(s, "buy"); s.choose(c);
    const attack = s.act("attack:npc-0")!; const oldId = s.query().runId;
    s.restart("reset"); expect(s.query().runId).not.toBe(oldId);
    expect(s.query().world.gold).toBe(12); expect(s.query().revision).toBe(0);
    expect(s.query().events.some(e => e.settlement)).toBe(false);
    expect(() => s.choose(c)).toThrow("旧旅程");
    expect(() => s.settleCombat(attack.commandId, true)).toThrow("失效");
  });
  it("重开后发起相同战斗，旧请求不能误结算新请求", () => {
    const s = new StoryStudio("same-combat"), old = s.act("attack:npc-0")!;
    s.restart("same-combat"); const current = s.act("attack:npc-0")!;
    expect(current.commandId).not.toBe(old.commandId);
    const before = s.query();
    expect(() => s.settleCombat(old.commandId, true)).toThrow("失效");
    expect(s.query()).toEqual(before);
    s.settleCombat(current.commandId, false);
    expect(s.query().world.npcs[0].alive).toBe(true);
  });
  it("等待战斗时只有waiting事件，结果与事件一次提交，重复结果不生效", () => {
    const s = new StoryStudio("combat"), c = command(s, "attack:npc-0");
    const r = s.choose(c); expect(s.query().events.find(e => e.id === c.eventInstanceId)!.status).toBe("waiting");
    expect(s.query().options).toEqual([]);
    expect(s.choose(c).duplicate).toBe(true);
    expect(() => s.act("buy")).toThrow("先结算");
    s.settleCombat(r.request!.commandId, true); const before = s.query();
    expect(before.world.npcs[0].alive).toBe(false);
    expect(before.events.find(e => e.id === c.eventInstanceId)!.status).toBe("settled");
    expect(() => s.settleCombat(r.request!.commandId, true)).toThrow("失效"); expect(s.query()).toEqual(before);
  });
  it("NPC死亡和离开现场使绑定事件失效，返回后保留身份", () => {
    const s = new StoryStudio("npc"), c = command(s, "comfort:npc-0"), initial = s.query();
    s.change("move", { kind: "npc-move", npcId: "npc-0", location: "营地" });
    expect(s.query().options.some(o => o.id.endsWith(":npc-0"))).toBe(false);
    expect(() => s.choose({ ...c, expectedRevision: s.query().revision })).toThrow("失效");
    s.change("return", { kind: "npc-move", npcId: "npc-0", location: initial.world.location });
    expect(command(s, "comfort:npc-0").eventInstanceId).toBe(c.eventInstanceId);
    s.change("death", { kind: "npc-death", npcId: "npc-0" });
    expect(s.query().options.some(o => o.id.endsWith(":npc-0"))).toBe(false);
  });
  it("通用物品/线索依赖继续向下更新，消耗物品可推进物资阶段", () => {
    const s = new StoryStudio("item-chain"), p = pack();
    p.reactions = [{ id: "use", scope: "world", priority: 0, when: { op: "gte", left: { ref: "item.rope" }, right: 2 },
      effects: [{ op: "add", path: "item.rope", value: -1 }, { op: "set", path: "resource", value: true }] }] as never;
    s.install(p); s.act("cache/open");
    const w = s.query().world;
    expect(w.inventory.items.rope).toBe(1); expect(w.resource).toBe(true); expect(w.inventory.clues).toContain("main");
    expect(w.plans[0].currentStageId).toBe("reach"); expect(w.quests[1].status).toBe("success");
  });
  it("查询深冻结且独立，不泄漏领域可写引用", () => {
    const s = new StoryStudio("immutable"), q = s.query();
    expect(() => q.world.inventory.items.gold = 500).toThrow();
    expect(() => q.events[0].optionIds.push("bad")).toThrow();
    expect(s.query().world.gold).toBe(12);
  });
  it("拒绝非法物品数量和编号，线索重复添加不会重复持有，终局不可恢复active", () => {
    const h = createHoldings();
    for (const n of [-99, NaN, Infinity, .5, Number.MAX_SAFE_INTEGER]) expect(() => adjustQuantity(h, "gold", n)).toThrow();
    expect(() => adjustQuantity(h, "__proto__", 1)).toThrow();
    expect(setClue(setClue(h, "main", true), "main", true).clues).toEqual(["main"]);
    expect(() => transitionQuest({ id: "q", title: "目标", status: "success", reason: "", dependencies: [] }, "active")).toThrow("不可改写");
  });
});
