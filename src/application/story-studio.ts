import { freeze } from "../contracts";
import {
  initializeStory, processPlayerAction, receiveWorldChange, storyOptions,
  createStoryRegistry, applyRuleChange, type World, type Change, type CombatRequest,
} from "../modules/story-planning";
import { requireEvent, waitForEvent, settleEvent, type EventInstance } from "../modules/story-runtime";
import { bindStoryEvents, describeSettlement, itemName } from "./story-events";
export interface EventCommand {
  commandId: string;
  runId: string;
  expectedRevision: number;
  rulesRevision: number;
  eventInstanceId: string;
  optionId: string;
}
interface Receipt { fingerprint: string; revision: number; request?: CombatRequest }
interface StudioState {
  world: World;
  runId: string;
  revision: number;
  events: EventInstance[];
  receipts: Record<string, Receipt>;
  pending?: CombatRequest & { eventInstanceId: string; optionId: string };
}
interface StudioConfig { createId?: () => string; beforeCommit?: (candidate: StudioState) => void }
export class StoryStudio {
  private registry = createStoryRegistry();
  private state: StudioState;
  private readonly createId: () => string;
  constructor(seed: string, private readonly config: StudioConfig = {}) {
    this.createId = config.createId ?? (() => crypto.randomUUID());
    this.state = this.initial(seed);
  }
  private initial(seed: string, background?: { text: string; tags: string[] }): StudioState {
    const initial = initializeStory(seed, background);
    const world = this.registry.revision === 1 ? initial : applyRuleChange(initial, "rules-init", this.registry, "新旅程采用当前故事扩展。");
    const runId = this.createId();
    if (typeof runId !== "string" || !runId.trim() || runId.length > 128 || runId === this.state?.runId) throw Error("新局编号必须有效且不同于旧局");
    return { world, runId, revision: 0, events: bindStoryEvents(runId, world, this.registry, []), receipts: {} };
  }
  query() {
    const s = structuredClone(this.state);
    const options = s.pending ? [] : storyOptions(s.world, this.registry).flatMap(o => {
      const event = s.events.find(e => e.status === "ready" && e.optionIds.includes(o.id));
      return event ? [{ ...o, eventInstanceId: event.id }] : [];
    });
    const view = { world: s.world, runId: s.runId, revision: s.revision, events: s.events, options,
      inventory: { items: Object.entries(s.world.inventory.items).map(([id, amount]) => ({ id, name: itemName(id), amount })), clues: s.world.inventory.clues },
      packs: this.registry.list(), rulesRevision: this.registry.revision, pending: s.pending };
    freeze(view);
    return view;
  }
  private publish(candidate: StudioState) {
    this.config.beforeCommit?.(structuredClone(candidate));
    this.state = structuredClone(candidate);
  }
  restart(seed: string, background?: { text: string; tags: string[] }) { this.publish(this.initial(seed, background)); }
  private ready() { if (this.state.pending) throw Error("请先结算当前战斗，再进行其他操作"); }
  choose(command: EventCommand) {
    if (!command || Object.keys(command).some(k => !["commandId", "runId", "expectedRevision", "rulesRevision", "eventInstanceId", "optionId"].includes(k)) ||
      [command.commandId, command.runId, command.eventInstanceId, command.optionId].some(id => typeof id !== "string" || !id.trim() || id.length > 2048) ||
      !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 || !Number.isSafeInteger(command.rulesRevision) || command.rulesRevision < 0) throw Error("命令字段不合法");
    const s = this.state;
    if (command.runId !== s.runId) throw Error("旧旅程命令已失效");
    const fingerprint = JSON.stringify([command.runId, command.expectedRevision, command.rulesRevision, command.eventInstanceId, command.optionId]);
    const receipt = Object.hasOwn(s.receipts, command.commandId) ? s.receipts[command.commandId] : undefined;
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw Error("同一命令编号不能更换内容");
      return { duplicate: true, revision: receipt.revision, request: structuredClone(receipt.request) };
    }
    this.ready();
    if (command.expectedRevision !== s.revision || command.rulesRevision !== this.registry.revision) throw Error("选项已经过期，请重新选择");
    const event = requireEvent(s.events, s.runId, command.eventInstanceId, command.optionId);
    if (event.binding.locationId !== s.world.location) throw Error("事件地点不匹配");
    if (event.binding.npcId) {
      const npc = s.world.npcs.find(n => n.id === event.binding.npcId);
      if (!npc?.alive || npc.location !== s.world.location) throw Error("事件人物不在现场");
    }
    const candidate = structuredClone(s);
    const result = processPlayerAction(s.world, { id: `choose:${s.runId}:${command.commandId}`, revision: s.world.revision, rulesRevision: command.rulesRevision, optionId: command.optionId }, this.registry);
    candidate.world = result.world;
    candidate.revision++;
    if (result.request) {
      candidate.pending = { ...result.request, eventInstanceId: event.id, optionId: command.optionId };
      candidate.events = waitForEvent(candidate.events, event.id);
    } else {
      candidate.events = settleEvent(candidate.events, event.id, describeSettlement(s.world, candidate.world, command.commandId, command.optionId, candidate.revision));
      candidate.events = bindStoryEvents(s.runId, candidate.world, this.registry, candidate.events);
    }
    Object.defineProperty(candidate.receipts, command.commandId, { value: { fingerprint, revision: candidate.revision, request: result.request }, enumerable: true });
    this.publish(candidate);
    return { duplicate: false, revision: candidate.revision, request: structuredClone(result.request) };
  }
  /** Compatibility helper. Browser input must use choose with captured run/version/event IDs. */
  act(optionId: string, revision = this.state.world.revision, rulesRevision = this.registry.revision) {
    if (revision !== this.state.world.revision) throw Error("选项已经过期，请重新选择");
    const event = this.state.events.find(e => e.status === "ready" && e.optionIds.includes(optionId));
    if (!event) throw Error("当前行动不可用");
    return this.choose({ commandId: `action-${this.state.revision}-${optionId}`, runId: this.state.runId,
      expectedRevision: this.state.revision, rulesRevision, eventInstanceId: event.id, optionId }).request;
  }
  change(id: string, change: Change) {
    this.ready();
    const next = receiveWorldChange(this.state.world, `change:${id}`, change, this.registry);
    if (next.revision === this.state.world.revision) return;
    const candidate = { ...structuredClone(this.state), world: next, revision: this.state.revision + 1 };
    candidate.events = bindStoryEvents(candidate.runId, next, this.registry, candidate.events);
    this.publish(candidate);
  }
  settleCombat(id: string, killed: boolean) {
    const s = this.state, request = s.pending;
    if (typeof killed !== "boolean" || !request || request.commandId !== id || request.revision !== s.world.revision || request.rulesRevision !== this.registry.revision) throw Error("战斗结果已失效");
    let world = s.world;
    if (killed) world = receiveWorldChange(world, id, { kind: "npc-death", npcId: request.targetId }, this.registry);
    world = receiveWorldChange(world, `${id}:time`, { kind: "time", hours: request.cost }, this.registry);
    const candidate = { ...structuredClone(s), world, revision: s.revision + 1, pending: undefined };
    candidate.events = settleEvent(s.events, request.eventInstanceId, describeSettlement(s.world, world, id, request.optionId, candidate.revision));
    candidate.events = bindStoryEvents(candidate.runId, world, this.registry, candidate.events);
    this.publish(candidate);
  }
  install(input: unknown) { this.configure("register", input); }
  replace(input: unknown) { this.configure("replace", input); }
  uninstall(id: string) { this.configure("unregister", id); }
  private configure(operation: "register" | "replace" | "unregister", input: unknown) {
    this.ready();
    const next = this.registry.fork();
    const operations = { register: () => next.register(input), replace: () => next.replace(input), unregister: () => next.unregister(String(input)) };
    operations[operation]();
    const world = applyRuleChange(this.state.world, `rules-${next.revision}`, next, `故事规则包已更新：${next.list().map(p => p.id + "@" + p.version).join("、")}。既有事实保留。`);
    const candidate = { ...structuredClone(this.state), world, revision: this.state.revision + 1 };
    candidate.events = bindStoryEvents(candidate.runId, world, next, candidate.events);
    this.publish(candidate);
    this.registry = next;
  }
}
