# Detail Page v2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the spec at `docs/superpowers/specs/2026-05-09-detail-page-v2.1-design.md` — fix v2 production issues: filter perf, timeline alignment, per-card folding, dot legend, Skill/Agent specialized renderers, compact kind separation, tool input/output sub-toggles.

**Architecture:** Four implementation blocks (G1 classification, G2 perf+chips rewrite, G3 renderers+folding, G4 timeline restructure). All independent; G1 is conceptual prereq for G2 (KINDS list adds `compact`).

**Tech Stack:** Node 18+, ESM, Playwright e2e. Zero new runtime deps. Pure HTML/CSS/JS frontend (no framework).

**Spec:** [`docs/superpowers/specs/2026-05-09-detail-page-v2.1-design.md`](../specs/2026-05-09-detail-page-v2.1-design.md)

---

## File Structure

```
src/parser/events.js                              MODIFY (add compact + last-prompt routing)
test/fixtures/basic.jsonl                         MODIFY (12 → 14 lines)
test/unit/events.test.js                          MODIFY (add compact / last-prompt cases)
test/unit/jsonl-stream.test.js                    MODIFY (count 12 → 14)
test/unit/metadata.test.js                        MODIFY (token sums if needed)
test/integration/api.test.js                      MODIFY (events length 12 → 14)

src/public/js/filter-chips.js                     REWRITE (CSS-attr-driven, no loop, add compact kind)
src/public/styles.css                             MODIFY (subgrid layout, dot-legend, sub-toggle, generated chip rules)
src/public/session.html                           MODIFY (toolbar adds dot-legend + sub-toggle row)

src/public/js/renderers/user.js                   MODIFY (wrap in <details>)
src/public/js/renderers/assistant.js              MODIFY (wrap in <details>)
src/public/js/renderers/tool-skill.js             CREATE
src/public/js/renderers/tool-agent.js             CREATE
src/public/js/session.js                          MODIFY (dispatcher adds Skill+Agent, msg-row wrap, remove quickClassify, remove timeline call)
src/public/js/timeline.js                         DELETE (replaced by inline ts in msg-row)
src/public/js/sub-toggles.js                      CREATE (tool input/output global sub-controls)

test/e2e/filter-flow.spec.js                      EXTEND (sub-toggle + per-card click + perf basic)
docs/debugging.md                                 UPDATE (compact kind, sub-toggle, perf model, timeline-as-msg-row)
```

**Branch:** `feat/detail-v2.1` (already created from master).

---

## Phase G1 — Classification

### Task 1: events.js add compact + last-prompt routing

**Files:**
- Modify: `src/parser/events.js`
- Modify: `test/unit/events.test.js`

- [ ] **Step 1.1: Append failing tests to `test/unit/events.test.js`**

Append after the existing tests:

```javascript
test("classifyEvent: compact_boundary -> compact", () =>
  assert.equal(classifyEvent({ type: "system", subtype: "compact_boundary", compactMetadata: { preTokens: 1000, trigger: "auto" } }), "compact"));
test("classifyEvent: isCompactSummary user -> compact", () =>
  assert.equal(classifyEvent({ type: "user", isCompactSummary: true, message: { role: "user", content: "summary" } }), "compact"));
test("classifyEvent: last-prompt -> system", () =>
  assert.equal(classifyEvent({ type: "last-prompt", lastPrompt: "anything", sessionId: "x" }), "system"));
```

- [ ] **Step 1.2: Run, expect FAIL**

Run: `npm run test:unit -- 'test/unit/events.test.js'`
Expected: 3 new tests fail (compact returns "system" today; last-prompt returns "unknown").

- [ ] **Step 1.3: Update `classifyEvent` in `src/parser/events.js`**

Find the system branch:
```javascript
  if (ev.type === "system") return "system";
  if (ev.type === "queue-operation") return "system";
```

Replace with:
```javascript
  if (ev.type === "system") {
    if (ev.subtype === "compact_boundary") return "compact";
    return "system";
  }
  if (ev.type === "queue-operation") return "system";
  if (ev.type === "last-prompt") return "system";
```

Find the user branch line:
```javascript
    if (ev.isCompactSummary) return "system";
```

Replace with:
```javascript
    if (ev.isCompactSummary) return "compact";
```

- [ ] **Step 1.4: Run, expect PASS**

Run: `npm run test:unit`
Expected: all events tests pass; previous "classifyEvent: compact_summary" test (which asserts "system") will now FAIL — update its assertion.

In `test/unit/events.test.js` find:
```javascript
test("classifyEvent: compact_summary", () => assert.equal(classifyEvent(compactSummary), "system"));
```

Change `"system"` to `"compact"`:
```javascript
test("classifyEvent: compact_summary", () => assert.equal(classifyEvent(compactSummary), "compact"));
```

Similarly find:
```javascript
test("classifyEvent: compact_boundary", () => assert.equal(classifyEvent({ type: "system", subtype: "compact_boundary" }), "system"));
```

Change to `"compact"`:
```javascript
test("classifyEvent: compact_boundary", () => assert.equal(classifyEvent({ type: "system", subtype: "compact_boundary" }), "compact"));
```

Re-run `npm run test:unit` — all green.

- [ ] **Step 1.5: Commit**

```bash
git add src/parser/events.js test/unit/events.test.js
git commit -m "feat: split compact kind from system; route last-prompt to system"
```

---

### Task 2: extend basic.jsonl fixture (compact sample) + dependent test counts

**Files:**
- Modify: `test/fixtures/basic.jsonl`
- Modify: `test/unit/jsonl-stream.test.js`
- Modify: `test/unit/metadata.test.js`
- Modify: `test/integration/api.test.js`

- [ ] **Step 2.1: Append 2 lines to `test/fixtures/basic.jsonl`**

Open the file (currently 12 lines after v2 work) and append:

```
{"type":"system","subtype":"compact_boundary","compactMetadata":{"preTokens":50000,"trigger":"auto"},"timestamp":"2026-04-29T10:01:03.000Z","uuid":"sys2"}
{"type":"last-prompt","lastPrompt":"快照测试","sessionId":"basic-test","timestamp":"2026-04-29T10:01:04.000Z"}
```

Now 14 lines.

(Note: the existing fixture line 6 already has a `compact_boundary` event; this new line 13 gives the compact kind a second sample. Line 14 is a `last-prompt` to verify it routes to system.)

- [ ] **Step 2.2: Update test count assertions**

In `test/unit/jsonl-stream.test.js`, find the "yields parsed objects from basic.jsonl" test:
```javascript
assert.equal(out.length, 12);
```
Change to:
```javascript
assert.equal(out.length, 14);
```

The "counts malformed lines" test asserts on `malformed.jsonl` which has its own static fixture (not derived from basic.jsonl). Check it — if `out.length === 9` is asserted there, leave unchanged (malformed.jsonl was created from the old 9-line basic; it's a static reference, untouched).

In `test/integration/api.test.js`, find the `/api/session` test that asserts on basic.jsonl:
```javascript
assert.equal(body.events.length, 12);
```
Change to:
```javascript
assert.equal(body.events.length, 14);
```

In `test/unit/metadata.test.js`, the new fixture lines (compact_boundary system + last-prompt) do not contribute to `tokens` (no usage field) or `rounds` (neither is a human turn). So the existing token/rounds assertions stay correct. No change needed; verify by running.

- [ ] **Step 2.3: Run all tests, expect PASS**

Run: `npm test`
Expected: all green.

- [ ] **Step 2.4: Commit**

```bash
git add test/fixtures/basic.jsonl test/unit/jsonl-stream.test.js test/integration/api.test.js
git commit -m "test: extend basic fixture with compact + last-prompt samples"
```

---

## Phase G2 — Perf + filter-chips rewrite

### Task 3: filter-chips.js — CSS-attribute-driven rewrite

**Files:**
- Modify: `src/public/js/filter-chips.js`

- [ ] **Step 3.1: Replace `src/public/js/filter-chips.js` with CSS-driven implementation**

Full file replacement:

```javascript
const KEY = "da:filter:v2";  // localStorage key compatible with v2 (additive only)

const ORDER = ["open", "folded", "hidden"];

const KINDS = [
  "user", "assistant", "thinking", "tool", "tool_edit", "tool_read",
  "tool_todowrite", "subagent", "ask", "tool_rejection", "compact", "system", "unknown",
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
  compact: "folded",
  system: "hidden",
  unknown: "hidden",
};

function attrName(kind) { return kind.replace(/_/g, "-"); }
function nextState(s) { return ORDER[(ORDER.indexOf(s) + 1) % ORDER.length]; }

export function loadFilterState() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...stored };
  } catch { return { ...DEFAULTS }; }
}

export function saveFilterState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function injectFilterStyles() {
  if (document.getElementById("da-filter-styles")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "da-filter-styles";
  styleEl.textContent = KINDS.map((k) =>
    `body[data-show-${attrName(k)}="false"] [data-kind="${k}"] { display: none; }`
  ).join("\n");
  document.head.appendChild(styleEl);
}

function setBodyShow(kind, value) {
  document.body.setAttribute(`data-show-${attrName(kind)}`, value !== "hidden" ? "true" : "false");
}

function batchSetDetails(root, kind, open) {
  // Set every <details> within blocks of this kind, plus <details> blocks that ARE this kind.
  const sel = `[data-kind="${kind}"] details, details[data-kind="${kind}"]`;
  const els = root.querySelectorAll(sel);
  for (const d of els) d.open = open;
}

function renderChip(kind, value) {
  const cls = `chip chip-${value}`;
  const symbol = value === "folded" ? "⊟" : value === "hidden" ? "" : "";
  return `<button class="${cls}" data-kind="${kind}" data-value="${value}" title="${value}">${kind}${symbol ? ` <span class="chip-icon">${symbol}</span>` : ""}</button>`;
}

export function renderFilterRow(state) {
  return KINDS.map((k) => renderChip(k, state[k] || "open")).join("");
}

function updateChipDOM(container, kind, value) {
  const btn = container.querySelector(`.chip[data-kind="${kind}"]`);
  if (!btn) return;
  btn.className = `chip chip-${value}`;
  btn.dataset.value = value;
  btn.title = value;
  // re-render label so the ⊟ icon swap is correct without rebuilding the whole row
  const symbol = value === "folded" ? "⊟" : "";
  btn.innerHTML = `${kind}${symbol ? ` <span class="chip-icon">${symbol}</span>` : ""}`;
}

export function bindChips(root, container) {
  injectFilterStyles();
  const state = loadFilterState();
  container.innerHTML = renderFilterRow(state);
  // Initialize body data-show-* and details state once.
  for (const k of KINDS) {
    setBodyShow(k, state[k] || "open");
    if (state[k] !== "hidden") batchSetDetails(root, k, state[k] === "open");
  }

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip[data-kind]");
    if (!btn) return;
    const kind = btn.dataset.kind;
    const v = nextState(state[kind] || "open");
    state[kind] = v;
    saveFilterState(state);
    updateChipDOM(container, kind, v);
    setBodyShow(kind, v);
    if (v !== "hidden") batchSetDetails(root, kind, v === "open");
  });

  return state;
}

// Back-compat exports — kept for any external import (currently none).
export function applyFilter(_root, _state) { /* no-op: handled per-chip and via CSS */ }
```

Key changes vs v2:
- `KINDS` now includes `compact`
- `DEFAULTS` adds `compact: "folded"`
- `injectFilterStyles()` generates 13 CSS rules once, all via `body[data-show-<attr>="false"]`
- chip click does NOT re-render the whole row (`updateChipDOM` only touches the clicked chip)
- chip click does NOT loop over all KINDS — only the clicked kind's body attr + details batch are touched
- `applyFilter` is a no-op; callers can keep importing it harmlessly (none currently do besides `bindChips` itself)

- [ ] **Step 3.2: Smoke**

Run from project root:
```bash
npm test  # backend tests (unchanged) — should still pass
node bin/cli.js --no-open -p 5199 >/tmp/cli.log 2>&1 &
sleep 1.5
curl -s "http://127.0.0.1:5199/session.html" | grep -c "filter-row"
pkill -f 'bin/cli.js'
```
Expected: backend tests green, curl returns count >= 2.

- [ ] **Step 3.3: Commit**

```bash
git add src/public/js/filter-chips.js
git commit -m "perf: rewrite filter-chips as CSS-attribute-driven (single-kind updates)"
```

---

## Phase G3 — Renderer enhancements + per-card folding

### Task 4: wrap user/assistant cards in <details> for per-card folding

**Files:**
- Modify: `src/public/js/renderers/user.js`
- Modify: `src/public/js/renderers/assistant.js`

- [ ] **Step 4.1: Update `src/public/js/renderers/user.js`**

Replace the file with:

```javascript
import { md } from "../markdown.js";

export function renderUser(ev) {
  const c = ev.message?.content;
  let html = "";
  if (typeof c === "string") html = md(c);
  else if (Array.isArray(c)) {
    html = c.map((p) => p.type === "text" ? md(p.text || "") : "").join("");
  }
  return `<details class="row user" data-kind="user" open><summary class="meta">user</summary><div class="bubble">${html}</div></details>`;
}
```

Change vs v2: outer `<div>` → `<details ... open>`, `<div class="meta">` → `<summary class="meta">`. The element keeps `data-kind="user"` so chip filter and CSS rules still target it.

- [ ] **Step 4.2: Update `src/public/js/renderers/assistant.js`**

Replace with:

```javascript
import { md } from "../markdown.js";

export function renderAssistantText(ev) {
  const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
  const text = arr.filter((p) => p.type === "text").map((p) => p.text || "").join("\n\n");
  if (!text) return "";
  return `<details class="row assistant" data-kind="assistant" open><summary class="meta">assistant</summary><div class="bubble">${md(text)}</div></details>`;
}
```

Same pattern.

- [ ] **Step 4.3: Smoke**

```bash
node bin/cli.js --no-open -p 5199 >/tmp/cli.log 2>&1 &
sleep 1.5
# Confirm user/assistant cards now use <details> in rendered detail page
# (Manual visual check via browser, OR fetch raw API and confirm renderers don't crash)
curl -s "http://127.0.0.1:5199/api/session?file=$(pwd)/test/fixtures/basic.jsonl" > /dev/null && echo "API OK"
pkill -f 'bin/cli.js'
```
Expected: API OK.

Run: `npm test && npx playwright test --config=test/e2e/playwright.config.js`
Expected: e2e `filter-flow.spec.js` "hidden chip removes blocks from DOM display" still passes (it locates `.row.user`, which works regardless of element type). Other tests unchanged.

If e2e `.row.user` selector fails because Playwright filters by tag, check the failing test message and update the selector to `details.row.user` only if necessary. Most likely passes as-is.

- [ ] **Step 4.4: Commit**

```bash
git add src/public/js/renderers/user.js src/public/js/renderers/assistant.js
git commit -m "feat: wrap user/assistant cards in <details> for per-card folding"
```

---

### Task 5: tool-skill.js renderer

**Files:**
- Create: `src/public/js/renderers/tool-skill.js`

- [ ] **Step 5.1: Create**

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

export function renderToolSkill(toolUse, toolResult) {
  const skillName = toolUse.input?.skill || "(unknown)";
  const argsJson = JSON.stringify(toolUse.input || {}, null, 2);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-skill" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🧩 Skill</span>
    <span class="skill-name">${escapeHtml(skillName)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section tool-input"><summary>Args</summary><pre>${escapeHtml(argsJson)}</pre></details>
  <details class="tool-section tool-output"><summary>Result</summary>${resultBody(toolResult)}</details>
</div>`;
}
```

Output `data-kind="tool"` so the existing `tool` chip controls it.

- [ ] **Step 5.2: Commit**

```bash
git add src/public/js/renderers/tool-skill.js
git commit -m "feat: tool-skill renderer with skill name in summary"
```

---

### Task 6: tool-agent.js renderer

**Files:**
- Create: `src/public/js/renderers/tool-agent.js`

- [ ] **Step 6.1: Create**

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

export function renderToolAgent(toolUse, toolResult) {
  const subType = toolUse.input?.subagent_type || "general-purpose";
  const desc = toolUse.input?.description || "(no description)";
  const prompt = toolUse.input?.prompt || "";
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-agent" data-kind="subagent">
  <div class="tool-head">
    <span class="tool-name">🤖 Agent</span>
    <span class="agent-type">${escapeHtml(subType)}</span>
    <span class="agent-desc">"${escapeHtml(desc)}"</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section tool-input"><summary>Prompt</summary><pre>${escapeHtml(prompt)}</pre></details>
  <details class="tool-section tool-output"><summary>Result</summary>${resultBody(toolResult)}</details>
</div>`;
}
```

Output `data-kind="subagent"` so the existing `subagent` chip controls it (and the timeline dot color is purple).

- [ ] **Step 6.2: Commit**

```bash
git add src/public/js/renderers/tool-agent.js
git commit -m "feat: tool-agent renderer (subagent_type + description in summary)"
```

---

### Task 7: dispatcher wiring + dot legend + tool input/output sub-toggle

**Files:**
- Create: `src/public/js/sub-toggles.js`
- Modify: `src/public/js/session.js` (dispatcher routing for Skill, Agent)
- Modify: `src/public/session.html` (dot legend + sub-toggle row)

- [ ] **Step 7.1: Create `src/public/js/sub-toggles.js`**

```javascript
const KEY = "da:sub-toggles:v1";
const DEFAULTS = { input: "open", output: "folded" };  // values: "open" | "folded"

export function loadSubState() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}

export function saveSubState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function applySub(root, target, value) {
  // target: "input" | "output"
  const sel = target === "input" ? ".tool-section.tool-input" : ".tool-section.tool-output";
  const els = root.querySelectorAll(sel);
  for (const d of els) d.open = value === "open";
}

function renderToggle(target, value) {
  const arrow = value === "open" ? "▾" : "▸";
  return `<button class="sub-toggle" data-target="${target}" data-value="${value}">${target === "input" ? "Input" : "Output"} <span class="sub-arrow">${arrow}</span></button>`;
}

export function renderSubRow(state) {
  return `<span class="sub-label">Tool:</span> ${renderToggle("input", state.input)} ${renderToggle("output", state.output)}`;
}

function updateToggleDOM(container, target, value) {
  const btn = container.querySelector(`.sub-toggle[data-target="${target}"]`);
  if (!btn) return;
  btn.dataset.value = value;
  const arrow = value === "open" ? "▾" : "▸";
  btn.innerHTML = `${target === "input" ? "Input" : "Output"} <span class="sub-arrow">${arrow}</span>`;
}

export function bindSubToggles(root, container) {
  const state = loadSubState();
  container.innerHTML = renderSubRow(state);
  applySub(root, "input", state.input);
  applySub(root, "output", state.output);

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".sub-toggle[data-target]");
    if (!btn) return;
    const target = btn.dataset.target;
    state[target] = state[target] === "open" ? "folded" : "open";
    saveSubState(state);
    updateToggleDOM(container, target, state[target]);
    applySub(root, target, state[target]);
  });

  return state;
}
```

- [ ] **Step 7.2: Modify `src/public/session.html`**

Find the existing `<header class="toolbar">…</header><div class="filter-row">…</div>` block and replace with:

```html
<header class="toolbar">
  <a href="/" id="back">← 会话列表</a>
  <h1 id="title" style="margin:0;font-size:14px;font-weight:600;flex:1;"></h1>
  <div class="stats" id="stats"></div>
</header>
<div class="dot-legend">
  <span class="legend-item"><span class="dot dot-user"></span> user</span>
  <span class="legend-item"><span class="dot dot-assistant"></span> assistant</span>
  <span class="legend-item"><span class="dot dot-tool"></span> tool</span>
  <span class="legend-item"><span class="dot dot-subagent"></span> subagent</span>
</div>
<div class="filter-row">
  <span class="filter-label">显示：</span>
  <span id="filter-row"></span>
  <span id="sub-toggle-row" class="sub-toggle-row"></span>
</div>
```

The legend goes BEFORE the filter row. The sub-toggle inhabits the same line as the chips (right side via `margin-left: auto` in CSS later).

- [ ] **Step 7.3: Modify `src/public/js/session.js` — dispatcher + sub-toggles**

Add to imports near the existing renderer imports:

```javascript
import { renderToolSkill } from "./renderers/tool-skill.js";
import { renderToolAgent } from "./renderers/tool-agent.js";
import { bindSubToggles } from "./sub-toggles.js";
```

Find `dispatchToolUse` and modify its routing:

OLD:
```javascript
  if (name === "AskUserQuestion") return renderAsk(toolUse, toolResult);
  if (name === "Agent" || name === "Task") return renderTool(toolUse, toolResult, "subagent");
  return renderTool(toolUse, toolResult, "tool");
```

NEW:
```javascript
  if (name === "AskUserQuestion") return renderAsk(toolUse, toolResult);
  if (name === "Agent" || name === "Task") return renderToolAgent(toolUse, toolResult);
  if (name === "Skill") return renderToolSkill(toolUse, toolResult);
  return renderTool(toolUse, toolResult, "tool");
```

In `main()`, after the line that calls `bindChips($conv, $filterRow);`, add:

```javascript
const $subToggleRow = document.getElementById("sub-toggle-row");
bindSubToggles($conv, $subToggleRow);
```

- [ ] **Step 7.4: Smoke**

```bash
node bin/cli.js --no-open -p 5199 >/tmp/cli.log 2>&1 &
sleep 1.5
curl -s "http://127.0.0.1:5199/session.html" | grep -c "dot-legend"
curl -s "http://127.0.0.1:5199/session.html" | grep -c "sub-toggle-row"
pkill -f 'bin/cli.js'
```
Expected: both counts >= 1.

- [ ] **Step 7.5: Commit**

```bash
git add src/public/js/sub-toggles.js src/public/js/session.js src/public/session.html
git commit -m "feat: dot legend + tool input/output sub-toggle + Skill/Agent dispatcher routes"
```

---

## Phase G4 — Timeline restructure

### Task 8: replace timeline.js + timeline-col with inline .ts in .msg-row

**Files:**
- Modify: `src/public/session.html`
- Modify: `src/public/js/session.js`
- Delete: `src/public/js/timeline.js`

- [ ] **Step 8.1: Modify `src/public/session.html` — replace `<main>` block**

Find:
```html
<main>
  <div id="banner" style="display:none;"></div>
  <div class="convo-layout">
    <div id="timeline" class="timeline-col"></div>
    <div id="conversation" class="msg-col"></div>
  </div>
</main>
```

Replace with:
```html
<main>
  <div id="banner" style="display:none;"></div>
  <div id="conversation" class="convo-grid"></div>
</main>
```

- [ ] **Step 8.2: Update `src/public/js/session.js` — wrap each event in `.msg-row`**

Find the imports block at the top. Remove:
```javascript
import { buildTimeline, renderTimelineColumn } from "./timeline.js";
```

Find the `quickClassify` function (added in v2 Task 15) and remove it entirely.

Find in `main()` the timeline rendering block:
```javascript
// Tag events with their classified kind for timeline coloring (best effort, no server roundtrip)
for (const ev of body.events) ev._kind = quickClassify(ev);
const timeline = buildTimeline(body.events);
const $timeline = document.getElementById("timeline");
$timeline.innerHTML = renderTimelineColumn(timeline);
```

Remove this entire block.

Find the rendering loop in `main()`:
```javascript
const html = body.events.map((ev) => renderEvent(ev, toolResults)).join("");
$conv.innerHTML = html;
```

Replace with:
```javascript
const html = body.events.map((ev, i) => wrapMsgRow(ev, body.events[i - 1], renderEvent(ev, toolResults))).join("");
$conv.innerHTML = html;
```

Add `wrapMsgRow` helper between `dispatchToolUse` and `attachCompactSummaries`:

```javascript
function pad2(n) { return String(n).padStart(2, "0"); }
function fmtTime(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtDelta(ms) {
  if (ms === null || ms === undefined) return "";
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "−" : "+";
  if (abs < 1000) return `${sign}0s`;
  if (abs < 60_000) return `${sign}${Math.floor(abs / 1000)}s`;
  if (abs < 3_600_000) return `${sign}${Math.floor(abs / 60_000)}m`;
  if (abs < 86_400_000) return `${sign}${Math.floor(abs / 3_600_000)}h`;
  return `${sign}${Math.floor(abs / 86_400_000)}d`;
}

function quickKind(ev) {
  // Lightweight kind tagging used for filter + dot color. Fully redundant with classifyEvent
  // but inlined to avoid re-importing the server module.
  if (!ev || typeof ev !== "object") return "unknown";
  if (ev.type === "system") return ev.subtype === "compact_boundary" ? "compact" : "system";
  if (ev.type === "queue-operation" || ev.type === "last-prompt") return "system";
  if (ev.type === "user") {
    if (typeof ev.message?.content === "string" && ev.message.content.startsWith("<task-notification>")) return "subagent";
    if (ev.isCompactSummary) return "compact";
    if (ev.isMeta) return "system";
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    if (arr.length && arr.every((p) => p.type === "tool_result")) return "tool_result";
    return "user";
  }
  if (ev.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const tu = arr.find((p) => p.type === "tool_use");
    if (tu) {
      const n = tu.name || "";
      if (n === "Edit" || n === "MultiEdit" || n === "Write") return "tool_edit";
      if (n === "Read") return "tool_read";
      if (n === "TodoWrite") return "tool_todowrite";
      if (n === "Agent" || n === "Task") return "subagent";
      if (n === "AskUserQuestion") return "ask";
      return "tool";
    }
    if (arr.some((p) => p.type === "thinking") && !arr.some((p) => p.type === "text")) return "thinking";
    if (arr.some((p) => p.type === "text")) return "assistant";
    if (arr.some((p) => p.type === "thinking")) return "thinking";
    return "unknown";
  }
  return "unknown";
}

function wrapMsgRow(ev, prev, innerHtml) {
  if (!innerHtml) return "";
  const kind = quickKind(ev);
  let tsHtml = "";
  let dayHtml = "";
  if (ev?.timestamp) {
    const d = new Date(ev.timestamp);
    const dateKey = fmtDate(d);
    const prevDateKey = prev?.timestamp ? fmtDate(new Date(prev.timestamp)) : "";
    if (dateKey !== prevDateKey) {
      dayHtml = `<div class="day-divider">── ${dateKey} ──</div>`;
    }
    const delta = prev?.timestamp ? fmtDelta(d.getTime() - new Date(prev.timestamp).getTime()) : "+前";
    tsHtml = `<time class="ts-time" title="${d.toISOString()}">${fmtTime(d)}</time><small>${delta}</small>`;
  }
  return `${dayHtml}<div class="msg-row" data-kind="${kind}"><div class="ts">${tsHtml}</div><div class="msg-cell">${innerHtml}</div></div>`;
}
```

Note: `quickKind` is reused in `wrapMsgRow`. It's an inlined parallel of the server's `classifyEvent`. The redundancy is documented; both must move together when adding a new kind. (Future cleanup: extract to a shared module exposed at `/parser/events.js` via static serving — out of scope here.)

- [ ] **Step 8.3: Delete `src/public/js/timeline.js`**

```bash
git rm src/public/js/timeline.js
```

- [ ] **Step 8.4: Smoke**

```bash
node bin/cli.js --no-open -p 5199 >/tmp/cli.log 2>&1 &
sleep 1.5
curl -s "http://127.0.0.1:5199/session.html" | grep -c "convo-grid"
curl -s "http://127.0.0.1:5199/session.html" | grep -c "timeline-col"  # should be 0
pkill -f 'bin/cli.js'
```
Expected: convo-grid count >= 1; timeline-col count == 0.

Manual visual check: open detail page, confirm timestamps are inline on each card's left, and disabled chips hide both timestamp + card together.

- [ ] **Step 8.5: Commit**

```bash
git add src/public/session.html src/public/js/session.js
git commit -m "feat: timeline as inline .msg-row left cell (auto-aligned with cards)"
```

---

### Task 9: styles.css — subgrid msg-row + dot legend + sub-toggle styles

**Files:**
- Modify: `src/public/styles.css`

- [ ] **Step 9.1: Append v2.1 styles**

Append to `src/public/styles.css`:

```css
/* === Detail page v2.1 === */

/* Dot legend in toolbar (4 colors) */
.dot-legend { display: flex; align-items: center; gap: 14px; padding: 6px 16px; background: #fff; border-bottom: 1px solid var(--border); font-size: 11px; color: var(--muted); }
.legend-item { display: inline-flex; align-items: center; gap: 4px; }
.legend-item .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; border: 2px solid currentColor; background: currentColor; }
.legend-item .dot.dot-user { color: #3b82f6; }
.legend-item .dot.dot-assistant { color: #10b981; }
.legend-item .dot.dot-tool { color: #94a3b8; }
.legend-item .dot.dot-subagent { color: #7c3aed; }

/* Sub-toggle (Tool: Input ▾ Output ▸) */
.sub-toggle-row { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; }
.sub-label { color: var(--muted); font-size: 11px; }
.sub-toggle { padding: 2px 8px; border: 1px solid var(--border); border-radius: 4px; background: #fff; font: 11px -apple-system, sans-serif; cursor: pointer; color: var(--text); }
.sub-toggle:hover { border-color: var(--accent); color: var(--accent); }
.sub-arrow { color: #9ca3af; font-size: 10px; }

/* Convo grid (replaces .convo-layout / .timeline-col / .msg-col) */
.convo-grid { display: grid; grid-template-columns: 100px 1fr; gap: 4px 14px; max-width: 1100px; margin: 0 auto; padding: 14px 18px; }
.day-divider { grid-column: 1 / -1; text-align: center; color: #6b7280; font-size: 11px; padding: 10px 0; letter-spacing: .05em; }

/* msg-row participates in the parent grid via display:contents.
   Use @supports for subgrid where available. */
.msg-row { display: contents; }
@supports (grid-template-columns: subgrid) {
  .msg-row { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; }
}

.ts { font: 11px ui-monospace, Menlo, monospace; color: var(--muted); position: sticky; top: 14px; align-self: start; padding-top: 10px; }
.ts .ts-time { display: block; cursor: help; }
.ts small { display: block; font-size: 10px; color: #9ca3af; }
/* Color the timeline cell border-left to act as a dot/line */
.msg-row[data-kind="user"] .ts { border-left: 3px solid #3b82f6; padding-left: 6px; }
.msg-row[data-kind="assistant"] .ts { border-left: 3px solid #10b981; padding-left: 6px; }
.msg-row[data-kind="subagent"] .ts { border-left: 3px solid #7c3aed; padding-left: 6px; }
.msg-row[data-kind="tool"] .ts,
.msg-row[data-kind="tool_edit"] .ts,
.msg-row[data-kind="tool_read"] .ts,
.msg-row[data-kind="tool_todowrite"] .ts,
.msg-row[data-kind="ask"] .ts,
.msg-row[data-kind="tool_rejection"] .ts { border-left: 3px solid #94a3b8; padding-left: 6px; }
.msg-row[data-kind="thinking"] .ts,
.msg-row[data-kind="compact"] .ts,
.msg-row[data-kind="system"] .ts,
.msg-row[data-kind="unknown"] .ts { border-left: 3px solid #cbd5e1; padding-left: 6px; }

.msg-cell { min-width: 0; }  /* allow cards to shrink in narrow viewports */

/* Per-card folding: <details> wrappers for user/assistant */
details.row { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
details.row.user { background: var(--user-bubble); border-color: var(--user-border); }
details.row > summary.meta { cursor: pointer; font-size: 11px; color: var(--muted); list-style: none; }
details.row > summary.meta::-webkit-details-marker { display: none; }
details.row > summary.meta::before { content: "▸ "; font-size: 9px; color: var(--muted); transition: transform .15s; display: inline-block; }
details.row[open] > summary.meta::before { transform: rotate(90deg); }
details.row .bubble { margin-top: 6px; }

/* Skill renderer */
.skill-name { font-family: ui-monospace, Menlo, monospace; color: var(--text); font-size: 12px; }

/* Agent renderer */
.tool-agent { background: #f5f3ff; border-color: #c4b5fd; }
.agent-type { color: #7c3aed; font-weight: 500; font-size: 12px; }
.agent-desc { color: var(--muted); font-style: italic; font-size: 12px; max-width: 50ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Old v2 timeline-col / convo-layout removed; if any rule referenced them, no harm. */

/* Responsive: collapse timeline column at narrow widths */
@media (max-width: 800px) {
  .convo-grid { grid-template-columns: 0 1fr; }
  .ts { display: none; }
}
```

- [ ] **Step 9.2: Smoke**

Run: `npm test && npx playwright test --config=test/e2e/playwright.config.js`

Expected: backend green; e2e — `filter-flow.spec.js` should still pass for the chip cycle test, but the "hidden chip removes blocks from DOM display" test may need adjustment if it asserts on `.row.user` outside the `.msg-row` wrapper (because we now wrap in `.msg-row`). Run and observe; Task 10 fixes any e2e issues.

If e2e fails for selector reasons, Task 10's e2e extension will replace the assertions with `.msg-row[data-kind="user"]` patterns. For now, accept the e2e failure if it's only about that one assertion.

- [ ] **Step 9.3: Commit**

```bash
git add src/public/styles.css
git commit -m "feat: v2.1 styles (subgrid msg-row, dot legend, sub-toggle, per-card details)"
```

---

## Phase G5 — Tests + docs

### Task 10: e2e extension — sub-toggle, per-card click, chip basics

**Files:**
- Modify: `test/e2e/filter-flow.spec.js`

- [ ] **Step 10.1: Replace `test/e2e/filter-flow.spec.js`**

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
```

- [ ] **Step 10.2: Run e2e, expect PASS**

```bash
pkill -f 'bin/cli.js' 2>/dev/null
npx playwright test --config=test/e2e/playwright.config.js
```
Expected: 4 prior search/list tests + 6 filter-flow tests = 10 e2e tests pass.

If a test fails, troubleshoot:
- compact chip test: may fail if `compact` not in `KINDS` — confirm Task 3's filter-chips.js change went through
- per-card details click test: in v2 user.js outputs `<div>` not `<details>` — confirm Task 4's renderer change went through

- [ ] **Step 10.3: Commit**

```bash
git add test/e2e/filter-flow.spec.js
git commit -m "test: extend filter-flow e2e (compact chip, legend, sub-toggle, per-card click)"
```

---

### Task 11: docs/debugging.md update

**Files:**
- Modify: `docs/debugging.md`

- [ ] **Step 11.1: Update the code map block**

Replace the contents of the fenced block under "## 2. Code map" with:

```
bin/cli.js                  argv → server → browser
src/server.js               http router (all GET, 127.0.0.1 only)
src/routes/                 list-dir, sessions, session, search
src/parser/                 jsonl-stream, events (13 kinds), metadata, extract-text, subagent-index, search, metadata-cache
src/public/                 static assets; session.html and index.html
src/public/js/renderers/    one file per event/tool type
                            user, assistant, thinking, tool, tool-edit, tool-read, tool-todowrite,
                            tool-bash, tool-glob-grep, tool-web, tool-skill, tool-agent,
                            ask, tool-rejection, compact, system-note
src/public/js/filter-chips  three-state CSS-attribute-driven filter, localStorage da:filter:v2
src/public/js/sub-toggles   Tool input/output global sub-toggles, localStorage da:sub-toggles:v1
src/public/js/session       msg-row wrapping with inline .ts (auto-aligned timestamps)
```

(Remove any reference to `src/public/js/timeline.js` — deleted in Task 8.)

- [ ] **Step 11.2: Update "How to add a new event type" — kind list mentions 13**

In section 3, update the line that mentions kind count if any. The numbered procedure stays the same.

- [ ] **Step 11.3: Update or add "Filter chips behavior" section**

If the existing section 7 ("Filter chips behavior") was added in v2 docs, replace its body with:

```markdown
## 7. Filter chips behavior

Each kind chip cycles through three states on click:
- **open**: shown, all `<details>` inside open
- **folded**: shown, all `<details>` inside closed
- **hidden**: removed from layout (`display: none`)

State persists to `localStorage["da:filter:v2"]`. Defaults are in `src/public/js/filter-chips.js` `DEFAULTS` (13 kinds; `system` and `unknown` default to `hidden`).

**Performance model (v2.1):** chip clicks update only the clicked kind. Body data attribute (`data-show-<kind>`) toggles `display:none` via CSS rules generated at page load. `<details open>` state updates use a single batched query limited to that kind. Expected click → render time: < 5ms.

**Tool input/output sub-toggles**: separate global toggles to the right of the chip row control whether tool blocks' Input and Output `<details>` start open or folded. State persists to `localStorage["da:sub-toggles:v1"]`. These are orthogonal to chips: chips control card visibility/fold; sub-toggles control inner detail state.

**Per-card override**: clicking any card's summary toggles just that card. chip changes will subsequently override per-card state (chip state always wins on the next chip click).
```

- [ ] **Step 11.4: Add "Timeline as msg-row" subsection**

Insert after section 7:

```markdown
## 8. Timeline-as-msg-row layout

Each event renders as a `.msg-row` containing two grid cells: a `.ts` (timestamp) on the left and a `.msg-cell` (the content card) on the right. The `.msg-row` participates in the outer `.convo-grid` via CSS subgrid (with `display: contents` fallback). Filter chip hiding affects the entire `.msg-row` via CSS, so timestamps stay aligned to their cards automatically.

The `.ts` element uses `position: sticky; top: 14px;` so for tall cards the timestamp stays visible at the card's top while scrolling.

Events without a `timestamp` field render an empty `.ts` (no time, no border-left dot — just empty space).

Cross-day boundaries insert a `.day-divider` row spanning both columns: `── 2026-05-09 ──`.
```

Renumber the existing "Why these design decisions" section accordingly.

- [ ] **Step 11.5: Final test gate**

```bash
npm test && npx playwright test --config=test/e2e/playwright.config.js
```
Expected: all green.

- [ ] **Step 11.6: Commit**

```bash
git add docs/debugging.md
git commit -m "docs: update debugging guide for v2.1 (compact kind, perf model, msg-row layout)"
```

---

## Self-Review

| Spec section | Plan task |
|---|---|
| §A new compact kind, last-prompt routing | Task 1 |
| §A.2 fixture extension | Task 2 |
| §B.1 single-card folding | Task 4 (user/assistant) — thinking already <details>, tool-* already have inner <details> |
| §B.2 tool input/output sub-toggle | Task 7 (sub-toggles.js + UI) |
| §B.3 chip state semantics | Task 3 (filter-chips rewrite) |
| §C.1 dot legend | Task 7 (HTML) + Task 9 (CSS) |
| §C.2 Skill renderer | Task 5 + dispatcher in Task 7 |
| §C.3 Agent renderer | Task 6 + dispatcher in Task 7 |
| §D.1 timeline-as-msg-row | Task 8 + Task 9 (CSS) |
| §D.2 timeline conditional rendering | Task 8 (wrapMsgRow handles missing timestamp + sticky) |
| §D.3 perf rewrite | Task 3 |
| §D.4 quickClassify removal | Task 8 (replaced by inlined `quickKind`; classify duplication acknowledged in code comment) |
| §E error handling | Tasks 5/6 (renderer fallbacks), Task 8 (timestamp gaps) |
| §F testing | Tasks 1, 10 |
| §G block decomposition | Tasks map: G1=1-2, G2=3, G3=4-7, G4=8-9, G5=10-11 |

No placeholders. No "similar to" references. Each task ends with a commit.

Note about §D.4: the spec said "remove quickClassify entirely; data-kind on .msg-row drives both filter and dot color." The plan keeps a renamed `quickKind` helper inlined in session.js because the wrapMsgRow needs to compute the kind for `data-kind="..."` attribute. This is functionally equivalent — there's no second classifier on the page; `quickKind` is the only client-side classifier and it stamps `data-kind` once. The CSS uses `data-kind` selectors for dot colors per spec.

---

**Plan complete.**
