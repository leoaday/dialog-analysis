import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isHumanTurn, classifyEvent } from "../../src/parser/events.js";

const humanUser = { type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } };
const toolResultUser = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "x" }] } };
const meta = { type: "user", isMeta: true, message: { role: "user", content: [{ type: "text", text: "meta" }] } };
const compactSummary = { type: "user", isCompactSummary: true, message: { role: "user", content: "summary" } };

test("isHumanTurn: text content -> true", () => assert.equal(isHumanTurn(humanUser), true));
test("isHumanTurn: tool_result -> false", () => assert.equal(isHumanTurn(toolResultUser), false));
test("isHumanTurn: isMeta -> false", () => assert.equal(isHumanTurn(meta), false));
test("isHumanTurn: isCompactSummary -> false", () => assert.equal(isHumanTurn(compactSummary), false));
test("isHumanTurn: assistant -> false", () => assert.equal(isHumanTurn({ type: "assistant" }), false));

test("classifyEvent thinking", () => {
  const ev = { type: "assistant", message: { content: [{ type: "thinking", thinking: "x" }] } };
  assert.equal(classifyEvent(ev), "thinking");
});

test("classifyEvent tool_use", () => {
  const ev = { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: {} }] } };
  assert.equal(classifyEvent(ev), "tool_use");
});

test("classifyEvent tool_result (user role)", () => {
  assert.equal(classifyEvent(toolResultUser), "tool_result");
});

test("classifyEvent compact_boundary", () => {
  assert.equal(classifyEvent({ type: "system", subtype: "compact_boundary" }), "compact_boundary");
});

test("classifyEvent compact_summary user", () => {
  assert.equal(classifyEvent(compactSummary), "compact_summary");
});

test("classifyEvent human user", () => assert.equal(classifyEvent(humanUser), "user_text"));

test("classifyEvent assistant text", () => {
  const ev = { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } };
  assert.equal(classifyEvent(ev), "assistant_text");
});
