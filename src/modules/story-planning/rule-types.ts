export type Scalar = string | number | boolean;
export type Value = Scalar | { ref: string };
export type Scope = "world" | "npc" | "quest";
export type Condition =
  | { op: "all" | "any"; args: Condition[] }
  | { op: "not"; arg: Condition }
  | { op: "eq" | "ne" | "gt" | "gte" | "includes"; left: Value; right: Value }
  | { op: "some"; collection: "npcs" | "quests"; where: Condition };
export type Effect =
  | { op: "set" | "add"; path: string; value: Value }
  | { op: "text"; template: string }
  | { op: "format"; path: string; template: string }
  | { op: "when"; condition: Condition; then: Effect[]; otherwise?: Effect[] }
  | { op: "chance"; probability: number; then: Effect[]; otherwise?: Effect[] }
  | {
      op: "each";
      collection: "npcs" | "quests";
      effects: Effect[];
      condition?: Condition;
    };
export interface ActionRule {
  id: string;
  scope: Scope;
  category: string;
  text: string;
  cost: number;
  when: Condition;
  effects: Effect[];
  external?: "combat";
}
export interface ReactionRule {
  id: string;
  scope: Scope;
  priority: number;
  when: Condition;
  effects: Effect[];
}
export interface RulePack {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  requires: string[];
  actions: ActionRule[];
  reactions: ReactionRule[];
}
