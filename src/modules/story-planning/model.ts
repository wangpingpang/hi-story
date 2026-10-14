import type { GeneratedCharacter } from "../characters/index";
import type { Holdings } from "../inventory/index";
import type { QuestStatus, QuestState, PlanProgress } from "../objectives/index";
export type Status = QuestStatus;
export interface NPC {
  profile: GeneratedCharacter;
  id: string;
  name: string;
  role: string;
  trait: string;
  alive: boolean;
  location: string;
  trust: number;
  goal: string;
  event: string;
  response: string;
  knowledge: string[];
}
export type Quest = QuestState;
export interface Option {
  id: string;
  actionId: string;
  npcId?: string;
  questId?: string;
  category: string;
  text: string;
  cost: number;
  dependencies: string[];
  packId: string;
  external?: "combat";
  event?: { id: string; repeat: "once" | "repeatable"; questId?: "main" | "side" };
}
export interface World {
  version: 1;
  seed: string;
  rng: number;
  revision: number;
  time: number;
  deadline: number;
  background: { text: string; tags: string[] };
  goal: string;
  location: string;
  accessible: boolean;
  targetReached: boolean;
  plans: PlanProgress[];
  lastUpdate: UpdateTrace;
  npcs: NPC[];
  conflict: { id: string; need: string; reason: string; obstacle: string };
  inventory: Holdings;
  gold: number;
  clue: boolean;
  resource: boolean;
  notes: boolean;
  quests: Quest[];
  history: { id: string; time: number; text: string }[];
  processed: string[];
  mapRequest: { region: string; tags: string[]; npcIds: string[] };
  ending: string;
}
export type Change =
  | { kind: "npc-death"; npcId: string }
  | { kind: "npc-move"; npcId: string; location: string }
  | { kind: "time"; hours: number }
  | { kind: "access"; accessible: boolean }
  | { kind: "resource"; available: boolean }
  | { kind: "notes"; available: boolean };

export interface UpdateTrace {
  changedFields: string[];
  evaluatedReactions: string[];
  firedReactions: string[];
  replannedPlans: string[];
}

export type { RouteProgress, StageProgress, PlanProgress } from "../objectives/index";
