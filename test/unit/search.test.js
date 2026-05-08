import { test } from "node:test";
import { strict as assert } from "node:assert";
import { searchFile } from "../../src/parser/search.js";

test("substring case-insensitive match", async () => {
  const r = await searchFile("test/fixtures/basic.jsonl", { q: "FIRST USER", regex: false });
  assert.ok(r.matches.length >= 1);
  const m = r.matches[0];
  assert.equal(m.role, "user");
  assert.ok(m.snippet.toLowerCase().includes("first user"));
  assert.ok(Array.isArray(m.matchRanges));
  assert.equal(m.matchRanges[0].length, 2);
});

test("regex match", async () => {
  const r = await searchFile("test/fixtures/basic.jsonl", { q: "h.{1,5}man", regex: true });
  assert.ok(r.matches.length >= 1);
  assert.ok(r.matches.some((m) => m.snippet.toLowerCase().includes("human")));
});

test("invalid regex throws", async () => {
  await assert.rejects(searchFile("test/fixtures/basic.jsonl", { q: "(", regex: true }), /invalid regex/i);
});

test("respects max-matches cap", async () => {
  const r = await searchFile("test/fixtures/basic.jsonl", { q: "u", regex: false, max: 2 });
  assert.equal(r.matches.length, 2);
  assert.equal(r.truncated, true);
});

test("snippet has ±60 chars context", async () => {
  const r = await searchFile("test/fixtures/basic.jsonl", { q: "first user input", regex: false });
  const m = r.matches[0];
  assert.ok(m.snippet.length <= 60 * 2 + "first user input".length + 4);
});
