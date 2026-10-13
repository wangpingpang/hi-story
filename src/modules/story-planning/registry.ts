import { parseRulePack } from "./schema";
import type { RulePack } from "./rule-types";
function freeze(value: object) {
  Object.freeze(value);
  for (const v of Object.values(value))
    if (v && typeof v === "object") freeze(v);
}
export class RuleRegistry {
  private entries = new Map<string, RulePack>();
  private pinned = new Set<string>();
  private currentRevision = 0;
  get revision() {
    return this.currentRevision;
  }
  constructor(core?: unknown) {
    if (core) {
      this.register(core);
      this.pinned.add(parseRulePack(core).id);
    }
  }
  private validate(pack: RulePack, replacing = false) {
    if (!replacing && this.entries.size >= 32)
      throw Error("规则包数量超过限制");
    if (!replacing && this.entries.has(pack.id))
      throw Error(`规则包 ${pack.id} 已注册，请使用 replace`);
    for (const id of pack.requires)
      if (!this.entries.has(id)) throw Error(`缺少规则包依赖：${id}`);
    const actionIds = new Set(pack.actions.map((a) => a.id));
    for (const other of this.entries.values())
      if (other.id !== pack.id)
        for (const a of other.actions)
          if (actionIds.has(a.id)) throw Error(`行动编号冲突：${a.id}`);
    // Replacing a pack may introduce a new dependency cycle.
    const graph = new Map([...this.entries].map(([id, p]) => [id, p.requires]));
    graph.set(pack.id, pack.requires);
    const visiting = new Set<string>(),
      done = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw Error("规则包存在循环依赖");
      if (done.has(id)) return;
      visiting.add(id);
      for (const dep of graph.get(id) ?? []) visit(dep);
      visiting.delete(id);
      done.add(id);
    };
    for (const id of graph.keys()) visit(id);
  }
  register(input: unknown) {
    const pack = parseRulePack(input);
    this.validate(pack);
    freeze(pack);
    this.entries.set(pack.id, pack);
    this.currentRevision++;
  }
  replace(input: unknown) {
    const pack = parseRulePack(input);
    if (!this.entries.has(pack.id)) throw Error("只能替换已注册的规则包");
    if (this.pinned.has(pack.id)) throw Error("基础规则包不可运行时替换");
    this.validate(pack, true);
    freeze(pack);
    this.entries.set(pack.id, pack);
    this.currentRevision++;
  }
  unregister(id: string) {
    if (this.pinned.has(id)) throw Error("基础规则包不可卸载");
    if (!this.entries.has(id)) throw Error("规则包尚未注册");
    for (const pack of this.entries.values())
      if (pack.requires.includes(id)) throw Error(`规则包仍被 ${pack.id} 依赖`);
    this.entries.delete(id);
    this.currentRevision++;
  }
  fork() {
    const result = new RuleRegistry();
    result.entries = new Map(this.entries);
    result.pinned = new Set(this.pinned);
    result.currentRevision = this.currentRevision;
    return result;
  }
  list() {
    return [...this.entries.values()].map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      pinned: this.pinned.has(p.id),
    }));
  }
  actions() {
    return [...this.entries.values()].flatMap((p) =>
      p.actions.map((rule) => ({ packId: p.id, rule })),
    );
  }
  reactions() {
    return [...this.entries.values()]
      .flatMap((p) => p.reactions.map((rule) => ({ packId: p.id, rule })))
      .sort(
        (a, b) =>
          a.rule.priority - b.rule.priority ||
          `${a.packId}/${a.rule.id}`.localeCompare(`${b.packId}/${b.rule.id}`),
      );
  }
}
