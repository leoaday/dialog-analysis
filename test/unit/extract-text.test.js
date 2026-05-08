import { test } from "node:test";
import { strict as assert } from "node:assert";
import { extractText } from "../../src/parser/extract-text.js";

test("user text", () => {
  const ev = { type: "user", message: { role: "user", content: [{ type: "text", text: "hello world" }] } };
  assert.ok(extractText(ev).includes("hello world"));
});

test("assistant thinking", () => {
  const ev = { type: "assistant", message: { content: [{ type: "thinking", thinking: "ponder" }] } };
  assert.ok(extractText(ev).includes("ponder"));
});

test("assistant tool_use serializes input json", () => {
  const ev = { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls -la" } }] } };
  const t = extractText(ev);
  assert.ok(t.includes("Bash"));
  assert.ok(t.includes("ls -la"));
});

test("user tool_result string content", () => {
  const ev = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: "stdout text" }] } };
  assert.ok(extractText(ev).includes("stdout text"));
});

test("user tool_result array content", () => {
  const ev = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: [{ type: "text", text: "arr text" }] }] } };
  assert.ok(extractText(ev).includes("arr text"));
});

test("isCompactSummary string content", () => {
  const ev = { type: "user", isCompactSummary: true, message: { content: "compact summary body" } };
  assert.ok(extractText(ev).includes("compact summary body"));
});

test("ignores usage and uuid", () => {
  const ev = { type: "assistant", uuid: "should-not-match", message: { content: [], usage: { input_tokens: 999 } } };
  const t = extractText(ev);
  assert.ok(!t.includes("999"));
  assert.ok(!t.includes("should-not-match"));
});

test("task-notification user content is extracted", () => {
  const ev = { type: "user", message: { role: "user", content: "<task-notification>\n<task-id>abc</task-id>\n<summary>done</summary>\n</task-notification>" } };
  const t = extractText(ev);
  assert.ok(t.includes("done"));
  assert.ok(t.includes("task-notification"));
});
