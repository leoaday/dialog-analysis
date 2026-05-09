import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

async function freshLoad(page, file) {
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("chip body toggles visible only", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await freshLoad(page, file);
  const userChip = page.locator('.chip[data-kind="user"]');
  await expect(userChip).toHaveClass(/chip-visible/);
  await expect(userChip.locator('.chip-fold')).toBeChecked(); // default expanded
  // Click chip body (label, not checkbox) — toggle visible
  await userChip.locator('.chip-label').click();
  await expect(userChip).toHaveClass(/chip-hidden/);
  await expect(page.locator('.msg-row[data-kind="user"]').first()).toBeHidden();
});

test("checkbox toggles expanded only (does not affect visibility)", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await freshLoad(page, file);
  const toolChip = page.locator('.chip[data-kind="tool"]');
  const cb = toolChip.locator('.chip-fold');
  await expect(toolChip).toHaveClass(/chip-visible/);  // default visible
  await expect(cb).not.toBeChecked();                    // default folded
  await cb.click();
  await expect(cb).toBeChecked();
  // Chip remains visible
  await expect(toolChip).toHaveClass(/chip-visible/);
});

test("v2.1 string state in localStorage migrates to v2.2 object state", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await page.evaluate(() => {
    localStorage.setItem("da:filter:v2", JSON.stringify({ user: "folded", system: "open", thinking: "hidden" }));
  });
  await page.reload();
  // user → visible:true, expanded:false  (was "folded")
  const userChip = page.locator('.chip[data-kind="user"]');
  await expect(userChip).toHaveClass(/chip-visible/);
  await expect(userChip.locator('.chip-fold')).not.toBeChecked();
  // system → visible:true, expanded:true (was "open")
  const sysChip = page.locator('.chip[data-kind="system"]');
  await expect(sysChip).toHaveClass(/chip-visible/);
  await expect(sysChip.locator('.chip-fold')).toBeChecked();
  // thinking → visible:false, expanded:false (was "hidden")
  const thinkingChip = page.locator('.chip[data-kind="thinking"]');
  await expect(thinkingChip).toHaveClass(/chip-hidden/);
  await expect(thinkingChip.locator('.chip-fold')).not.toBeChecked();
});

test("scroll anchor preserves viewport position when hiding upstream messages", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await freshLoad(page, file);
  // basic.jsonl is small (14 events); to test anchor we need scroll. Set viewport to small height.
  await page.setViewportSize({ width: 1280, height: 320 });
  // Scroll to the middle of the conversation
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#conversation .msg-row');
    if (rows.length >= 4) rows[3].scrollIntoView({ block: "start" });
  });
  // Capture the row currently at viewport top
  const beforeIdx = await page.evaluate(() => {
    const rows = document.querySelectorAll('#conversation .msg-row');
    for (const r of rows) {
      if (r.getBoundingClientRect().top >= 0) return r.dataset.idx;
    }
    return null;
  });
  expect(beforeIdx).not.toBeNull();
  const beforeTop = await page.evaluate((idx) =>
    document.querySelector(`#conversation .msg-row[data-idx="${idx}"]`).getBoundingClientRect().top,
    beforeIdx);

  // Hide the assistant kind (assuming a few assistant rows are upstream of anchor)
  await page.locator('.chip[data-kind="assistant"] .chip-label').click();

  // After mutation, the anchor row should still be near the same top position
  const afterTop = await page.evaluate((idx) => {
    const r = document.querySelector(`#conversation .msg-row[data-idx="${idx}"]`);
    return r ? r.getBoundingClientRect().top : null;
  }, beforeIdx);
  if (afterTop !== null) {
    expect(Math.abs(afterTop - beforeTop)).toBeLessThan(5);
  }
});

test("dot legend renders 4 items", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await expect(page.locator('.dot-legend .legend-item')).toHaveCount(4);
});

test("compact chip exists", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  await expect(page.locator('.chip[data-kind="compact"]')).toBeVisible();
});

test("tool sub-toggle (Input/Output) toggles details", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await freshLoad(page, file);
  // Make tool chip expanded
  const toolChip = page.locator('.chip[data-kind="tool"]');
  await toolChip.locator('.chip-fold').click();
  // Sub-toggle test (independent control)
  const inputBtn = page.locator('.sub-toggle[data-target="input"]');
  await expect(inputBtn).toHaveAttribute("data-value", "open");
  await inputBtn.click();
  await expect(inputBtn).toHaveAttribute("data-value", "folded");
});

test("per-card details click expands single card without affecting chip state", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await freshLoad(page, file);
  // Fold user chip via checkbox
  const userChip = page.locator('.chip[data-kind="user"]');
  await userChip.locator('.chip-fold').click();
  // First user details should now be closed
  const firstUserDetails = page.locator('details.row.user').first();
  await expect(firstUserDetails).not.toHaveAttribute("open", /.*/);
  // Click summary to expand single card
  await firstUserDetails.locator('summary.meta').click();
  await expect(firstUserDetails).toHaveAttribute("open", /.*/);
  // Chip checkbox state unchanged
  await expect(userChip.locator('.chip-fold')).not.toBeChecked();
});
