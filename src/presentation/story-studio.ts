import campPack from "../../content/story/camp-rules.json";
import { type StoryStudio } from "../application/story-studio";
import { escapeHtml as e } from "./html";
export function renderStoryStudio(
  root: HTMLElement,
  studio: StoryStudio,
  draw: () => void,
) {
  const { world: w, options, packs, rulesRevision, pending } = studio.query();
  root.innerHTML = `<header class="masthead"><a href="./">hi-story</a><a href="?view=character-generator">人物工坊</a></header><main class="atelier"><h1>随机故事工坊</h1><p>中世纪剑与魔法 · 本地规则生成</p><form><label>种子 <input name="seed" value="${e(w.seed)}" required></label> <label>背景 <input name="background" value="${e(w.background.text)}" required></label> <button>生成新故事</button></form><div class="atelier-layout"><section class="card"><h2>${e(w.goal)}</h2><p>${e(w.location)} · 第${w.time}小时 · 金币${w.gold} · 委托期限${w.deadline}小时</p>${w.quests.map((q) => `<p>${e(q.title)}：${e(q.status)} ${e(q.reason)}</p>`).join("")}<p>${e(w.ending)}</p><h2>故事记录</h2>${w.history.map((h) => `<p>${h.time}时：${e(h.text)}</p>`).join("")}</section><section class="card"><h2>可选行动（${options.length}）</h2>${[
    ...new Set(options.map((o) => o.category)),
  ]
    .map(
      (c) =>
        `<details open><summary>${e(c)}</summary>${options
          .filter((o) => o.category === c)
          .map(
            (o) =>
              `<p><button data-option="${e(o.id)}">${e(o.text)} · ${o.cost}小时</button></p>`,
          )
          .join("")}</details>`,
    )
    .join(
      "",
    )}<h2>人物</h2>${w.npcs.map((n) => `<p>${e(n.name)} · ${e(n.role)} · ${e(n.trait)} · ${n.alive ? "存活" : "死亡"} · 信任${n.trust}</p>`).join("")}<h2>故事扩展</h2><p>${packs.map((p) => e(p.name) + " " + e(p.version) + (p.pinned || p.id === "camp" ? "" : ` <button data-unload="${e(p.id)}" ${pending ? "disabled" : ""}>卸载${e(p.name)}</button>`)).join("、")}</p><button data-pack ${pending ? "disabled" : ""}>${packs.some((p) => p.id === "camp") ? "卸载营地故事" : "加载营地故事"}</button><p><label>导入故事规则包（JSON） <input type="file" accept=".json,application/json" data-import ${pending ? "disabled" : ""}></label></p><p>切换扩展后保留本局已经发生的故事。</p><h2>联动验证</h2><button data-access>切换目标地点通行状态</button><p>地图需求：${e(w.mapRequest.tags.join("、"))}</p>${pending ? '<div><p>战斗模块尚未接入。可用下方按钮模拟其返回结果：</p><button data-combat="death">结算：目标死亡</button><button data-combat="exit">结算：退出战斗</button></div>' : ""}<p role="status" id="story-message"></p></section></div></main>`;
  const update = (action: () => void) => {
    try {
      action();
      draw();
    } catch (error) {
      root.querySelector("#story-message")!.textContent = String(error);
    }
  };
  if (pending) {
    root
      .querySelectorAll<HTMLButtonElement>("button:not([data-combat])")
      .forEach((button) => (button.disabled = true));
    root
      .querySelectorAll<HTMLInputElement>("input")
      .forEach((input) => (input.disabled = true));
  }
  root.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget as HTMLFormElement);
    update(() =>
      studio.restart(String(f.get("seed")), {
        text: String(f.get("background")),
        tags: [],
      }),
    );
  });
  root.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((button) =>
    button.addEventListener("click", () =>
      update(() => {
        studio.act(button.dataset.option!, w.revision, rulesRevision);
      }),
    ),
  );
  root
    .querySelectorAll<HTMLButtonElement>("[data-combat]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        update(() =>
          studio.settleCombat(
            pending!.commandId,
            button.dataset.combat === "death",
          ),
        ),
      ),
    );
  root.querySelector("[data-pack]")!.addEventListener("click", () =>
    update(() => {
      if (packs.some((p) => p.id === "camp")) studio.uninstall("camp");
      else studio.install(campPack);
    }),
  );
  root
    .querySelectorAll<HTMLButtonElement>("[data-unload]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        update(() => studio.uninstall(button.dataset.unload!)),
      ),
    );
  root
    .querySelector<HTMLInputElement>("[data-import]")!
    .addEventListener("change", async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > 256_000) throw Error("规则包文件过大");
        const text = await file.text();
        update(() => studio.install(text));
      } catch (error) {
        root.querySelector("#story-message")!.textContent = String(error);
      }
    });
  root
    .querySelector("[data-access]")!
    .addEventListener("click", () =>
      update(() =>
        studio.change(`access-${w.revision}`, {
          kind: "access",
          accessible: !w.accessible,
        }),
      ),
    );
}
