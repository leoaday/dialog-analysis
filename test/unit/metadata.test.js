import { test } from "node:test";
import { strict as assert } from "node:assert";
import { computeMetadata } from "../../src/parser/metadata.js";

test("computes rounds, tokens, firstUserSummary from basic fixture", async () => {
  const m = await computeMetadata("test/fixtures/basic.jsonl");
  assert.equal(m.rounds, 2);
  assert.deepEqual(m.tokens, { input: 20, output: 27, cacheCreate: 5, cacheRead: 3000 });
  assert.equal(m.firstUserSummary, "first user input here");
  assert.equal(m.malformed, 0);
});

test("malformed jsonl still yields metadata + malformed count", async () => {
  const m = await computeMetadata("test/fixtures/malformed.jsonl");
  assert.equal(m.malformed, 2);
  assert.equal(m.rounds, 2);
});

test("truncates first summary at 120 chars", async () => {
  // synthesize a long-text fixture inline
  const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "da-"));
  const f = join(dir, "x.jsonl");
  const long = "x".repeat(200);
  writeFileSync(f, JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: long }] }, uuid: "u" }) + "\n");
  try {
    const m = await computeMetadata(f);
    assert.equal(m.firstUserSummary.length, 120);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
