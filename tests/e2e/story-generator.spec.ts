import { test, expect } from "@playwright/test";
test("故事工坊：死亡联动、主线闭环和移动布局", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=story-generator");
  await expect(
    page.getByRole("heading", { name: "随机故事工坊" }),
  ).toBeVisible();
  await expect(page.locator("[data-option]")).toHaveCount(18);
  await page.locator('[data-option="attack:npc-0"]').click();
  await expect(
    page.getByRole("button", { name: "加载营地故事", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "结算：目标死亡" }).click();
  await expect(page.locator('[data-option="ask:npc-0"]')).toHaveCount(0);
  await expect(page.getByText(/委托人死亡，原委托终止/)).toBeVisible();
  await page.locator('[data-option="notes"]').click();
  await page.locator('[data-option="buy"]').click();
  await page.locator('[data-option="resolve"]').click();
  await expect(page.getByText(/^你完成了目标/)).toBeVisible();
  await expect(page.locator("[data-option]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("故事规则包：加载、使用、导入和卸载保留事实", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=story-generator");
  await page.getByRole("button", { name: "加载营地故事", exact: true }).click();
  await expect(page.locator("[data-option]")).toHaveCount(20);
  await page.locator('[data-option="camp/rest"]').click();
  await expect(page.getByText(/金币10/)).toBeVisible();
  await page.getByRole("button", { name: "卸载营地故事", exact: true }).click();
  await expect(page.locator('[data-option="camp/rest"]')).toHaveCount(0);
  await expect(page.getByText(/金币10/)).toBeVisible();
  const pack = {
    schemaVersion: 1,
    id: "pilgrim",
    version: "1.0",
    name: "旅人援助",
    requires: ["core"],
    actions: [
      {
        id: "pilgrim/donate",
        scope: "world",
        category: "援助",
        text: "捐出1金币帮助旅人",
        cost: 1,
        when: { op: "gte", left: { ref: "gold" }, right: 1 },
        effects: [{ op: "add", path: "gold", value: -1 }],
      },
    ],
    reactions: [],
  };
  await page.locator("[data-import]").setInputFiles({
    name: "pilgrim.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await page.locator('[data-option="pilgrim/donate"]').click();
  await expect(page.getByText(/金币9/)).toBeVisible();
  await page.getByRole("button", { name: "卸载旅人援助", exact: true }).click();
  await expect(page.locator('[data-option="pilgrim/donate"]')).toHaveCount(0);
  await expect(page.getByText(/金币9/)).toBeVisible();
  await page.locator("[data-import]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("status")).toContainText("不支持的规则包版本");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
