import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

test("search by Enter highlights subagent-only hits", async ({ page }) => {
  const dir = resolve("test/fixtures/multi-session-dir");
  await page.goto(`${cli.url}/?dir=${encodeURIComponent(dir)}`);
  await page.locator("#q").fill("sidechain prompt for y");
  await page.locator("#q").press("Enter");
  await expect(page.locator(".session-table tbody tr.subagent-only").first()).toBeVisible();
  await expect(page.locator(".session-table tbody tr").first()).toContainText("会话本体未命中");
});

test("search button trigger and clear restores", async ({ page }) => {
  const dir = resolve("test/fixtures/multi-session-dir");
  await page.goto(`${cli.url}/?dir=${encodeURIComponent(dir)}`);
  await page.locator("#q").fill("second session start");
  await page.locator("#search").click();
  await expect(page.locator(".session-table tbody tr").first()).toContainText("hits");
  await page.locator("#clear").click();
  await expect(page.locator("#clear")).toBeHidden();
});

test("invalid regex shows error", async ({ page }) => {
  const dir = resolve("test/fixtures/multi-session-dir");
  await page.goto(`${cli.url}/?dir=${encodeURIComponent(dir)}`);
  await page.locator("#q").fill("(");
  await page.locator("#regex").check();
  await page.locator("#search").click();
  await expect(page.locator("#banner")).toContainText("invalid regex");
});
