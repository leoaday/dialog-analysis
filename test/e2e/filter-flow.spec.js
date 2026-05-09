import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

test("filter chip three-state cycle persists across reload", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const toolChip = page.locator('.chip[data-kind="tool"]');
  await expect(toolChip).toHaveAttribute("data-value", "folded"); // default
  await toolChip.click();
  await expect(toolChip).toHaveAttribute("data-value", "hidden");
  await toolChip.click();
  await expect(toolChip).toHaveAttribute("data-value", "open");
  await page.reload();
  await expect(page.locator('.chip[data-kind="tool"]')).toHaveAttribute("data-value", "open");
});

test("hidden chip removes msg-row from layout", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const userChip = page.locator('.chip[data-kind="user"]');
  await userChip.click(); // open → folded
  await userChip.click(); // folded → hidden
  await expect(page.locator('.msg-row[data-kind="user"]').first()).toBeHidden();
});

test("compact chip exists (kind split from system)", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await expect(page.locator('.chip[data-kind="compact"]')).toBeVisible();
});

test("dot legend renders 4 items", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await expect(page.locator('.dot-legend .legend-item')).toHaveCount(4);
});

test("tool sub-toggle (Input/Output) toggles details", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // First make tool chip "open" so the inner details participate
  const toolChip = page.locator('.chip[data-kind="tool"]');
  await toolChip.click(); await toolChip.click(); // folded -> hidden -> open

  const inputBtn = page.locator('.sub-toggle[data-target="input"]');
  await expect(inputBtn).toHaveAttribute("data-value", "open");  // default
  await inputBtn.click();
  await expect(inputBtn).toHaveAttribute("data-value", "folded");
});

test("per-card details click expands single card without affecting chip state", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Set user chip to "folded"
  const userChip = page.locator('.chip[data-kind="user"]');
  await userChip.click(); // open -> folded (default open, after one click is folded)
  // First user details should be closed
  const firstUserDetails = page.locator('details.row.user').first();
  await expect(firstUserDetails).not.toHaveAttribute("open", /.*/);
  // Click summary to open it
  await firstUserDetails.locator('summary.meta').click();
  await expect(firstUserDetails).toHaveAttribute("open", /.*/);
  // Chip state unchanged
  await expect(userChip).toHaveAttribute("data-value", "folded");
});
