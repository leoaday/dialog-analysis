import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

test("filter chip three-state cycle persists across reload", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  const toolChip = page.locator('.chip[data-kind="tool"]');
  await expect(toolChip).toHaveAttribute("data-value", "folded"); // default
  await toolChip.click();
  await expect(toolChip).toHaveAttribute("data-value", "hidden");
  await toolChip.click();
  await expect(toolChip).toHaveAttribute("data-value", "open");
  await page.reload();
  await expect(page.locator('.chip[data-kind="tool"]')).toHaveAttribute("data-value", "open");
});

test("hidden chip removes blocks from DOM display", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  const userChip = page.locator('.chip[data-kind="user"]');
  await userChip.click(); // open → folded
  await userChip.click(); // folded → hidden
  await expect(page.locator('.row.user').first()).toBeHidden();
});
