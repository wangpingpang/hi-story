import {
  initializeStory,
  processPlayerAction,
  receiveWorldChange,
  storyOptions,
  createStoryRegistry,
  applyRuleChange,
  type World,
  type Change,
  type CombatRequest,
} from "../modules/story-planning";
export class StoryStudio {
  private world: World;
  private registry = createStoryRegistry();
  private pending?: CombatRequest;
  constructor(seed: string) {
    this.world = initializeStory(seed);
  }
  query() {
    return {
      world: structuredClone(this.world),
      options: storyOptions(this.world, this.registry),
      packs: this.registry.list(),
      rulesRevision: this.registry.revision,
      pending: structuredClone(this.pending),
    };
  }
  restart(seed: string, background?: { text: string; tags: string[] }) {
    const initial = initializeStory(seed, background);
    const world = applyRuleChange(
      initial,
      "rules-init",
      this.registry,
      "新旅程采用当前故事扩展。",
    );
    storyOptions(world, this.registry);
    this.world = world;
    this.pending = undefined;
  }
  private ready() {
    if (this.pending) throw Error("请先结算当前战斗，再进行其他操作");
  }
  act(
    optionId: string,
    revision = this.world.revision,
    rulesRevision = this.registry.revision,
  ) {
    this.ready();
    const result = processPlayerAction(
      this.world,
      {
        id: `action-${this.world.revision}-${optionId}`,
        revision,
        rulesRevision,
        optionId,
      },
      this.registry,
    );
    this.world = result.world;
    this.pending = result.request;
    return structuredClone(result.request);
  }
  change(id: string, change: Change) {
    this.ready();
    this.world = receiveWorldChange(this.world, id, change, this.registry);
  }
  settleCombat(id: string, killed: boolean) {
    const request = this.pending;
    if (
      !request ||
      request.commandId !== id ||
      request.revision !== this.world.revision ||
      request.rulesRevision !== this.registry.revision
    )
      throw Error("战斗结果已失效");
    let next = this.world;
    if (killed)
      next = receiveWorldChange(
        next,
        id,
        { kind: "npc-death", npcId: request.targetId },
        this.registry,
      );
    next = receiveWorldChange(
      next,
      killed ? `${id}:time` : id,
      { kind: "time", hours: request.cost },
      this.registry,
    );
    this.world = next;
    this.pending = undefined;
  }
  install(input: unknown) {
    this.configure("register", input);
  }
  replace(input: unknown) {
    this.configure("replace", input);
  }
  uninstall(id: string) {
    this.configure("unregister", id);
  }
  private configure(
    operation: "register" | "replace" | "unregister",
    input: unknown,
  ) {
    this.ready();
    const next = this.registry.fork();
    const operations = {
      register: () => next.register(input),
      replace: () => next.replace(input),
      unregister: () => next.unregister(String(input)),
    };
    operations[operation]();
    // Registry and world publish together only after every reaction succeeds.
    const world = applyRuleChange(
      this.world,
      `rules-${next.revision}`,
      next,
      `故事规则包已更新：${next
        .list()
        .map((p) => p.id + "@" + p.version)
        .join("、")}。既有事实保留。`,
    );
    storyOptions(world, next); // Reject packages that cannot produce a valid query.
    this.registry = next;
    this.world = world;
  }
}
