# Detail Page v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the spec at `docs/superpowers/specs/2026-05-09-detail-page-v2-design.md` — a detail-page rebuild with new 12-kind classification, tool-specialization renderers, filter chips, and a left-edge timeline column.

**Architecture:** Four implementation blocks (D1 classification, D2 chips + generic tool, D3 specialization renderers, D4 timeline + UI repaint). Each block is independently testable. No new runtime deps; no build step.

**Tech Stack:** Node 18+, ESM, Playwright e2e. Pure HTML/CSS/JS frontend (no framework).

**Spec:** [`docs/superpowers/specs/2026-05-09-detail-page-v2-design.md`](../specs/2026-05-09-detail-page-v2-design.md)

---

## File Structure

```
src/parser/events.js                              MODIFY (rewrite classifyEvent)
src/parser/extract-text.js                        MODIFY (handle task-notification content)
src/public/js/filter-chips.js                     CREATE (replaces fold-toggles.js)
src/public/js/fold-toggles.js                     DELETE (superseded)
src/public/js/timeline.js                         CREATE
src/public/js/renderers/tool.js                   MODIFY (split input/output details)
src/public/js/renderers/tool-edit.js              CREATE (Edit/MultiEdit/Write)
src/public/js/renderers/tool-read.js              CREATE
src/public/js/renderers/tool-todowrite.js         CREATE
src/public/js/renderers/tool-bash.js              CREATE
src/public/js/renderers/tool-glob-grep.js         CREATE (shared list-style)
src/public/js/renderers/tool-web.js               CREATE (WebFetch+WebSearch)
src/public/js/renderers/ask.js                    CREATE
src/public/js/renderers/tool-rejection.js         CREATE
src/public/js/session.js                          MODIFY (renderEvent dispatcher + timeline)
src/public/session.html                           MODIFY (grid layout, double-row toolbar, chips)
src/public/styles.css                             MODIFY (chips + timeline + cards)
test/fixtures/basic.jsonl                         MODIFY (add ask, rejection, task-notification)
test/unit/events.test.js                          MODIFY (12-kind coverage)
test/e2e/fold-flow.spec.js                        RENAME → filter-flow.spec.js + chip 3-state test
docs/debugging.md                                 MODIFY (chips + new event types)
```

**Branch:** `feat/detail-v2` (already created with spec commit `8a86f7c`).

---

## Phase 1 — Classification (D1)

### Task 1: New helpers + rewrite classifyEvent for 12 kinds

**Files:**
- Modify: `src/parser/events.js`
- Modify: `test/unit/events.test.js`

- [ ] **Step 1.1: Replace `test/unit/events.test.js` with 12-kind coverage**

```javascript
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
test("classifyEvent: compact_summary", () => assert.equal(classifyEvent(compactSummary), "system"));
test("classifyEvent: compact_boundary", () => assert.equal(classifyEvent({ type: "system", subtype: "compact_boundary" }), "system"));
test("classifyEvent: queue-operation", () => assert.equal(classifyEvent({ type: "queue-operation", operation: "enqueue" }), "system"));
test("classifyEvent: stop_hook_summary", () => assert.equal(classifyEvent({ type: "system", subtype: "stop_hook_summary" }), "system"));
test("classifyEvent: unknown", () => assert.equal(classifyEvent({ type: "weird-novel-type" }), "unknown"));
```

- [ ] **Step 1.2: Run tests, expect FAIL**

Run: `npm run test:unit -- test/unit/events.test.js`
Expected: most tests fail (helpers/kinds not defined).

- [ ] **Step 1.3: Replace `src/parser/events.js`**

```javascript
const TOOL_EDIT_NAMES = new Set(["Edit", "MultiEdit", "Write"]);
const TOOL_READ_NAMES = new Set(["Read"]);
const TOOL_TODOWRITE_NAMES = new Set(["TodoWrite"]);
const TOOL_AGENT_NAMES = new Set(["Agent", "Task"]);
const TOOL_ASK_NAMES = new Set(["AskUserQuestion"]);

const REJECTION_PREFIXES = [
  "User rejected",
  "The user doesn't want to proceed with this tool use",
  "[Request interrupted by user",
];

function contentArr(ev) {
  const c = ev?.message?.content;
  return Array.isArray(c) ? c : [];
}

function findToolUse(ev) {
  return contentArr(ev).find((p) => p.type === "tool_use");
}

export function isTaskNotification(ev) {
  if (ev?.type !== "user") return false;
  const c = ev.message?.content;
  if (typeof c !== "string") return false;
  return c.startsWith("<task-notification>");
}

export function isToolRejection(toolResult) {
  if (!toolResult) return false;
  const c = toolResult.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    const first = c.find((p) => p?.type === "text");
    text = first?.text || "";
  }
  return REJECTION_PREFIXES.some((p) => text.startsWith(p));
}

export function isHumanTurn(ev) {
  if (ev?.type !== "user") return false;
  if (ev.isMeta || ev.isCompactSummary) return false;
  if (isTaskNotification(ev)) return false;
  const c = ev.message?.content;
  if (typeof c === "string") return true;
  if (!Array.isArray(c) || c.length === 0) return false;
  return c.some((p) => p.type === "text" || p.type === "image");
}

function classifyToolUse(toolUse) {
  const name = toolUse.name || "";
  if (TOOL_EDIT_NAMES.has(name)) return "tool_edit";
  if (TOOL_READ_NAMES.has(name)) return "tool_read";
  if (TOOL_TODOWRITE_NAMES.has(name)) return "tool_todowrite";
  if (TOOL_AGENT_NAMES.has(name)) return "subagent";
  if (TOOL_ASK_NAMES.has(name)) return "ask";
  return "tool";
}

export function classifyEvent(ev) {
  if (!ev || typeof ev !== "object") return "unknown";

  if (ev.type === "system") return "system";
  if (ev.type === "queue-operation") return "system";

  if (ev.type === "user") {
    if (isTaskNotification(ev)) return "subagent";
    if (ev.isCompactSummary) return "system";
    if (ev.isMeta) return "system";
    const arr = contentArr(ev);
    if (arr.length && arr.every((p) => p.type === "tool_result")) return "tool_result";
    if (arr.length && arr.some((p) => p.type === "text" || p.type === "image")) return "user";
    if (typeof ev.message?.content === "string") return "user";
    return "unknown";
  }

  if (ev.type === "assistant") {
    const tu = findToolUse(ev);
    if (tu) return classifyToolUse(tu);
    const arr = contentArr(ev);
    if (arr.some((p) => p.type === "thinking") && !arr.some((p) => p.type === "text")) return "thinking";
    if (arr.some((p) => p.type === "text")) return "assistant";
    if (arr.some((p) => p.type === "thinking")) return "thinking";
    return "unknown";
  }

  return "unknown";
}
```

(Note on assistant logic: an assistant message can carry both `thinking` and `text` parts. We classify it as `assistant` (text wins) and the renderer separately produces a thinking block + an assistant block. A pure-thinking assistant message is rare but possible — we classify those as `thinking`.)

- [ ] **Step 1.4: Run tests, expect PASS**

Run: `npm run test:unit`
Expected: all events tests pass; total prior unit tests stay green.

- [ ] **Step 1.5: Commit**

```bash
git add src/parser/events.js test/unit/events.test.js
git commit -m "feat: rewrite event classification with 12 kinds"
```

---

### Task 2: extract-text covers task-notification + extend basic.jsonl fixture

**Files:**
- Modify: `src/parser/extract-text.js`
- Modify: `test/fixtures/basic.jsonl`
- Modify: `test/unit/extract-text.test.js`

- [ ] **Step 2.1: Add failing test for task-notification text extraction**

Append to `test/unit/extract-text.test.js`:

```javascript
test("task-notification user content is extracted", () => {
  const ev = { type: "user", message: { role: "user", content: "<task-notification>\n<task-id>abc</task-id>\n<summary>done</summary>\n</task-notification>" } };
  const t = extractText(ev);
  assert.ok(t.includes("done"));
  assert.ok(t.includes("task-notification"));
});
```

- [ ] **Step 2.2: Run, expect PASS already**

Run: `npm run test:unit -- test/unit/extract-text.test.js`
Expected: PASS — the existing `pieces()` already returns `[content]` when content is a string. No code change needed for this case. Move on.

- [ ] **Step 2.3: Extend `test/fixtures/basic.jsonl` with new sample events**

Open `test/fixtures/basic.jsonl` and append three lines (do not modify existing 9 lines):

```
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_2","name":"AskUserQuestion","input":{"questions":[{"question":"choose","options":[{"label":"a"},{"label":"b"}]}]}}],"usage":{"input_tokens":1,"output_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}},"timestamp":"2026-04-29T10:01:00.000Z","uuid":"a4"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_3","content":"User rejected the proposed Edit. They said:\nNot needed."}]},"timestamp":"2026-04-29T10:01:01.000Z","uuid":"u5"}
{"type":"user","message":{"role":"user","content":"<task-notification>\n<task-id>abc</task-id>\n<status>completed</status>\n<summary>research done</summary>\n<result>findings text</result>\n</task-notification>"},"timestamp":"2026-04-29T10:01:02.000Z","uuid":"u6"}
```

This grows basic.jsonl from 9 to 12 lines.

- [ ] **Step 2.4: Update affected unit tests for new line count**

Open `test/unit/jsonl-stream.test.js` and find:
```javascript
assert.equal(out.length, 9);
```
Change both occurrences (in "yields parsed objects" and "counts malformed lines") to `12`.

Open `test/unit/metadata.test.js` — assertions on the basic fixture should still hold (rounds=2, the new lines do not add human turns; tokens unchanged because new assistant has 1+1, the existing rejection user is non-human... wait, the `assistant` `tool_use AskUserQuestion` adds usage 1+1+0+0 = `input` += 1, `output` += 1). Adjust the metadata test:

OLD:
```javascript
assert.deepEqual(m.tokens, { input: 20, output: 27, cacheCreate: 5, cacheRead: 3000 });
```

NEW:
```javascript
assert.deepEqual(m.tokens, { input: 21, output: 28, cacheCreate: 5, cacheRead: 3000 });
```

Open `test/unit/search.test.js` and check the "respects max-matches cap" test — it searches for "u" with max=2. The new lines may or may not affect it. Run and adjust if necessary; if it still finds 2 matches in line 1's "first user input" before reaching new lines, it still passes.

Open `test/integration/api.test.js` — `GET /api/session returns events array + ETag` asserts `body.events.length` equals **9**. Change to **12**.

- [ ] **Step 2.5: Run all unit + integration tests, expect PASS**

Run: `npm test`
Expected: all green. If any unrelated test fails because the fixture grew, adjust the assertion's expected count and rerun.

- [ ] **Step 2.6: Commit**

```bash
git add src/parser/extract-text.js test/fixtures/basic.jsonl test/unit/extract-text.test.js test/unit/jsonl-stream.test.js test/unit/metadata.test.js test/integration/api.test.js
git commit -m "test: extend basic fixture with ask/rejection/task-notification samples"
```

---

## Phase 2 — Filter chips + generic tool renderer (D2)

### Task 3: filter-chips.js (replaces fold-toggles.js)

**Files:**
- Create: `src/public/js/filter-chips.js`
- Delete: `src/public/js/fold-toggles.js`
- Modify: `src/public/js/session.js` (swap import)

- [ ] **Step 3.1: Create `src/public/js/filter-chips.js`**

```javascript
const KEY = "da:filter:v2";

// Three-state chip values: "open" (show + expanded), "folded" (show + folded), "hidden"
const ORDER = ["open", "folded", "hidden"];

const KINDS = [
  "user", "assistant", "thinking", "tool", "tool_edit", "tool_read",
  "tool_todowrite", "subagent", "ask", "tool_rejection", "system", "unknown",
];

const DEFAULTS = {
  user: "open",
  assistant: "open",
  thinking: "open",
  tool: "folded",
  tool_edit: "folded",
  tool_read: "folded",
  tool_todowrite: "folded",
  subagent: "folded",
  ask: "open",
  tool_rejection: "open",
  system: "hidden",
  unknown: "hidden",
};

export function loadFilterState() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFilterState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function nextState(s) { return ORDER[(ORDER.indexOf(s) + 1) % ORDER.length]; }

export function applyFilter(root, state) {
  for (const kind of KINDS) {
    const v = state[kind] || "open";
    const targets = root.querySelectorAll(`[data-kind="${kind}"]`);
    for (const el of targets) {
      el.style.display = v === "hidden" ? "none" : "";
      // toggle inner <details> open/closed when not hidden
      if (v !== "hidden") {
        const details = el.querySelectorAll("details");
        for (const d of details) d.open = v === "open";
        if (el.tagName === "DETAILS") el.open = v === "open";
      }
    }
  }
}

function renderChip(kind, value) {
  const cls = `chip chip-${value}`;
  const symbol = value === "folded" ? "⊟" : value === "hidden" ? "" : "";
  return `<button class="${cls}" data-kind="${kind}" data-value="${value}" title="${value}">${kind}${symbol ? ` <span class="chip-icon">${symbol}</span>` : ""}</button>`;
}

export function renderFilterRow(state) {
  return KINDS.map((k) => renderChip(k, state[k] || "open")).join("");
}

export function bindChips(root, container) {
  const state = loadFilterState();
  container.innerHTML = renderFilterRow(state);

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip[data-kind]");
    if (!btn) return;
    const kind = btn.dataset.kind;
    state[kind] = nextState(state[kind] || "open");
    saveFilterState(state);
    container.innerHTML = renderFilterRow(state);
    applyFilter(root, state);
  });

  applyFilter(root, state);
  // per-block <details> override: clicking summary stays per-block
  return state;
}
```

- [ ] **Step 3.2: Delete old `src/public/js/fold-toggles.js`**

```bash
git rm src/public/js/fold-toggles.js
```

- [ ] **Step 3.3: Update `src/public/js/session.js` import**

Find the line:
```javascript
import { bindFoldToggles } from "./fold-toggles.js";
```
Replace with:
```javascript
import { bindChips } from "./filter-chips.js";
```

In `main()`, replace the line `bindFoldToggles($conv);` with:
```javascript
const $filterRow = document.getElementById("filter-row");
bindChips($conv, $filterRow);
```

- [ ] **Step 3.4: Smoke check (skipped — full smoke after Task 4)**

The session.html toolbar still uses old toggle inputs and lacks `#filter-row`. This is intentional — Task 4 updates the HTML. The page will be temporarily broken between Task 3 and Task 4; that's fine because no test commits between them.

- [ ] **Step 3.5: Commit**

```bash
git add src/public/js/filter-chips.js src/public/js/session.js
git commit -m "feat: introduce filter-chips three-state state mgr (replaces fold-toggles)"
```

---

### Task 4: session.html double-row toolbar with chip placeholder

**Files:**
- Modify: `src/public/session.html`

- [ ] **Step 4.1: Replace toolbar block**

In `src/public/session.html`, find the existing `<header class="toolbar">...</header>` block and replace with:

```html
<header class="toolbar">
  <a href="/" id="back">← 会话列表</a>
  <h1 id="title" style="margin:0;font-size:14px;font-weight:600;flex:1;"></h1>
  <div class="stats" id="stats"></div>
</header>
<div class="filter-row">
  <span class="filter-label">显示：</span>
  <span id="filter-row"></span>
</div>
```

(The old `<div class="actions">` with the 5 checkboxes is removed entirely.)

- [ ] **Step 4.2: Smoke**

Run:
```bash
node bin/cli.js --no-open -p 5199 >/tmp/cli.log 2>&1 &
sleep 1.5
curl -s "http://127.0.0.1:5199/session.html?file=$(pwd)/test/fixtures/basic.jsonl" | grep -c "filter-row"
pkill -f 'bin/cli.js'
```
Expected: count >= 2 (one in `<div class="filter-row">`, one in `<span id="filter-row">`).

- [ ] **Step 4.3: Manual visual check**

Run: `node bin/cli.js -p 5199` and open the URL. The page should render with chip buttons in the second toolbar row. Clicking a chip should cycle its state (visual change of button class + visibility of the corresponding messages).

- [ ] **Step 4.4: Commit**

```bash
git add src/public/session.html
git commit -m "ui: detail page double-row toolbar with chip placeholder"
```

---

### Task 5: generic tool renderer split input/output

**Files:**
- Modify: `src/public/js/renderers/tool.js`

- [ ] **Step 5.1: Replace tool.js**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultBody(toolResult) {
  if (!toolResult) return `<div class="no-result">尚无返回</div>`;
  const c = toolResult.content;
  if (typeof c === "string") return `<pre class="result">${escapeHtml(c)}</pre>`;
  if (Array.isArray(c)) {
    return c.map((p) => p.type === "text" ? `<pre class="result">${escapeHtml(p.text || "")}</pre>` : "").join("");
  }
  return `<div class="no-result">无法识别的返回格式</div>`;
}

export function renderTool(toolUse, toolResult, kindOverride) {
  const name = toolUse.name || "tool";
  const kind = kindOverride || "tool";
  const inputJson = JSON.stringify(toolUse.input || {}, null, 2);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool" data-kind="${kind}">
  <div class="tool-head">
    <span class="tool-name">🔧 ${escapeHtml(name)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section tool-input"><summary>Input</summary><pre>${escapeHtml(inputJson)}</pre></details>
  <details class="tool-section tool-output"><summary>Output</summary>${resultBody(toolResult)}</details>
</div>`;
}
```

- [ ] **Step 5.2: Smoke**

Run: `node bin/cli.js -p 5199` and visit a session detail page. The tool blocks should now show name + tool-id with separator (no longer concatenated), and Input/Output as collapsible `<details>` blocks.

- [ ] **Step 5.3: Commit**

```bash
git add src/public/js/renderers/tool.js
git commit -m "feat: tool renderer splits input/output into independent details"
```

---

## Phase 3 — Specialization renderers (D3)

### Task 6: tool-edit.js (Edit / MultiEdit / Write)

**Files:**
- Create: `src/public/js/renderers/tool-edit.js`

- [ ] **Step 6.1: Create tool-edit.js**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }
function lineCount(s) { return s ? s.split("\n").length : 0; }

function diffLines(oldS, newS) {
  // Simple line-level LCS for diff display.
  const a = (oldS || "").split("\n");
  const b = (newS || "").split("\n");
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { ops.unshift({ type: "ctx", text: a[i - 1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { ops.unshift({ type: "add", text: b[j - 1] }); j--; }
    else if (i > 0) { ops.unshift({ type: "del", text: a[i - 1] }); i--; }
  }
  return ops;
}

function renderDiff(ops) {
  return ops.map((op) => {
    const cls = op.type;
    const sym = op.type === "add" ? "+" : op.type === "del" ? "−" : " ";
    return `<div class="diff-line ${cls}"><span class="diff-sym">${sym}</span><span class="diff-text">${escapeHtml(op.text)}</span></div>`;
  }).join("");
}

function renderEdit(toolUse) {
  const { file_path = "", old_string = "", new_string = "" } = toolUse.input || {};
  const ops = diffLines(old_string, new_string);
  const adds = ops.filter((o) => o.type === "add").length;
  const dels = ops.filter((o) => o.type === "del").length;
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-edit" data-kind="tool_edit">
  <div class="tool-head">
    <span class="tool-name">📝 Edit</span>
    <span class="edit-path">${escapeHtml(file_path)}</span>
    <span class="diff-count"><span class="add">+${adds}</span> <span class="del">−${dels}</span></span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Diff</summary><div class="diff-body">${renderDiff(ops)}</div></details>
</div>`;
}

function renderMultiEdit(toolUse) {
  const { file_path = "", edits = [] } = toolUse.input || {};
  const totalAdds = edits.reduce((n, e) => n + lineCount(e.new_string), 0);
  const totalDels = edits.reduce((n, e) => n + lineCount(e.old_string), 0);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  const sections = edits.map((e, i) => {
    const ops = diffLines(e.old_string, e.new_string);
    return `<div class="multi-edit-item"><div class="multi-edit-head">编辑 ${i + 1}</div><div class="diff-body">${renderDiff(ops)}</div></div>`;
  }).join("");
  return `<div class="tool tool-edit" data-kind="tool_edit">
  <div class="tool-head">
    <span class="tool-name">📝 MultiEdit</span>
    <span class="edit-path">${escapeHtml(file_path)} (${edits.length} edits)</span>
    <span class="diff-count"><span class="add">+${totalAdds}</span> <span class="del">−${totalDels}</span></span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Diffs</summary>${sections}</details>
</div>`;
}

function renderWrite(toolUse) {
  const { file_path = "", content = "" } = toolUse.input || {};
  const lines = lineCount(content);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-edit" data-kind="tool_edit">
  <div class="tool-head">
    <span class="tool-name">📄 Write</span>
    <span class="edit-path">${escapeHtml(file_path)}</span>
    <span class="diff-count"><span class="add">+${lines}</span></span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Content</summary><pre class="write-body">${escapeHtml(content)}</pre></details>
</div>`;
}

export function renderToolEdit(toolUse) {
  const name = toolUse.name;
  if (name === "Edit") return renderEdit(toolUse);
  if (name === "MultiEdit") return renderMultiEdit(toolUse);
  if (name === "Write") return renderWrite(toolUse);
  return renderEdit(toolUse); // safe fallback
}
```

- [ ] **Step 6.2: Smoke (no test yet — wired via dispatcher in Task 13)**

The renderer is unused at this point. Skip smoke; will be exercised after Task 13.

- [ ] **Step 6.3: Commit**

```bash
git add src/public/js/renderers/tool-edit.js
git commit -m "feat: tool-edit renderer with line-LCS diff"
```

---

### Task 7: tool-read.js

**Files:**
- Create: `src/public/js/renderers/tool-read.js`

- [ ] **Step 7.1: Create**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

export function renderToolRead(toolUse) {
  const { file_path = "", offset, limit } = toolUse.input || {};
  const range = (offset !== undefined || limit !== undefined) ? `:${offset || 1}-${(offset || 1) + (limit || 0)}` : "";
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-read" data-kind="tool_read">
  <div class="tool-head">
    <span class="tool-name">👁 Read</span>
    <span class="read-path">${escapeHtml(file_path)}${escapeHtml(range)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Args</summary><div class="read-meta">
    <div><span class="meta-key">file_path</span> ${escapeHtml(file_path)}</div>
    ${offset !== undefined ? `<div><span class="meta-key">offset</span> ${offset}</div>` : ""}
    ${limit !== undefined ? `<div><span class="meta-key">limit</span> ${limit}</div>` : ""}
    <div class="read-note">读取的文件内容不在此处展示（通常很长，且常与后续 Edit 的 old_string 重复）。</div>
  </div></details>
</div>`;
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/public/js/renderers/tool-read.js
git commit -m "feat: tool-read renderer"
```

---

### Task 8: tool-todowrite.js

**Files:**
- Create: `src/public/js/renderers/tool-todowrite.js`

- [ ] **Step 8.1: Create**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

const STATUS_BOX = { completed: "☑", in_progress: "▶", pending: "☐" };

export function renderToolTodoWrite(toolUse) {
  const todos = toolUse.input?.todos || [];
  const done = todos.filter((t) => t.status === "completed").length;
  const inProg = todos.filter((t) => t.status === "in_progress").length;
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  const items = todos.map((t) => {
    const box = STATUS_BOX[t.status] || "☐";
    const cls = t.status === "completed" ? "todo-item done" : t.status === "in_progress" ? "todo-item active" : "todo-item";
    const text = t.content || t.activeForm || "";
    return `<div class="${cls}"><span class="box">${box}</span><span class="text">${escapeHtml(text)}</span></div>`;
  }).join("");

  return `<div class="tool tool-todowrite" data-kind="tool_todowrite">
  <div class="tool-head">
    <span class="tool-name">✅ TodoWrite</span>
    <span class="todo-summary">${done}/${todos.length} done${inProg ? ` · ${inProg} in_progress` : ""}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>List</summary><div class="todo-list">${items}</div></details>
</div>`;
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/public/js/renderers/tool-todowrite.js
git commit -m "feat: tool-todowrite renderer"
```

---

### Task 9: tool-bash.js

**Files:**
- Create: `src/public/js/renderers/tool-bash.js`

- [ ] **Step 9.1: Create**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

export function renderToolBash(toolUse, toolResult) {
  const cmd = toolUse.input?.command || "";
  const cmdShort = cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd;
  const out = resultText(toolResult);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  return `<div class="tool tool-bash" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">$</span>
    <span class="bash-cmd">${escapeHtml(cmdShort)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section tool-input"><summary>Command</summary><pre class="bash-cmd-full">${escapeHtml(cmd)}</pre></details>
  <details class="tool-section tool-output"><summary>Output</summary><pre class="bash-out">${escapeHtml(out || "(尚无返回)")}</pre></details>
</div>`;
}
```

- [ ] **Step 9.2: Commit**

```bash
git add src/public/js/renderers/tool-bash.js
git commit -m "feat: tool-bash renderer"
```

---

### Task 10: tool-glob-grep.js

**Files:**
- Create: `src/public/js/renderers/tool-glob-grep.js`

- [ ] **Step 10.1: Create**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

function countLines(s) { return s ? s.split("\n").filter((l) => l.length).length : 0; }

export function renderToolGlobGrep(toolUse, toolResult) {
  const name = toolUse.name; // "Glob" or "Grep"
  const isGlob = name === "Glob";
  const pattern = toolUse.input?.pattern || "";
  const pathArg = toolUse.input?.path || "";
  const out = resultText(toolResult);
  const matchCount = countLines(out);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  const patternDisplay = isGlob ? pattern : `"${pattern}"`;
  const pathDisplay = pathArg ? ` in ${pathArg}` : "";

  return `<div class="tool tool-glob-grep" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🔎 ${escapeHtml(name)}</span>
    <span class="search-summary">${escapeHtml(patternDisplay)}${escapeHtml(pathDisplay)} → ${matchCount} matches</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Matches</summary><pre class="search-out">${escapeHtml(out || "(no matches)")}</pre></details>
</div>`;
}
```

- [ ] **Step 10.2: Commit**

```bash
git add src/public/js/renderers/tool-glob-grep.js
git commit -m "feat: tool-glob-grep shared renderer"
```

---

### Task 11: tool-web.js (WebFetch + WebSearch)

**Files:**
- Create: `src/public/js/renderers/tool-web.js`

- [ ] **Step 11.1: Create**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

function renderFetch(toolUse, toolResult) {
  const url = toolUse.input?.url || "";
  const prompt = toolUse.input?.prompt || "";
  const out = resultText(toolResult);
  const urlShort = url.length > 60 ? url.replace(/^https?:\/\//, "").slice(0, 50) + "…" : url.replace(/^https?:\/\//, "");
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-web" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🌐 WebFetch</span>
    <span class="web-url">${escapeHtml(urlShort)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>URL & Prompt</summary><div class="web-meta"><div><strong>URL</strong> ${escapeHtml(url)}</div><div><strong>Prompt</strong> ${escapeHtml(prompt)}</div></div></details>
  <details class="tool-section"><summary>Result</summary><pre class="web-out">${escapeHtml(out || "(尚无返回)")}</pre></details>
</div>`;
}

function renderSearch(toolUse, toolResult) {
  const query = toolUse.input?.query || "";
  const out = resultText(toolResult);
  const resultCount = (out.match(/^Title: /gm) || out.split(/\n\n+/).filter(Boolean)).length || 0;
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-web" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🔍 WebSearch</span>
    <span class="web-query">"${escapeHtml(query)}"</span>
    <span class="search-summary">→ ${resultCount} results</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Results</summary><pre class="web-out">${escapeHtml(out || "(尚无返回)")}</pre></details>
</div>`;
}

export function renderToolWeb(toolUse, toolResult) {
  if (toolUse.name === "WebFetch") return renderFetch(toolUse, toolResult);
  if (toolUse.name === "WebSearch") return renderSearch(toolUse, toolResult);
  return renderFetch(toolUse, toolResult);
}
```

- [ ] **Step 11.2: Commit**

```bash
git add src/public/js/renderers/tool-web.js
git commit -m "feat: tool-web renderer (fetch + search)"
```

---

### Task 12: ask.js + tool-rejection.js

**Files:**
- Create: `src/public/js/renderers/ask.js`
- Create: `src/public/js/renderers/tool-rejection.js`

- [ ] **Step 12.1: Create ask.js**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

export function renderAsk(toolUse, toolResult) {
  const questions = toolUse.input?.questions || [];
  const answer = resultText(toolResult);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  const qsHtml = questions.map((q, i) => {
    const opts = (q.options || []).map((o) => `<li>${escapeHtml(o.label || "")}${o.description ? ` — <span class="opt-desc">${escapeHtml(o.description)}</span>` : ""}</li>`).join("");
    return `<div class="ask-question">
      <div class="ask-q-text">Q${i + 1}. ${escapeHtml(q.question || "")}</div>
      <ul class="ask-options">${opts}</ul>
    </div>`;
  }).join("");

  return `<div class="tool tool-ask" data-kind="ask">
  <div class="tool-head">
    <span class="tool-name">❓ AskUserQuestion</span>
    <span class="ask-summary">${questions.length} 题</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <div class="ask-body">${qsHtml}</div>
  ${answer ? `<details class="tool-section ask-answer" open><summary>用户答复</summary><pre>${escapeHtml(answer)}</pre></details>` : `<div class="ask-pending">等待回答…</div>`}
</div>`;
}
```

- [ ] **Step 12.2: Create tool-rejection.js**

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

function rejectionText(toolResult) {
  const c = toolResult?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const first = c.find((p) => p?.type === "text");
    return first?.text || "";
  }
  return "";
}

export function renderToolRejection(toolResult) {
  const text = rejectionText(toolResult);
  return `<div class="tool tool-rejection" data-kind="tool_rejection">
  <div class="tool-head">
    <span class="tool-name">⛔ 拒绝</span>
    <span class="rejection-summary">用户拒绝了一个工具调用</span>
  </div>
  <pre class="rejection-body">${escapeHtml(text)}</pre>
</div>`;
}
```

- [ ] **Step 12.3: Commit**

```bash
git add src/public/js/renderers/ask.js src/public/js/renderers/tool-rejection.js
git commit -m "feat: ask + tool-rejection renderers"
```

---

### Task 13: dispatcher in session.js

**Files:**
- Modify: `src/public/js/session.js`

- [ ] **Step 13.1: Add dispatcher imports + inline rejection helper**

At the top of `src/public/js/session.js`, add after existing renderer imports:

```javascript
import { renderTool } from "./renderers/tool.js";
import { renderToolEdit } from "./renderers/tool-edit.js";
import { renderToolRead } from "./renderers/tool-read.js";
import { renderToolTodoWrite } from "./renderers/tool-todowrite.js";
import { renderToolBash } from "./renderers/tool-bash.js";
import { renderToolGlobGrep } from "./renderers/tool-glob-grep.js";
import { renderToolWeb } from "./renderers/tool-web.js";
import { renderAsk } from "./renderers/ask.js";
import { renderToolRejection } from "./renderers/tool-rejection.js";
```

The frontend can't import `src/parser/events.js` (only `src/public/` is served). Inline the rejection check at the top of session.js, after the imports:

```javascript
const REJECTION_PREFIXES = ["User rejected", "The user doesn't want to proceed with this tool use", "[Request interrupted by user"];
function isToolRejection(toolResult) {
  const c = toolResult?.content;
  let t = ""; if (typeof c === "string") t = c;
  else if (Array.isArray(c)) { const f = c.find((p) => p?.type === "text"); t = f?.text || ""; }
  return REJECTION_PREFIXES.some((p) => t.startsWith(p));
}
```

- [ ] **Step 13.2: Modify renderEvent dispatcher**

Find the existing `renderEvent` function. Replace its assistant branch:

OLD:
```javascript
  if (ev?.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const out = [];
    if (arr.some((p) => p.type === "thinking")) out.push(renderThinking(ev));
    if (arr.some((p) => p.type === "text")) out.push(renderAssistantText(ev));
    for (const p of arr) if (p.type === "tool_use") out.push(renderTool(p, toolResults.get(p.id)));
    return out.join("");
  }
```

NEW:
```javascript
  if (ev?.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const out = [];
    if (arr.some((p) => p.type === "thinking")) out.push(renderThinking(ev));
    if (arr.some((p) => p.type === "text")) out.push(renderAssistantText(ev));
    for (const p of arr) if (p.type === "tool_use") out.push(dispatchToolUse(p, toolResults.get(p.id)));
    return out.join("");
  }
```

Add a new helper `dispatchToolUse` between `renderEvent` and `attachCompactSummaries`:

```javascript
function dispatchToolUse(toolUse, toolResult) {
  // Check rejection first — even Edit/Bash with rejected result render as rejection card
  if (isToolRejection(toolResult)) return renderToolRejection(toolResult);
  const name = toolUse.name || "";
  if (name === "Edit" || name === "MultiEdit" || name === "Write") return renderToolEdit(toolUse);
  if (name === "Read") return renderToolRead(toolUse);
  if (name === "TodoWrite") return renderToolTodoWrite(toolUse);
  if (name === "Bash") return renderToolBash(toolUse, toolResult);
  if (name === "Glob" || name === "Grep") return renderToolGlobGrep(toolUse, toolResult);
  if (name === "WebFetch" || name === "WebSearch") return renderToolWeb(toolUse, toolResult);
  if (name === "AskUserQuestion") return renderAsk(toolUse, toolResult);
  if (name === "Agent" || name === "Task") return renderTool(toolUse, toolResult, "subagent");
  return renderTool(toolUse, toolResult, "tool");
}
```

- [ ] **Step 13.3: Handle task-notification user content**

Find the user branch in `renderEvent`:

OLD:
```javascript
  if (ev?.type === "user") {
    if (ev.isCompactSummary) return ""; // attached to compact_boundary already
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    if (arr.length && arr.every((p) => p.type === "tool_result")) return ""; // pair shown via tool_use
    return renderUser(ev);
  }
```

Replace with:
```javascript
  if (ev?.type === "user") {
    if (ev.isCompactSummary) return ""; // attached to compact_boundary already
    if (typeof ev.message?.content === "string" && ev.message.content.startsWith("<task-notification>")) {
      return renderSubagentNotification(ev);
    }
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    if (arr.length && arr.every((p) => p.type === "tool_result")) {
      // tool_result: rejection cards still render, regular tool_results are paired into tool_use renderers above
      const rej = arr.find((p) => isToolRejection(p));
      if (rej) return renderToolRejection(rej);
      return "";
    }
    return renderUser(ev);
  }
```

Add `renderSubagentNotification` helper between `dispatchToolUse` and `attachCompactSummaries`:

```javascript
function renderSubagentNotification(ev) {
  const body = ev.message?.content || "";
  const escape = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/);
  const summary = summaryMatch ? summaryMatch[1].trim() : "subagent 异步通知";
  return `<div class="tool subagent-notification" data-kind="subagent">
  <div class="tool-head">
    <span class="tool-name">🤖 subagent · 异步返回</span>
    <span class="subagent-summary">${escape(summary)}</span>
  </div>
  <details class="tool-section"><summary>原始 task-notification</summary><pre>${escape(body)}</pre></details>
</div>`;
}
```

- [ ] **Step 13.4: Smoke**

Run: `node bin/cli.js -p 5199` and visit a session detail page (use a real session that has Edit/Bash/Read tool calls). The tool blocks should render in their specialized form.

- [ ] **Step 13.5: Commit**

```bash
git add src/public/js/session.js
git commit -m "feat: wire renderer dispatcher for 9 specialized tool types"
```

---

## Phase 4 — Timeline + UI repaint (D4)

### Task 14: timeline.js

**Files:**
- Create: `src/public/js/timeline.js`

- [ ] **Step 14.1: Create**

```javascript
function pad2(n) { return String(n).padStart(2, "0"); }

export function formatTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDelta(ms) {
  if (ms === null || ms === undefined) return "";
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "−" : "+";
  if (abs < 1000) return `${sign}0s`;
  if (abs < 60_000) return `${sign}${Math.floor(abs / 1000)}s`;
  if (abs < 3_600_000) return `${sign}${Math.floor(abs / 60_000)}m`;
  if (abs < 86_400_000) return `${sign}${Math.floor(abs / 3_600_000)}h`;
  return `${sign}${Math.floor(abs / 86_400_000)}d`;
}

export function buildTimeline(events) {
  // Returns array of { kind: "tick" | "day-divider", ... } in event order.
  const out = [];
  let prev = null;
  let prevDateKey = "";
  for (const ev of events) {
    const ts = ev?.timestamp;
    if (!ts) { out.push({ kind: "tick", time: "—", delta: "", iso: "", date: "" }); prev = null; continue; }
    const d = new Date(ts);
    const dateKey = formatDate(d);
    if (dateKey !== prevDateKey) {
      out.push({ kind: "day-divider", date: dateKey });
      prevDateKey = dateKey;
    }
    const delta = prev ? formatDelta(d.getTime() - prev.getTime()) : "+前";
    out.push({
      kind: "tick",
      time: formatTime(d),
      delta,
      iso: d.toISOString(),
      kindOf: ev._kind || "",
    });
    prev = d;
  }
  return out;
}

export function renderTimelineColumn(timeline) {
  return timeline.map((t) => {
    if (t.kind === "day-divider") return `<div class="timeline-day">── ${t.date} ──</div>`;
    if (t.time === "—") return `<div class="timeline-tick"><span class="time">—</span></div>`;
    return `<div class="timeline-tick" data-kind="${t.kindOf}"><time class="time" title="${t.iso}">${t.time}</time><span class="delta">${t.delta}</span><span class="dot"></span></div>`;
  }).join("");
}
```

- [ ] **Step 14.2: Commit**

```bash
git add src/public/js/timeline.js
git commit -m "feat: timeline column module"
```

---

### Task 15: session.html grid layout + session.js timeline integration

**Files:**
- Modify: `src/public/session.html`
- Modify: `src/public/js/session.js`

- [ ] **Step 15.1: session.html — add timeline + msg layout**

Replace the existing `<main>...</main>` block with:

```html
<main>
  <div id="banner" style="display:none;"></div>
  <div class="convo-layout">
    <div id="timeline" class="timeline-col"></div>
    <div id="conversation" class="msg-col"></div>
  </div>
</main>
```

- [ ] **Step 15.2: session.js — render timeline alongside messages**

Add at top of `session.js` after existing imports:

```javascript
import { buildTimeline, renderTimelineColumn } from "./timeline.js";
```

In `main()`, after the line `attachCompactSummaries(body.events);`, add:

```javascript
// Tag events with their classified kind for timeline coloring (best effort, no server roundtrip)
for (const ev of body.events) ev._kind = quickClassify(ev);
const timeline = buildTimeline(body.events);
const $timeline = document.getElementById("timeline");
$timeline.innerHTML = renderTimelineColumn(timeline);
```

Add `quickClassify` helper between `dispatchToolUse` and `attachCompactSummaries`:

```javascript
function quickClassify(ev) {
  if (!ev || typeof ev !== "object") return "unknown";
  if (ev.type === "user") {
    if (typeof ev.message?.content === "string" && ev.message.content.startsWith("<task-notification>")) return "subagent";
    return "user";
  }
  if (ev.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const tu = arr.find((p) => p.type === "tool_use");
    if (!tu) return "assistant";
    const n = tu.name || "";
    if (n === "Edit" || n === "MultiEdit" || n === "Write") return "tool";
    if (n === "Read") return "tool";
    if (n === "Agent" || n === "Task") return "subagent";
    return "tool";
  }
  return "system";
}
```

- [ ] **Step 15.3: Smoke**

Run: `node bin/cli.js -p 5199`. Visit detail page. The page should show timeline column on the left with tick marks for each event.

- [ ] **Step 15.4: Commit**

```bash
git add src/public/session.html src/public/js/session.js
git commit -m "feat: detail page two-column layout with timeline"
```

---

### Task 16: styles.css — chips + timeline + cards (frontend-design pass)

**Files:**
- Modify: `src/public/styles.css`

- [ ] **Step 16.1: Replace existing detail-page styles**

This task is the visual polish. Use `superpowers:frontend-design` skill to drive iteration. Concrete starting CSS to add (or override) follows.

Append to `src/public/styles.css` (these rules supersede earlier `.thinking` / `.tool` / `.compact-block` styles by ID/class specificity):

```css
/* Detail page v2 toolbar + chips */
header.toolbar { padding: 10px 16px; gap: 14px; }
.filter-row { background: #fafbfc; border-bottom: 1px solid var(--border); padding: 8px 16px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 12px; }
.filter-label { color: var(--muted); margin-right: 6px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border: 1px solid var(--border); border-radius: 14px; cursor: pointer; user-select: none; background: #fff; font: 12px/1.2 -apple-system, sans-serif; color: var(--text); }
.chip-open { background: #eef4ff; color: var(--accent); border-color: var(--accent); }
.chip-folded { background: #eef4ff; color: var(--accent); border-color: var(--accent); }
.chip-folded .chip-icon { color: #9ca3af; font-size: 10px; }
.chip-hidden { background: #f3f4f6; color: #9ca3af; text-decoration: line-through; border-color: #e3e6eb; }

/* Convo two-column layout */
.convo-layout { display: grid; grid-template-columns: 100px 1fr; max-width: 1100px; margin: 0 auto; min-height: 60vh; }
.timeline-col { padding: 12px 0 12px 16px; position: relative; font: 11px ui-monospace, Menlo, monospace; color: var(--muted); }
.timeline-col::before { content: ""; position: absolute; left: 78px; top: 0; bottom: 0; width: 1px; background: var(--border); }
.timeline-tick { position: relative; padding: 8px 0; line-height: 1.2; }
.timeline-tick .time { display: block; cursor: help; }
.timeline-tick .delta { display: block; font-size: 10px; color: #9ca3af; }
.timeline-tick .dot { position: absolute; left: 74px; top: 11px; width: 9px; height: 9px; border-radius: 50%; background: #fff; border: 2px solid #cbd5e1; }
.timeline-tick[data-kind="user"] .dot { border-color: #3b82f6; background: #dbeafe; }
.timeline-tick[data-kind="assistant"] .dot { border-color: #10b981; background: #d1fae5; }
.timeline-tick[data-kind="tool"] .dot { border-color: #94a3b8; background: #fff; }
.timeline-tick[data-kind="subagent"] .dot { border-color: #7c3aed; background: #ede9fe; }
.timeline-day { padding: 10px 0; color: #6b7280; font-weight: 600; text-align: center; font-size: 11px; letter-spacing: .05em; }

.msg-col { padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }

/* Tool head: name + path/summary + tool-id at right */
.tool { background: var(--tool-bg); border: 1px solid var(--tool-border); border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.tool-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tool-name { font-weight: 600; color: var(--text); }
.tool-id { margin-left: auto; color: #9ca3af; font-size: 11px; cursor: help; font-family: ui-monospace, Menlo, monospace; }
.tool-section { margin-top: 8px; }
.tool-section > summary { cursor: pointer; font-size: 12px; color: var(--muted); list-style: none; }
.tool-section > summary::before { content: "▶ "; font-size: 9px; color: var(--muted); transition: transform .15s; display: inline-block; }
.tool-section[open] > summary::before { transform: rotate(90deg); }
.tool-section pre { margin: 6px 0 0; padding: 8px 10px; background: #0f172a; color: #e2e8f0; border-radius: 4px; overflow: auto; font-size: 12px; max-height: 360px; }

/* Edit diff */
.edit-path { color: var(--text); font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.diff-count { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
.diff-count .add { color: #0d6e3b; }
.diff-count .del { color: #9d2235; }
.diff-body { font: 12px/1.6 ui-monospace, Menlo, monospace; background: #fafbfc; border-radius: 4px; padding: 6px 0; margin-top: 6px; }
.diff-line { padding: 1px 8px; }
.diff-line.del { background: #ffeef0; color: #9d2235; }
.diff-line.add { background: #e6ffec; color: #0d6e3b; }
.diff-line.ctx { color: #6b7280; }
.diff-sym { display: inline-block; width: 14px; user-select: none; color: #aaa; text-align: center; }

/* TodoWrite */
.todo-summary { color: var(--muted); font-size: 12px; }
.todo-list { padding: 6px 0; }
.todo-item { display: flex; gap: 8px; padding: 2px 0; font-size: 13px; }
.todo-item .box { color: #7c3aed; }
.todo-item.done .box { color: #10b981; }
.todo-item.done .text { color: #9ca3af; text-decoration: line-through; }
.todo-item.active .box { color: #f59e0b; }

/* Bash */
.bash-cmd { font-family: ui-monospace, Menlo, monospace; color: #0d6e3b; font-size: 12.5px; }
.bash-out { background: #0f172a; color: #e2e8f0; }

/* Read */
.read-path, .read-meta { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.read-meta .meta-key { color: #9ca3af; display: inline-block; min-width: 70px; }
.read-note { color: var(--muted); font-style: italic; margin-top: 6px; }

/* Glob/Grep/WebSearch */
.search-summary { color: var(--muted); font-size: 12px; }
.search-out { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }

/* WebFetch */
.web-url, .web-query { font-family: ui-monospace, Menlo, monospace; color: var(--text); font-size: 12.5px; }
.web-meta div { margin: 4px 0; font-size: 12px; }

/* Ask */
.tool-ask { background: #f5f3ff; border-color: #c4b5fd; }
.ask-summary { color: #7c3aed; font-size: 12px; }
.ask-body { margin-top: 8px; }
.ask-question { margin: 8px 0; }
.ask-q-text { font-weight: 500; margin-bottom: 4px; }
.ask-options { margin: 4px 0 0 16px; padding: 0; font-size: 12.5px; color: var(--muted); }
.ask-pending { color: #9ca3af; font-style: italic; margin-top: 6px; font-size: 12px; }

/* Rejection */
.tool-rejection { background: #fef2f2; border-color: #fca5a5; }
.tool-rejection .tool-name { color: #991b1b; }
.rejection-body { background: #fff; color: #7f1d1d; border-left: 3px solid #ef4444; padding: 8px 12px; font-size: 12.5px; white-space: pre-wrap; margin-top: 8px; }

/* Subagent notification */
.subagent-notification { background: #f5f3ff; border-color: #c4b5fd; }
.subagent-notification .tool-name { color: #6d28d9; }
.subagent-summary { color: #6d28d9; font-size: 12px; }

/* Filter visibility — applied via JS by setting display:none; here just smooth out */
[data-kind] { transition: opacity .1s; }
```

- [ ] **Step 16.2: Drive frontend-design pass**

Use the `superpowers:frontend-design` skill (if available; otherwise iterate manually) to refine the colors / spacing / typography against the running detail page. Iterate on a real session JSONL (`test/fixtures/full-real.jsonl`).

If the skill is unavailable, do at least this manual sanity check:
- Open detail page in Chrome and Firefox; check no flex overflow
- Check timeline column doesn't break at narrow widths (< 800px viewport: timeline collapses to top of message area; add a media query)

Add at end of styles.css:

```css
@media (max-width: 800px) {
  .convo-layout { grid-template-columns: 1fr; }
  .timeline-col { display: none; }
}
```

- [ ] **Step 16.3: Run all tests**

Run: `npm test && npx playwright test --config=test/e2e/playwright.config.js`
Expected: 56+ unit/integration + 5 e2e — but the e2e fold-flow.spec.js currently asserts `input[data-fold="tool"]` which no longer exists. Expect 1 e2e failure here. Task 17 fixes it.

- [ ] **Step 16.4: Commit**

```bash
git add src/public/styles.css
git commit -m "feat: detail page v2 styles (chips + timeline + tool cards)"
```

---

### Task 17: rename fold-flow.spec.js → filter-flow.spec.js with chip 3-state test

**Files:**
- Rename + Modify: `test/e2e/fold-flow.spec.js` → `test/e2e/filter-flow.spec.js`

- [ ] **Step 17.1: git mv + rewrite**

```bash
git mv test/e2e/fold-flow.spec.js test/e2e/filter-flow.spec.js
```

Replace contents with:

```javascript
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
```

- [ ] **Step 17.2: Run e2e, expect PASS**

```bash
# kill any leftover server first
pkill -f 'bin/cli.js' 2>/dev/null
npx playwright test --config=test/e2e/playwright.config.js
```

Expected: all 5 e2e pass (3 search-flow + 1 list-flow + 2 filter-flow renamed test+new test = 6 e2e total).

If `chip[data-kind="user"]` first iteration goes to "folded" but the user message stays visible (just folded), the test for `toBeHidden()` would only fail after the second click. The two-click sequence above is correct — verify by trace.

If basic.jsonl produces no `.row.user` (e.g. classification changed), confirm at least one user event exists by checking selector first.

- [ ] **Step 17.3: Commit**

```bash
git add test/e2e/filter-flow.spec.js
git commit -m "test: replace fold-flow with chip three-state filter-flow e2e"
```

---

### Task 18: docs/debugging.md update

**Files:**
- Modify: `docs/debugging.md`

- [ ] **Step 18.1: Update "Code map" section**

In `docs/debugging.md`, find the code-map block. Replace it with:

```
bin/cli.js                  argv → server → browser
src/server.js               http router (all GET, 127.0.0.1 only)
src/routes/                 list-dir, sessions, session, search
src/parser/                 jsonl-stream, events (12 kinds), metadata, extract-text, subagent-index, search, metadata-cache
src/public/                 static assets; session.html and index.html
src/public/js/renderers/    one file per event/tool type
                            user, assistant, thinking, tool, tool-edit, tool-read, tool-todowrite,
                            tool-bash, tool-glob-grep, tool-web, ask, tool-rejection, compact, system-note
src/public/js/filter-chips  three-state filter (open / folded / hidden) per kind, localStorage
src/public/js/timeline      left-column timeline (browser-local TZ, delta to previous event)
```

- [ ] **Step 18.2: Update "How to add a new event type" section**

Replace the section 3 numbered list with:

```
1. Add classification branch in `src/parser/events.js` (`classifyEvent` and helpers if needed).
2. Add field extraction in `src/parser/extract-text.js` if it carries searchable text.
3. Create `src/public/js/renderers/<type>.js` exporting a render function.
4. Wire it into `src/public/js/session.js` `renderEvent()` (or `dispatchToolUse()` if it's a tool).
5. Add the kind to `src/public/js/filter-chips.js` `KINDS` and `DEFAULTS`.
6. Add a fixture line to `test/fixtures/basic.jsonl` and a unit test in `test/unit/events.test.js`.
```

- [ ] **Step 18.3: Add new "Filter chips" subsection**

Insert after section 5 ("Common issues"):

```markdown
## 7. Filter chips behavior

Each kind chip cycles through three states on click:
- **open**: shown, all `<details>` inside open
- **folded**: shown, all `<details>` inside closed
- **hidden**: removed from layout (`display: none`)

State persists to `localStorage["da:filter:v2"]`. Defaults are in `src/public/js/filter-chips.js` `DEFAULTS`. The chip control supersedes the old single-checkbox toggles from v1.

Per-block override: while a chip is in "folded" state, you can click an individual `<details>` summary inside any block to expand just that one (DOM state changes locally; chip global state does not flip).
```

- [ ] **Step 18.4: Final test gate**

```bash
npm test && npx playwright test --config=test/e2e/playwright.config.js
```

Expected: all green (~60 unit/integration + 6 e2e).

- [ ] **Step 18.5: Commit**

```bash
git add docs/debugging.md
git commit -m "docs: update debugging guide for v2 classification + chips"
```

---

## Self-Review

Spec coverage:
| Spec section | Plan task |
|---|---|
| §A.1 task-notification detection | Task 1 |
| §A.1 tool_rejection detection | Task 1 |
| §A.1 12-kind classifier | Task 1 |
| §A.2 subagent event grouping | Tasks 1, 13 |
| §B.1 generic tool input/output split | Task 5 |
| §B.2 9 tool-specialization renderers | Tasks 6–12 |
| §B.3 Edit LCS diff | Task 6 |
| §C.1 grid layout | Tasks 4, 15 |
| §C.2 filter chips three-state | Tasks 3, 4, 16 |
| §C.3 timeline column local time + delta | Tasks 14, 15, 16 |
| §C.4 message card styles | Task 16 |
| §C.5 frontend-design pass | Task 16 |
| §D.4 layout repaint | Task 16 |
| §E error handling | Tasks 1 (timestamp gaps), 12 (ask pending), 13 (subagent notification damage), 6 (Edit fallback) |
| §F testing | Tasks 1 (events), 17 (e2e) |
| §G file list | All tasks |

No placeholders. No "similar to" references. Each task ends with a commit.

---

**Plan complete.**
