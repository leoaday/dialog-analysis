import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

test("fold toggle persists across reload", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  // tool toggle is on by default (folded)
  const toolBox = page.locator('input[data-fold="tool"]');
  await expect(toolBox).toBeChecked();
  // uncheck → tool blocks visible
  await toolBox.uncheck();
  await expect(page.locator(".tool").first()).toBeVisible();
  await expect(page.locator(".tool.collapsed")).toHaveCount(0);
  // reload, expect still unchecked
  await page.reload();
  await expect(page.locator('input[data-fold="tool"]')).not.toBeChecked();
});
