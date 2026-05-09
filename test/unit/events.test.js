import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isHumanTurn, isTaskNotification, isToolRejection, classifyEvent } from "../../src/parser/events.js";

const userText = { type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } };
const userToolResult = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } };
const userMeta = { type: "user", isMeta: true, message: { role: "user", content: [{ type: "text", text: "m" }] } };
const compactSummary = { type: "user", isCompactSummary: true, message: { role: "user", content: "summary body" } };
const taskNotif = { type: "user", message: { role: "user", content: "<task-notification>\n<task-id>x</task-id>\n</task-notification>" } };

const assistantText = { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } };
const assistantThinking = { type: "assistant", message: { content: [{ type: "thinking", thinking: "x" }] } };
const toolUseBash = { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] } };
const toolUseEdit = { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "Edit", input: {} }] } };
const toolUseRead = { type: "assistant", message: { content: [{ type: "tool_use", id: "t3", name: "Read", input: {} }] } };
const toolUseTodo = { type: "assistant", message: { content: [{ type: "tool_use", id: "t4", name: "TodoWrite", input: {} }] } };
const toolUseAgent = { type: "assistant", message: { content: [{ type: "tool_use", id: "t5", name: "Agent", input: {} }] } };
const toolUseAsk = { type: "assistant", message: { content: [{ type: "tool_use", id: "t6", name: "AskUserQuestion", input: {} }] } };

const rejectionTr = { type: "tool_result", tool_use_id: "t1", content: "User rejected the proposed Edit. They said:\nI prefer manual edits." };

test("isHumanTurn: text -> true", () => assert.equal(isHumanTurn(userText), true));
test("isHumanTurn: tool_result -> false", () => assert.equal(isHumanTurn(userToolResult), false));
test("isHumanTurn: meta -> false", () => assert.equal(isHumanTurn(userMeta), false));
test("isHumanTurn: compactSummary -> false", () => assert.equal(isHumanTurn(compactSummary), false));
test("isHumanTurn: task-notification -> false", () => assert.equal(isHumanTurn(taskNotif), false));
test("isHumanTurn: assistant -> false", () => assert.equal(isHumanTurn({ type: "assistant" }), false));

test("isTaskNotification detects xml prefix", () => assert.equal(isTaskNotification(taskNotif), true));
test("isTaskNotification ignores text user", () => assert.equal(isTaskNotification(userText), false));

test("isToolRejection detects User rejected prefix", () => assert.equal(isToolRejection(rejectionTr), true));
test("isToolRejection ignores normal", () => assert.equal(isToolRejection({ type: "tool_result", content: "stdout" }), false));

test("classifyEvent: user", () => assert.equal(classifyEvent(userText), "user"));
test("classifyEvent: assistant", () => assert.equal(classifyEvent(assistantText), "assistant"));
test("classifyEvent: thinking", () => assert.equal(classifyEvent(assistantThinking), "thinking"));
test("classifyEvent: tool (bash)", () => assert.equal(classifyEvent(toolUseBash), "tool"));
test("classifyEvent: tool_edit", () => assert.equal(classifyEvent(toolUseEdit), "tool_edit"));
test("classifyEvent: tool_read", () => assert.equal(classifyEvent(toolUseRead), "tool_read"));
test("classifyEvent: tool_todowrite", () => assert.equal(classifyEvent(toolUseTodo), "tool_todowrite"));
test("classifyEvent: subagent (Agent)", () => assert.equal(classifyEvent(toolUseAgent), "subagent"));
test("classifyEvent: subagent (task-notification user)", () => assert.equal(classifyEvent(taskNotif), "subagent"));
test("classifyEvent: ask", () => assert.equal(classifyEvent(toolUseAsk), "ask"));
test("classifyEvent: compact_summary", () => assert.equal(classifyEvent(compactSummary), "compact"));
test("classifyEvent: compact_boundary", () => assert.equal(classifyEvent({ type: "system", subtype: "compact_boundary" }), "compact"));
test("classifyEvent: queue-operation", () => assert.equal(classifyEvent({ type: "queue-operation", operation: "enqueue" }), "system"));
test("classifyEvent: stop_hook_summary", () => assert.equal(classifyEvent({ type: "system", subtype: "stop_hook_summary" }), "system"));
test("classifyEvent: unknown", () => assert.equal(classifyEvent({ type: "weird-novel-type" }), "unknown"));
test("classifyEvent: compact_boundary -> compact", () =>
  assert.equal(classifyEvent({ type: "system", subtype: "compact_boundary", compactMetadata: { preTokens: 1000, trigger: "auto" } }), "compact"));
test("classifyEvent: isCompactSummary user -> compact", () =>
  assert.equal(classifyEvent({ type: "user", isCompactSummary: true, message: { role: "user", content: "summary" } }), "compact"));
test("classifyEvent: last-prompt -> system", () =>
  assert.equal(classifyEvent({ type: "last-prompt", lastPrompt: "anything", sessionId: "x" }), "system"));
