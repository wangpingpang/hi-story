import { requireValue, seedHash } from '../../contracts/demo';
export interface TaskBlueprint {
  id: string; title: string; source: string;
  condition: { kind: 'story-status'; questId: string } | { kind: 'visit'; anchorId: string };
  rewardGold: number;
}
export interface TaskGenerationInput {
  seed: string; quests: { id: string; title: string }[]; anchorIds: string[];
}
export interface TaskParticipant {
  id: string;
  generate(input: Readonly<TaskGenerationInput>): TaskBlueprint[];
}
export class TaskGeneratorRegistry {
  private participants = new Map<string, TaskParticipant>();
  register(participant: TaskParticipant): void {
    requireValue(Boolean(participant.id) && !this.participants.has(participant.id), 'INVALID_TASK_PROVIDER', '任务生成参与者编号必须唯一。');
    this.participants.set(participant.id, participant);
  }
  generate(input: TaskGenerationInput): TaskBlueprint[] {
    const result: TaskBlueprint[] = [], ids = new Set<string>();
    for (const participant of this.participants.values()) {
      const proposed = participant.generate(structuredClone(input));
      requireValue(Array.isArray(proposed), 'INVALID_TASK_BLUEPRINT', '任务参与者必须返回蓝图数组。');
      for (const task of proposed) {
        requireValue(task && typeof task.id === 'string' && task.id.length > 0 && !ids.has(task.id) && typeof task.title === 'string' && task.title.trim() && task.source === participant.id, 'INVALID_TASK_BLUEPRINT', '任务蓝图身份或来源无效。');
        const condition=task.condition;
        requireValue(Number.isSafeInteger(task.rewardGold) && task.rewardGold >= 0 && task.rewardGold <= 100, 'INVALID_TASK_BLUEPRINT', '任务奖励无效。');
        requireValue(condition && (condition.kind === 'visit' ? input.anchorIds.includes(condition.anchorId) : condition.kind === 'story-status' && input.quests.some(q => q.id === condition.questId)), 'INVALID_TASK_BLUEPRINT', '任务引用不存在的地点或故事目标。');
        ids.add(task.id); result.push(structuredClone(task));
      }
    }
    requireValue(result.length <= 32, 'INVALID_TASK_BLUEPRINT', '任务蓝图数量超出首版范围。');
    return result;
  }
}
export function createTaskGenerator(): TaskGeneratorRegistry {
  const registry = new TaskGeneratorRegistry();
  registry.register({ id: 'story-objectives', generate: input => input.quests.map(q => ({ id:q.id, title:q.title, source:'story-objectives', condition:{kind:'story-status' as const,questId:q.id}, rewardGold:0 })) });
  registry.register({ id: 'random-task', generate: input => {
    const candidates = [{anchorId:'supply',title:'探访补给地'},{anchorId:'goal',title:'找到目标地点'}].filter(q => input.anchorIds.includes(q.anchorId));
    if (!candidates.length) return [];
    const choice = candidates[seedHash(input.seed + ':random-task') % candidates.length];
    return [{ id:'random-visit',title:choice.title,source:'random-task',condition:{kind:'visit' as const,anchorId:choice.anchorId},rewardGold:2 }];
  }});
  return registry;
}
