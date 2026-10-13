import { read, write, value, template, type Context } from "./fields";
import { random } from "./random";
import type { Condition, Effect, Scope } from "./rule-types";
export interface Budget {
  remaining: number;
}
function spend(b: Budget) {
  if (--b.remaining < 0) throw Error("规则执行超过预算，事务已取消");
}
export function contexts(scope: Scope, c: Context): Context[] {
  const providers: Record<Scope, () => Context[]> = {
    world: () => [c],
    npc: () => c.world.npcs.map((npc) => ({ ...c, npc })),
    quest: () => c.world.quests.map((quest) => ({ ...c, quest })),
  };
  return providers[scope]();
}
export function evaluate(condition: Condition, c: Context, b: Budget): boolean {
  spend(b);
  // These are stable language operators, independent of any story or action ID.
  switch (condition.op) {
    case "all":
      return condition.args.every((arg) => evaluate(arg, c, b));
    case "any":
      return condition.args.some((arg) => evaluate(arg, c, b));
    case "not":
      return !evaluate(condition.arg, c, b);
    case "some":
      return contexts(
        condition.collection === "npcs" ? "npc" : "quest",
        c,
      ).some((inner) => evaluate(condition.where, inner, b));
    default: {
      const left = value(condition.left, c),
        right = value(condition.right, c);
      const operators = {
        eq: () => left === right,
        ne: () => left !== right,
        gt: () =>
          typeof left === "number" && typeof right === "number" && left > right,
        gte: () =>
          typeof left === "number" &&
          typeof right === "number" &&
          left >= right,
        includes: () =>
          Array.isArray(left) &&
          typeof right === "string" &&
          left.includes(right),
      };
      return operators[condition.op]();
    }
  }
}
export function execute(effects: Effect[], c: Context, b: Budget): string[] {
  const texts: string[] = [];
  for (const effect of effects) {
    spend(b);
    switch (effect.op) {
      case "set":
        write(effect.path, value(effect.value, c), c);
        break;
      case "add": {
        const old = read(effect.path, c),
          delta = value(effect.value, c);
        if (typeof old !== "number" || typeof delta !== "number")
          throw Error("累加要求数值字段");
        write(effect.path, old + delta, c);
        break;
      }
      case "format":
        write(effect.path, template(effect.template, c), c);
        break;
      case "text":
        texts.push(template(effect.template, c));
        break;
      case "when":
        texts.push(
          ...execute(
            evaluate(effect.condition, c, b)
              ? effect.then
              : (effect.otherwise ?? []),
            c,
            b,
          ),
        );
        break;
      case "chance":
        texts.push(
          ...execute(
            random(c.world) < effect.probability
              ? effect.then
              : (effect.otherwise ?? []),
            c,
            b,
          ),
        );
        break;
      case "each":
        for (const inner of contexts(
          effect.collection === "npcs" ? "npc" : "quest",
          c,
        ))
          if (!effect.condition || evaluate(effect.condition, inner, b))
            texts.push(...execute(effect.effects, inner, b));
        break;
    }
  }
  return texts;
}
