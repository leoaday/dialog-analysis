import { test } from "node:test";
import { strict as assert } from "node:assert";
import { listSubagents } from "../../src/parser/subagent-index.js";

test("scans subagents dir, parses .meta.json, summarizes prompt", async () => {
  const subs = await listSubagents("test/fixtures/with-subagents", "parent");
  assert.equal(subs.length, 1);
  assert.equal(subs[0].agentId, "x");
  assert.equal(subs[0].agentType, "researcher");
  assert.ok(subs[0].file.endsWith("agent-x.jsonl"));
  assert.ok(subs[0].firstPromptSummary.startsWith("You are a researcher"));
});

test("missing subagents dir returns empty array", async () => {
  const subs = await listSubagents("test/fixtures", "no-such-session");
  assert.deepEqual(subs, []);
});
