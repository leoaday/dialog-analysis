import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

test("list page shows sessions and opens detail", async ({ page }) => {
  const dir = resolve("test/fixtures/multi-session-dir");
  await page.goto(`${cli.url}/?dir=${encodeURIComponent(dir)}`);
  await expect(page.locator('.session-table tbody tr[data-id="s1"]')).toBeVisible();
  await expect(page.locator('.session-table tbody tr[data-id="s2"]')).toBeVisible();
  // expand s2 (which has 1 subagent), subagent-row becomes visible
  await page.locator('tr[data-id="s2"] .expand').click();
  await expect(page.locator('tr.subagent-row[data-parent="s2"]')).toBeVisible();
  // open s1 detail (basic.jsonl content)
  await page.locator('tr[data-id="s1"]').locator("a", { hasText: "查看" }).click();
  await expect(page).toHaveURL(/\/session\.html\?file=/);
  // basic.jsonl: u1 → user row, a1 → assistant text row, a2 → no row (tool), u4 → user row, a3 → assistant text row = 4 .row
  await expect(page.locator("#conversation .row")).toHaveCount(4);
});
