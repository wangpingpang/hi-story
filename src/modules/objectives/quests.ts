export type QuestStatus = "active" | "success" | "failed" | "abandoned" | "expired";
export interface QuestState {
  id: string;
  title: string;
  status: QuestStatus;
  reason: string;
  dependencies: string[];
}
const statuses: QuestStatus[] = ["active", "success", "failed", "abandoned", "expired"];
export function transitionQuest(q: QuestState, status: QuestStatus): QuestState {
  if (!statuses.includes(status)) throw Error("任务状态不合法");
  if (q.status !== "active" && status !== q.status) throw Error("已结束任务的结局不可改写");
  return { ...q, dependencies: [...q.dependencies], status };
}
export function explainQuest(q: QuestState, reason: string): QuestState {
  if (typeof reason !== "string" || reason.length > 2048) throw Error("任务说明不合法");
  return { ...q, dependencies: [...q.dependencies], reason };
}
export function validateQuestTransitions(before: QuestState[], after: QuestState[]) {
  if (new Set(after.map(q => q.id)).size !== after.length) throw Error("任务编号重复");
  for (const q of after) transitionQuest(q, q.status);
  for (const old of before.filter(q => q.status !== "active")) {
    const next = after.find(q => q.id === old.id);
    if (!next || next.status !== old.status || next.reason !== old.reason) throw Error("已结束任务的结局不可改写");
  }
}

export interface RouteProgress {
  id: string;
  title: string;
  available: boolean;
  optionIds: string[];
}
export interface StageProgress {
  id: string;
  title: string;
  status:
    "locked" | "ready" | "blocked" | "completed" | "invalidated" | "closed";
  completedAt?: number;
  routes: RouteProgress[];
}
export interface PlanProgress {
  id: string;
  packId: string;
  version: string;
  title: string;
  questId: string;
  status: QuestStatus | "retired";
  currentStageId?: string;
  stages: StageProgress[];
}

/** Accept a story proposal while preserving task history in the objective domain. */
export function reconcilePlanProgress(before: PlanProgress[], proposals: PlanProgress[]): PlanProgress[] {
  if (new Set(proposals.map(p => p.id)).size !== proposals.length) throw Error("任务计划编号重复");
  return proposals.map(p => {
    const old = before.find(previous => previous.id === p.id);
    if (old && !["active", "retired"].includes(old.status) && p.status !== old.status && p.status !== "retired") throw Error("已结束计划的结局不可改写");
    return { ...structuredClone(p), stages: p.stages.map(stage => {
      const previous = old?.stages.find(s => s.id === stage.id);
      const completedAt = previous?.completedAt ?? stage.completedAt;
      if (completedAt !== undefined && (!Number.isFinite(completedAt) || completedAt < 0)) throw Error("阶段完成时间不合法");
      return { ...structuredClone(stage), completedAt };
    }) };
  });
}
