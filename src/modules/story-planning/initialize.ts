import catalog from "../../../content/story/catalog.json";
import { hash, pick, random } from "./random";
import type { World } from "./model";
export function initializeStory(
  seed: string,
  background?: { text: string; tags: string[] },
): World {
  if (!seed.trim()) throw Error("种子不能为空");
  const r = { rng: hash(seed) },
    c = pick(r, catalog.conflicts),
    location = pick(r, catalog.places);
  const names = [...catalog.names];
  const npcs = Array.from({ length: 3 }, (_, i) => {
    const name = pick(r, names);
    names.splice(names.indexOf(name), 1);
    return {
      id: `npc-${i}`,
      name,
      role: pick(r, catalog.roles),
      trait: pick(r, catalog.traits),
      alive: true,
      location,
      trust: 0,
      goal: i === 0 ? `取得${c.need}` : i === 1 ? "保护村民" : "研究古老历史",
      event: c.reason,
      response: pick(r, ["请求交换条件", "请求玩家协助", "暂时保持观望"]),
      knowledge: i === 0 || i === 2 ? ["主线线索"] : [],
    };
  });
  const w: World = {
    version: 1,
    seed,
    rng: r.rng,
    revision: 0,
    time: 0,
    deadline: 12 + Math.floor(random(r) * 12),
    background: background ?? { text: pick(r, catalog.backgrounds), tags: [] },
    goal: c.goal,
    location,
    accessible: true,
    npcs,
    conflict: c,
    gold: 12,
    clue: false,
    resource: false,
    notes: true,
    quests: [
      {
        id: "main",
        title: c.goal,
        status: "active",
        reason: "",
        dependencies: ["clue", "notes", ...npcs.map((n) => `${n.id}.alive`)],
      },
      {
        id: "side",
        title: `为${npcs[0].name}取得${c.need}`,
        status: "active",
        reason: "",
        dependencies: ["npc-0.alive", "resource", "time"],
      },
    ],
    history: [],
    processed: [],
    mapRequest: {
      region: location,
      tags: c.tags,
      npcIds: npcs.map((n) => n.id),
    },
    ending: "",
  };
  w.rng = r.rng;
  w.history.push({
    id: "init",
    time: 0,
    text: `你以${w.background.text}的身份来到${location}。${c.reason}；${npcs[0].name}需要${c.need}，但${c.obstacle}。你的长线目标是${c.goal}。`,
  });
  return w;
}
