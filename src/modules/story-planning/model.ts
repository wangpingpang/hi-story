export type Status = "active" | "success" | "failed" | "abandoned" | "expired";
export interface NPC {
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
export interface Quest {
  id: string;
  title: string;
  status: Status;
  reason: string;
  dependencies: string[];
}
export interface Option {
  id: string;
  category: string;
  text: string;
  cost: number;
  dependencies: string[];
  packId: string;
  external?: "combat";
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
  npcs: NPC[];
  conflict: { id: string; need: string; reason: string; obstacle: string };
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
  | { kind: "time"; hours: number }
  | { kind: "access"; accessible: boolean }
  | { kind: "resource"; available: boolean }
  | { kind: "notes"; available: boolean };
