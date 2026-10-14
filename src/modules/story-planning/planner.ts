import { reconcilePlanProgress } from "../objectives/index";
import { collectDependencies } from "./dependencies";
import { evaluate, type Budget } from "./interpreter";
import { template } from "./fields";
import type { World, Option, PlanProgress, StageProgress } from "./model";
import type { RuleRegistry } from "./registry";
export function updatePlans(
  w: World,
  registry: RuleRegistry,
  options: Option[],
  dirty: Set<string>,
  id: string,
  budget: Budget,
  full = false,
) {
  const next: PlanProgress[] = [],
    active = new Set<string>();
  for (const { packId, version, rule } of registry.plans()) {
    const key = `${packId}/${rule.id}`;
    active.add(key);
    const old = w.plans.find((p) => p.id === key);
    const dependencies = collectDependencies(rule);
    dependencies.add(`quest.${rule.questId}.status`);
    const routeActions = new Set(
      rule.stages.flatMap((s) => s.routes.flatMap((r) => r.actionIds)),
    );
    for (const { rule: action } of registry.actions())
      if (routeActions.has(action.id))
        for (const dep of collectDependencies(action.when))
          dependencies.add(dep);
    dependencies.add("ending");
    if (
      old &&
      !full &&
      old.status !== "retired" &&
      ![...dirty].some((k) => dependencies.has(k))
    ) {
      next.push(old);
      continue;
    }
    w.lastUpdate.replannedPlans.push(key);
    const quest = w.quests.find((q) => q.id === rule.questId)!;
    const complete = new Map(
      rule.stages.map((s) => [
        s.id,
        evaluate(s.complete, { world: w }, budget),
      ]),
    );
    const stages: StageProgress[] = rule.stages.map((s) => {
      const previous = old?.stages.find((p) => p.id === s.id);
      const done = complete.get(s.id)!;
      const routes = s.routes.map((route) => {
        const allowed = evaluate(route.when, { world: w }, budget);
        const ids = allowed
          ? options
              .filter(
                (o) =>
                  route.actionIds.includes(o.actionId) &&
                  (!route.npcWhen ||
                    (o.npcId &&
                      evaluate(
                        route.npcWhen,
                        { world: w, npc: w.npcs.find((n) => n.id === o.npcId) },
                        budget,
                      ))),
              )
              .map((o) => o.id)
          : [];
        return {
          id: route.id,
          title: template(route.title, { world: w }),
          available: ids.length > 0,
          optionIds: ids,
        };
      });
      const completedAt = previous?.completedAt ?? (done ? w.time : undefined);
      if (done && previous?.completedAt === undefined)
        w.history.push({
          id: `${id}:plan:${key}:${s.id}`,
          time: w.time,
          text: `阶段完成：${template(s.title, { world: w })}`,
        });
      const prerequisites = s.requires.every((dep) => complete.get(dep));
      let status: StageProgress["status"] = done
        ? "completed"
        : completedAt !== undefined
          ? "invalidated"
          : !prerequisites
            ? "locked"
            : routes.some((r) => r.available)
              ? "ready"
              : "blocked";
      if (quest.status !== "active")
        status = completedAt !== undefined ? "completed" : "closed";
      return {
        id: s.id,
        title: template(s.title, { world: w }),
        status,
        completedAt,
        routes,
      };
    });
    const currentStageId =
      quest.status === "active"
        ? stages.find(
            (s) =>
              !complete.get(s.id) &&
              rule.stages
                .find((def) => def.id === s.id)!
                .requires.every((dep) => complete.get(dep)),
          )?.id
        : undefined;
    next.push({
      id: key,
      packId,
      version,
      title: template(rule.title, { world: w }),
      questId: rule.questId,
      status: quest.status,
      currentStageId,
      stages,
    });
  }
  for (const old of w.plans)
    if (!active.has(old.id)) {
      if (old.status !== "retired")
        w.history.push({
          id: `${id}:plan:${old.id}:retired`,
          time: w.time,
          text: `故事扩展卸载，计划归档：${old.title}`,
        });
      next.push({
        ...old,
        status: "retired",
        currentStageId: undefined,
        stages: old.stages.map((s) => ({
          ...s,
          status: s.completedAt !== undefined ? "completed" : "closed",
          routes: s.routes.map((r) => ({
            ...r,
            available: false,
            optionIds: [],
          })),
        })),
      });
    }
  w.plans = reconcilePlanProgress(w.plans, next);
}
