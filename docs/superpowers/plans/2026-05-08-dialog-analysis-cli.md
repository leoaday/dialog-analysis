# Dialog-Analysis CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing single-page `dialog-analysis/index.html` into a Node CLI (`claude-dialog-analyzer`) that starts a local HTTP server, opens the browser, and presents a session-list page with full-text search plus an enhanced detail page with per-type fold toggles.

**Architecture:** Thin Node 18+ server with built-in `http`, no framework. Five read-only GET endpoints. Frontend is two static pages (list + detail), zero build step, marked/dompurify/highlight.js via CDN with offline fallback in `public/vendor/`. Metadata cached in 50-entry LRU; jsonl content always re-streamed for search. Renderers ported from existing `index.html` into `public/js/renderers/<event-type>.js`.

**Tech Stack:** Node 18+ (`http`, `fs`, `readline`, `path`, `url`); npm deps: `mri` (argv), `open` (cross-platform launcher); dev: `@playwright/test`; tests via `node --test`.

**Spec:** [`docs/superpowers/specs/2026-05-08-dialog-analysis-cli-design.md`](../specs/2026-05-08-dialog-analysis-cli-design.md)

---

## File Structure

```
dialog-analysis/
├── package.json                                # NEW: bin, deps, scripts
├── bin/cli.js                                  # NEW: entry, argv → server → browser
├── src/
│   ├── server.js                               # NEW: http server + router
│   ├── path-validate.js                        # NEW: absolute + NUL guard
│   ├── lru.js                                  # NEW: tiny LRU(N)
│   ├── browser-open.js                         # NEW: spawn `open`/`start`/`xdg-open`
│   ├── port-probe.js                           # NEW: probe 5173..5183
│   ├── routes/
│   │   ├── list-dir.js                         # NEW
│   │   ├── sessions.js                         # NEW
│   │   ├── session.js                          # NEW (handles /api/session AND /api/subagent)
│   │   └── search.js                           # NEW
│   └── parser/
│       ├── jsonl-stream.js                     # NEW: line-by-line reader
│       ├── events.js                           # NEW: classify (human turn, tool, etc.)
│       ├── metadata.js                         # NEW: rounds/tokens/firstSummary
│       ├── extract-text.js                     # NEW: text fields used by search
│       ├── subagent-index.js                   # NEW: scan <id>/subagents/agent-*
│       └── search.js                           # NEW: streaming match + snippets
├── src/public/
│   ├── index.html                              # REWRITE: list page
│   ├── session.html                            # NEW: detail page (port of existing)
│   ├── styles.css                              # NEW: shared styles (split from old)
│   ├── js/
│   │   ├── api.js                              # NEW: fetch helpers
│   │   ├── markdown.js                         # NEW: marked+DOMPurify init
│   │   ├── list.js                             # NEW: list page bootstrap
│   │   ├── dir-picker.js                       # NEW: modal dir browser
│   │   ├── search-ui.js                        # NEW: search box + result render
│   │   ├── session.js                          # NEW: detail page bootstrap
│   │   ├── fold-toggles.js                     # NEW: per-type toggle group
│   │   ├── highlight-q.js                      # NEW: ?q wrap <mark>
│   │   └── renderers/
│   │       ├── user.js                         # NEW: from old renderUser
│   │       ├── assistant.js                    # NEW: from old renderAssistantText
│   │       ├── thinking.js                     # NEW: from old renderThinking
│   │       ├── tool.js                         # NEW: from old renderTool
│   │       ├── compact.js                      # NEW: from old renderCompact
│   │       └── system-note.js                  # NEW: from old renderSystemNote
│   └── vendor/                                 # NEW: offline CDN fallback
├── test/
│   ├── unit/
│   │   ├── path-validate.test.js               # NEW
│   │   ├── lru.test.js                         # NEW
│   │   ├── port-probe.test.js                  # NEW
│   │   ├── jsonl-stream.test.js                # NEW
│   │   ├── events.test.js                      # NEW
│   │   ├── metadata.test.js                    # NEW
│   │   ├── extract-text.test.js                # NEW
│   │   ├── subagent-index.test.js              # NEW
│   │   └── search.test.js                      # NEW
│   ├── integration/
│   │   └── api.test.js                         # NEW: spawn server, fetch all 5 endpoints
│   ├── e2e/
│   │   ├── playwright.config.js                # NEW
│   │   ├── list-flow.spec.js                   # NEW
│   │   ├── search-flow.spec.js                 # NEW
│   │   ├── fold-flow.spec.js                   # NEW
│   │   └── helpers.js                          # NEW: spawn cli for tests
│   └── fixtures/
│       ├── basic.jsonl                         # NEW: handcrafted small
│       ├── malformed.jsonl                     # NEW: basic + bad lines
│       ├── with-subagents/
│       │   ├── parent.jsonl                    # NEW
│       │   └── subagents/
│       │       ├── agent-x.jsonl               # NEW
│       │       └── agent-x.meta.json           # NEW
│       ├── multi-session-dir/                  # NEW: 2-3 .jsonl for /api/sessions
│       │   ├── s1.jsonl
│       │   ├── s2.jsonl
│       │   └── s2/subagents/agent-y.jsonl
│       └── full-real.jsonl                     # MOVE: from project root
├── docs/
│   ├── superpowers/specs/                      # EXISTS
│   ├── superpowers/plans/                      # EXISTS (this file)
│   └── debugging.md                            # NEW: AI iteration guide
├── README.md                                   # NEW
└── .gitignore                                  # NEW
```

**Conventions:**
- All source files keep ≤200 lines; if a file grows past that, split.
- Each event type lives in two symmetric places: `parser/events.js` (classification) and `public/js/renderers/<type>.js` (rendering).
- ES modules everywhere (`"type": "module"`).
- Tests use `node --test`; e2e uses Playwright.

**Commit-time gate:** After Task 17 (CLI wiring) the integration tests act as the e2e gate. After Task 22 (first frontend e2e) all subsequent commits must run `node --test` AND `npx playwright test`.

---

## Phase 1 — Foundation

### Task 1: Initialize package + skeleton bin

**Files:**
- Create: `package.json`
- Create: `bin/cli.js`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1.1: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
test-results/
playwright-report/
*.log
```

- [ ] **Step 1.2: Write `package.json`**

```json
{
  "name": "claude-dialog-analyzer",
  "version": "0.1.0",
  "description": "Local CLI to analyze Claude Code session JSONL files",
  "bin": { "claude-dialog-analyzer": "bin/cli.js" },
  "type": "module",
  "engines": { "node": ">=18" },
  "files": ["bin", "src", "README.md"],
  "scripts": {
    "test": "node --test test/unit test/integration",
    "test:unit": "node --test test/unit",
    "test:integration": "node --test test/integration",
    "test:e2e": "playwright test",
    "start": "node bin/cli.js"
  },
  "dependencies": { "mri": "^1.2.0", "open": "^10.1.0" },
  "devDependencies": { "@playwright/test": "^1.47.0" }
}
```

- [ ] **Step 1.3: Write `bin/cli.js` with --help/--version stub**

```javascript
#!/usr/bin/env node
import mri from "mri";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const argv = mri(process.argv.slice(2), {
  alias: { d: "dir", p: "port", h: "help", v: "version" },
  boolean: ["help", "version", "no-open"],
  string: ["dir", "port"]
});

if (argv.version) { console.log(pkg.version); process.exit(0); }
if (argv.help) {
  console.log(`Usage: claude-dialog-analyzer [-d <dir>] [-p <port>] [--no-open]
  -d, --dir <abs>    starting directory (default: ~/.claude/projects)
  -p, --port <n>     port (default: probe 5173..5183)
  --no-open          do not launch browser
  -h, --help         show help
  -v, --version      print version`);
  process.exit(0);
}
console.error("server bootstrap not yet implemented");
process.exit(1);
```

- [ ] **Step 1.4: Write minimal `README.md`**

```markdown
# claude-dialog-analyzer

Local CLI for analyzing Claude Code session JSONL files.

## Install
\`\`\`
npm i -g claude-dialog-analyzer
\`\`\`

## Usage
\`\`\`
claude-dialog-analyzer            # default ~/.claude/projects
claude-dialog-analyzer -d /path   # specific directory
claude-dialog-analyzer -p 8080
\`\`\`

See `docs/debugging.md` for development.
```

- [ ] **Step 1.5: Verify CLI runs**

Run: `chmod +x bin/cli.js && node bin/cli.js --help`
Expected: prints usage. `node bin/cli.js --version` → `0.1.0`.

- [ ] **Step 1.6: Install deps**

Run: `npm install`
Expected: `package-lock.json` created, no errors.

- [ ] **Step 1.7: Commit**

```bash
git add package.json package-lock.json bin/cli.js .gitignore README.md
git commit -m "feat: scaffold cli with --help/--version"
```

---

### Task 2: path-validate utility

**Files:**
- Create: `src/path-validate.js`
- Create: `test/unit/path-validate.test.js`

- [ ] **Step 2.1: Write failing tests**

`test/unit/path-validate.test.js`:

```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validateAbsolutePath } from "../../src/path-validate.js";

test("accepts absolute posix path", () => {
  assert.equal(validateAbsolutePath("/Users/x/.claude"), "/Users/x/.claude");
});

test("accepts absolute windows path", () => {
  assert.equal(validateAbsolutePath("C:\\Users\\x"), "C:\\Users\\x");
});

test("rejects relative path", () => {
  assert.throws(() => validateAbsolutePath("./foo"), /absolute/);
});

test("rejects NUL byte", () => {
  assert.throws(() => validateAbsolutePath("/a/b\0c"), /NUL/);
});

test("rejects empty", () => {
  assert.throws(() => validateAbsolutePath(""), /absolute/);
});

test("normalizes doubled separators", () => {
  assert.equal(validateAbsolutePath("/a//b/../c"), "/a/c");
});
```

- [ ] **Step 2.2: Run, expect FAIL**

Run: `npm run test:unit`
Expected: errors "Cannot find module ../../src/path-validate.js".

- [ ] **Step 2.3: Implement**

`src/path-validate.js`:

```javascript
import path from "node:path";

export function validateAbsolutePath(p) {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("path must be an absolute non-empty string");
  }
  if (p.includes("\0")) throw new Error("path contains NUL byte");
  if (!path.isAbsolute(p)) throw new Error("path must be absolute");
  return path.normalize(p);
}
```

- [ ] **Step 2.4: Run, expect PASS**

Run: `npm run test:unit`
Expected: 6 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/path-validate.js test/unit/path-validate.test.js
git commit -m "feat: add path-validate utility"
```

---

### Task 3: LRU cache + port-probe

**Files:**
- Create: `src/lru.js`
- Create: `src/port-probe.js`
- Create: `test/unit/lru.test.js`
- Create: `test/unit/port-probe.test.js`

- [ ] **Step 3.1: Write failing LRU tests**

`test/unit/lru.test.js`:

```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { LRU } from "../../src/lru.js";

test("LRU stores and retrieves", () => {
  const c = new LRU(2);
  c.set("a", 1); c.set("b", 2);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("b"), 2);
});

test("LRU evicts least-recently-used past capacity", () => {
  const c = new LRU(2);
  c.set("a", 1); c.set("b", 2);
  c.get("a"); // a is now MRU
  c.set("c", 3); // evicts b
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});

test("LRU updates value and promotes", () => {
  const c = new LRU(2);
  c.set("a", 1); c.set("b", 2); c.set("a", 99);
  c.set("c", 3); // evicts b, not a
  assert.equal(c.get("a"), 99);
  assert.equal(c.get("b"), undefined);
});
```

- [ ] **Step 3.2: Write failing port-probe tests**

`test/unit/port-probe.test.js`:

```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { probeFreePort } from "../../src/port-probe.js";

function holdPort(port) {
  return new Promise((resolve) => {
    const s = createServer().listen(port, "127.0.0.1", () => resolve(s));
  });
}

test("returns first port in range when free", async () => {
  const p = await probeFreePort([55301, 55302]);
  assert.equal(p, 55301);
});

test("skips occupied port", async () => {
  const held = await holdPort(55310);
  try {
    const p = await probeFreePort([55310, 55311]);
    assert.equal(p, 55311);
  } finally {
    held.close();
  }
});

test("throws if all ports occupied", async () => {
  const a = await holdPort(55320), b = await holdPort(55321);
  try {
    await assert.rejects(probeFreePort([55320, 55321]), /no free/i);
  } finally {
    a.close(); b.close();
  }
});
```

- [ ] **Step 3.3: Run, expect FAIL**

Run: `npm run test:unit`
Expected: cannot find module errors.

- [ ] **Step 3.4: Implement LRU**

`src/lru.js`:

```javascript
export class LRU {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k); this.map.set(k, v);
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.capacity) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
  has(k) { return this.map.has(k); }
}
```

- [ ] **Step 3.5: Implement port-probe**

`src/port-probe.js`:

```javascript
import { createServer } from "node:net";

function isFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

export async function probeFreePort(candidates) {
  for (const p of candidates) if (await isFree(p)) return p;
  throw new Error("no free port in range");
}

export function defaultRange(start = 5173, count = 11) {
  return Array.from({ length: count }, (_, i) => start + i);
}
```

- [ ] **Step 3.6: Run, expect PASS**

Run: `npm run test:unit`
Expected: 9 tests pass total (6 from Task 2 + 3 LRU + 3 port-probe).

- [ ] **Step 3.7: Commit**

```bash
git add src/lru.js src/port-probe.js test/unit/lru.test.js test/unit/port-probe.test.js
git commit -m "feat: add lru cache and port probe"
```

---

### Task 4: browser-open helper

**Files:**
- Create: `src/browser-open.js`

- [ ] **Step 4.1: Implement (uses `open` package, no test — wraps a 3rd-party module)**

`src/browser-open.js`:

```javascript
import open from "open";

export async function openInBrowser(url) {
  try {
    const sub = await open(url);
    return sub;
  } catch (e) {
    process.stderr.write(`failed to open browser: ${e.message}\n`);
    return null;
  }
}
```

- [ ] **Step 4.2: Verify by importing**

Run: `node -e "import('./src/browser-open.js').then(m => console.log(typeof m.openInBrowser))"`
Expected: `function`.

- [ ] **Step 4.3: Commit**

```bash
git add src/browser-open.js
git commit -m "feat: add browser-open helper"
```

---

## Phase 2 — Parser & Search

### Task 5: jsonl streaming reader

**Files:**
- Create: `src/parser/jsonl-stream.js`
- Create: `test/fixtures/basic.jsonl`
- Create: `test/fixtures/malformed.jsonl`
- Create: `test/unit/jsonl-stream.test.js`

- [ ] **Step 5.1: Write `test/fixtures/basic.jsonl`** (10 lines covering each event type)

```
{"type":"queue-operation","operation":"enqueue","timestamp":"2026-04-29T10:00:00.000Z","sessionId":"s1"}
{"type":"user","isMeta":false,"isCompactSummary":false,"message":{"role":"user","content":[{"type":"text","text":"first user input here"}]},"timestamp":"2026-04-29T10:00:01.000Z","uuid":"u1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"let me think"},{"type":"text","text":"here is my answer"}],"usage":{"input_tokens":10,"output_tokens":20,"cache_creation_input_tokens":5,"cache_read_input_tokens":1000}},"timestamp":"2026-04-29T10:00:02.000Z","uuid":"a1","parentUuid":"u1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls"}}],"usage":{"input_tokens":3,"output_tokens":4,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}},"timestamp":"2026-04-29T10:00:03.000Z","uuid":"a2","parentUuid":"a1"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"file1\nfile2"}]},"timestamp":"2026-04-29T10:00:04.000Z","uuid":"u2","parentUuid":"a2"}
{"type":"system","subtype":"compact_boundary","compactMetadata":{"preTokens":50000,"trigger":"auto"},"timestamp":"2026-04-29T10:00:05.000Z","uuid":"sys1"}
{"type":"user","isCompactSummary":true,"message":{"role":"user","content":"## Summary\n- did stuff"},"timestamp":"2026-04-29T10:00:06.000Z","uuid":"u3"}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"second human turn"}]},"timestamp":"2026-04-29T10:00:07.000Z","uuid":"u4"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"final reply"}],"usage":{"input_tokens":7,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":2000}},"timestamp":"2026-04-29T10:00:08.000Z","uuid":"a3"}
```

- [ ] **Step 5.2: Write `test/fixtures/malformed.jsonl`** (basic + bad lines)

Copy `basic.jsonl`, then append two bad lines:
```
{not valid json
}{also not
```

(Done via shell: `cat test/fixtures/basic.jsonl > test/fixtures/malformed.jsonl && printf '%s\n%s\n' '{not valid json' '}{also not' >> test/fixtures/malformed.jsonl`.)

- [ ] **Step 5.3: Write failing tests**

`test/unit/jsonl-stream.test.js`:

```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { streamJsonl } from "../../src/parser/jsonl-stream.js";

test("yields parsed objects from basic.jsonl", async () => {
  const out = [];
  for await (const ev of streamJsonl("test/fixtures/basic.jsonl")) out.push(ev);
  assert.equal(out.length, 9);
  assert.equal(out[0].type, "queue-operation");
  assert.equal(out[1].type, "user");
});

test("counts malformed lines and skips them", async () => {
  const out = [];
  let malformed = 0;
  for await (const ev of streamJsonl("test/fixtures/malformed.jsonl", { onMalformed: () => malformed++ })) {
    out.push(ev);
  }
  assert.equal(out.length, 9);
  assert.equal(malformed, 2);
});

test("supports early break", async () => {
  let n = 0;
  for await (const _ of streamJsonl("test/fixtures/basic.jsonl")) {
    n++;
    if (n === 2) break;
  }
  assert.equal(n, 2);
});
```

- [ ] **Step 5.4: Run, expect FAIL**

Run: `npm run test:unit`
Expected: cannot find module.

- [ ] **Step 5.5: Implement**

`src/parser/jsonl-stream.js`:

```javascript
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function* streamJsonl(filePath, opts = {}) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    try {
      yield JSON.parse(line);
    } catch {
      if (opts.onMalformed) opts.onMalformed(line);
    }
  }
}
```

- [ ] **Step 5.6: Run, expect PASS**

Run: `npm run test:unit`
Expected: 12 tests pass.

- [ ] **Step 5.7: Commit**

```bash
git add src/parser/jsonl-stream.js test/fixtures/basic.jsonl test/fixtures/malformed.jsonl test/unit/jsonl-stream.test.js
git commit -m "feat: add jsonl streaming reader with malformed-line tolerance"
```

---

### Task 6: event classification

**Files:**
- Create: `src/parser/events.js`
- Create: `test/unit/events.test.js`

- [ ] **Step 6.1: Write failing tests**

`test/unit/events.test.js`:

```javascript
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
```

- [ ] **Step 6.2: Run, expect FAIL**

Run: `npm run test:unit`
Expected: cannot find module.

- [ ] **Step 6.3: Implement**

`src/parser/events.js`:

```javascript
function contentArr(ev) {
  const c = ev?.message?.content;
  return Array.isArray(c) ? c : [];
}

export function isHumanTurn(ev) {
  if (ev?.type !== "user") return false;
  if (ev.isMeta || ev.isCompactSummary) return false;
  const c = ev.message?.content;
  if (typeof c === "string") return true;
  if (!Array.isArray(c) || c.length === 0) return false;
  return c.some((p) => p.type === "text" || p.type === "image");
}

export function classifyEvent(ev) {
  if (ev?.type === "system") {
    if (ev.subtype === "compact_boundary") return "compact_boundary";
    return "system_other";
  }
  if (ev?.type === "user") {
    if (ev.isCompactSummary) return "compact_summary";
    const arr = contentArr(ev);
    if (arr.length && arr.every((p) => p.type === "tool_result")) return "tool_result";
    return "user_text";
  }
  if (ev?.type === "assistant") {
    const arr = contentArr(ev);
    if (arr.some((p) => p.type === "tool_use")) return "tool_use";
    if (arr.some((p) => p.type === "thinking")) return "thinking";
    return "assistant_text";
  }
  return ev?.type || "unknown";
}
```

- [ ] **Step 6.4: Run, expect PASS**

Run: `npm run test:unit`
Expected: 24 tests pass total.

- [ ] **Step 6.5: Commit**

```bash
git add src/parser/events.js test/unit/events.test.js
git commit -m "feat: add event classification (isHumanTurn, classifyEvent)"
```

---

### Task 7: metadata accumulator (rounds, tokens, firstSummary)

**Files:**
- Create: `src/parser/metadata.js`
- Create: `test/unit/metadata.test.js`

- [ ] **Step 7.1: Write failing tests**

`test/unit/metadata.test.js`:

```javascript
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
```

- [ ] **Step 7.2: Run, expect FAIL**

Run: `npm run test:unit`
Expected: cannot find module.

- [ ] **Step 7.3: Implement**

`src/parser/metadata.js`:

```javascript
import { streamJsonl } from "./jsonl-stream.js";
import { isHumanTurn } from "./events.js";

const SUMMARY_LIMIT = 120;

function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((p) => p.type === "text").map((p) => p.text || "").join("\n");
}

function squashWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s, n) {
  // unicode-aware truncate by code point
  const arr = Array.from(s);
  return arr.length <= n ? s : arr.slice(0, n).join("");
}

export async function computeMetadata(filePath) {
  let rounds = 0;
  let firstUserSummary = "";
  let firstSummarySet = false;
  let malformed = 0;
  const tokens = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
  for await (const ev of streamJsonl(filePath, { onMalformed: () => malformed++ })) {
    if (isHumanTurn(ev)) {
      rounds++;
      if (!firstSummarySet) {
        const t = squashWhitespace(extractTextFromContent(ev.message.content));
        firstUserSummary = truncate(t, SUMMARY_LIMIT);
        firstSummarySet = true;
      }
    }
    if (ev?.type === "assistant") {
      const u = ev.message?.usage || {};
      tokens.input += u.input_tokens || 0;
      tokens.output += u.output_tokens || 0;
      tokens.cacheCreate += u.cache_creation_input_tokens || 0;
      tokens.cacheRead += u.cache_read_input_tokens || 0;
    }
  }
  return { rounds, tokens, firstUserSummary, malformed };
}
```

- [ ] **Step 7.4: Run, expect PASS**

Run: `npm run test:unit`
Expected: 27 tests pass total.

- [ ] **Step 7.5: Commit**

```bash
git add src/parser/metadata.js test/unit/metadata.test.js
git commit -m "feat: add metadata accumulator (rounds/tokens/firstSummary)"
```

---

### Task 8: extract-text + subagent-index

**Files:**
- Create: `src/parser/extract-text.js`
- Create: `src/parser/subagent-index.js`
- Create: `test/fixtures/with-subagents/parent.jsonl`
- Create: `test/fixtures/with-subagents/subagents/agent-x.jsonl`
- Create: `test/fixtures/with-subagents/subagents/agent-x.meta.json`
- Create: `test/unit/extract-text.test.js`
- Create: `test/unit/subagent-index.test.js`

- [ ] **Step 8.1: Write fixtures**

`test/fixtures/with-subagents/parent.jsonl`:

```
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"please research"}]},"uuid":"u1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Agent","input":{"description":"do research","prompt":"deep dive on X"}}],"usage":{"input_tokens":5,"output_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}},"uuid":"a1"}
```

`test/fixtures/with-subagents/subagents/agent-x.jsonl`:

```
{"type":"user","isSidechain":true,"agentId":"x","message":{"role":"user","content":"You are a researcher. Investigate X thoroughly."},"uuid":"sub-u1"}
{"type":"assistant","agentId":"x","message":{"role":"assistant","content":[{"type":"text","text":"investigation complete"}],"usage":{"input_tokens":50,"output_tokens":30,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}},"uuid":"sub-a1"}
```

`test/fixtures/with-subagents/subagents/agent-x.meta.json`:

```json
{"agentId": "x", "type": "researcher", "name": "deep-research"}
```

- [ ] **Step 8.2: Write extract-text tests**

`test/unit/extract-text.test.js`:

```javascript
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
```

- [ ] **Step 8.3: Write subagent-index tests**

`test/unit/subagent-index.test.js`:

```javascript
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
```

- [ ] **Step 8.4: Run, expect FAIL**

Run: `npm run test:unit`
Expected: cannot find module.

- [ ] **Step 8.5: Implement extract-text**

`src/parser/extract-text.js`:

```javascript
function pieces(content) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const p of content) {
    switch (p.type) {
      case "text": if (p.text) out.push(p.text); break;
      case "thinking": if (p.thinking) out.push(p.thinking); break;
      case "tool_use":
        if (p.name) out.push(p.name);
        if (p.input) { try { out.push(JSON.stringify(p.input)); } catch {} }
        break;
      case "tool_result":
        if (typeof p.content === "string") out.push(p.content);
        else if (Array.isArray(p.content)) {
          for (const inner of p.content) {
            if (inner?.type === "text" && inner.text) out.push(inner.text);
          }
        }
        break;
      // image/tool_reference: skip
    }
  }
  return out;
}

export function extractText(ev) {
  if (!ev || typeof ev !== "object") return "";
  if (ev.type === "system") {
    return ev.subtype === "compact_boundary" ? "" : "";
  }
  if (ev.type === "user" && ev.isCompactSummary) {
    const c = ev.message?.content;
    if (typeof c === "string") return c;
  }
  return pieces(ev.message?.content).join("\n");
}
```

- [ ] **Step 8.6: Implement subagent-index**

`src/parser/subagent-index.js`:

```javascript
import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { streamJsonl } from "./jsonl-stream.js";
import { extractText } from "./extract-text.js";

const SUMMARY_LIMIT = 120;

function squashTruncate(s, n) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  const arr = Array.from(t);
  return arr.length <= n ? t : arr.slice(0, n).join("");
}

async function firstPromptSummary(file) {
  for await (const ev of streamJsonl(file)) {
    if (ev?.type === "user") {
      const txt = extractText(ev);
      if (txt) return squashTruncate(txt, SUMMARY_LIMIT);
    }
  }
  return "";
}

async function readMeta(metaFile) {
  try {
    const txt = await readFile(metaFile, "utf8");
    return JSON.parse(txt);
  } catch { return {}; }
}

export async function listSubagents(parentDir, sessionId) {
  const dir = join(parentDir, sessionId, "subagents");
  let entries;
  try { entries = await readdir(dir); } catch { return []; }
  const out = [];
  for (const name of entries) {
    if (!name.startsWith("agent-") || !name.endsWith(".jsonl")) continue;
    const id = name.slice("agent-".length, -".jsonl".length);
    const file = join(dir, name);
    const metaFile = join(dir, `agent-${id}.meta.json`);
    const meta = await readMeta(metaFile);
    out.push({
      agentId: id,
      file,
      firstPromptSummary: await firstPromptSummary(file),
      agentType: meta.type || meta.name || "",
    });
  }
  return out;
}
```

- [ ] **Step 8.7: Run, expect PASS**

Run: `npm run test:unit`
Expected: 36 tests pass total.

- [ ] **Step 8.8: Commit**

```bash
git add src/parser/extract-text.js src/parser/subagent-index.js test/fixtures/with-subagents test/unit/extract-text.test.js test/unit/subagent-index.test.js
git commit -m "feat: add extract-text and subagent-index"
```

---

### Task 9: search engine

**Files:**
- Create: `src/parser/search.js`
- Create: `test/unit/search.test.js`

- [ ] **Step 9.1: Write failing tests**

`test/unit/search.test.js`:

```javascript
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
```

- [ ] **Step 9.2: Run, expect FAIL**

Run: `npm run test:unit`
Expected: cannot find module.

- [ ] **Step 9.3: Implement**

`src/parser/search.js`:

```javascript
import { streamJsonl } from "./jsonl-stream.js";
import { extractText } from "./extract-text.js";
import { classifyEvent } from "./events.js";

const CTX = 60;

function buildMatcher(q, regex) {
  if (regex) {
    try { return new RegExp(q, "ig"); } catch { throw new Error("invalid regex: " + q); }
  }
  // escape and case-insensitive substring
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "ig");
}

function findRangesIn(haystack, re) {
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(haystack)) !== null) {
    out.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

function makeSnippet(haystack, range) {
  const [s, e] = range;
  const start = Math.max(0, s - CTX);
  const end = Math.min(haystack.length, e + CTX);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  const snip = prefix + haystack.slice(start, end) + suffix;
  const offset = (prefix ? 1 : 0) - start;
  return { snippet: snip, matchRanges: [[s + offset, e + offset]] };
}

function roleOf(ev) {
  if (ev?.type === "user") return "user";
  if (ev?.type === "assistant") return "assistant";
  return "system";
}

export async function searchFile(filePath, { q, regex = false, max = 50 }) {
  const matcher = buildMatcher(q, regex);
  const matches = [];
  let truncated = false;
  let idx = -1;
  for await (const ev of streamJsonl(filePath)) {
    idx++;
    const text = extractText(ev);
    if (!text) continue;
    const ranges = findRangesIn(text, matcher);
    for (const r of ranges) {
      const { snippet, matchRanges } = makeSnippet(text, r);
      matches.push({ eventIdx: idx, role: roleOf(ev), type: classifyEvent(ev), snippet, matchRanges });
      if (matches.length >= max) { truncated = true; break; }
    }
    if (truncated) break;
  }
  return { matches, truncated };
}
```

- [ ] **Step 9.4: Run, expect PASS**

Run: `npm run test:unit`
Expected: 41 tests pass total.

- [ ] **Step 9.5: Commit**

```bash
git add src/parser/search.js test/unit/search.test.js
git commit -m "feat: add streaming search engine"
```

---

## Phase 3 — HTTP Server

### Task 10: server skeleton + multi-session fixture

**Files:**
- Create: `src/server.js`
- Create: `test/fixtures/multi-session-dir/s1.jsonl` (copy of basic.jsonl)
- Create: `test/fixtures/multi-session-dir/s2.jsonl` (different content)
- Create: `test/fixtures/multi-session-dir/s2/subagents/agent-y.jsonl`
- Create: `test/fixtures/multi-session-dir/s2/subagents/agent-y.meta.json`
- Create: `test/integration/api.test.js`

- [ ] **Step 10.1: Write multi-session fixtures**

Run: `cp test/fixtures/basic.jsonl test/fixtures/multi-session-dir/s1.jsonl`
Then create `test/fixtures/multi-session-dir/s2.jsonl`:

```
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"second session start"}]},"uuid":"u1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"reply in s2"}],"usage":{"input_tokens":1,"output_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}},"uuid":"a1"}
```

`test/fixtures/multi-session-dir/s2/subagents/agent-y.jsonl`:

```
{"type":"user","isSidechain":true,"message":{"role":"user","content":"sidechain prompt for y"},"uuid":"sub-u1"}
```

`test/fixtures/multi-session-dir/s2/subagents/agent-y.meta.json`:

```json
{"agentId":"y","type":"reviewer"}
```

- [ ] **Step 10.2: Write integration test scaffold (covers /api/list-dir only for now)**

`test/integration/api.test.js`:

```javascript
import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { startServer } from "../../src/server.js";
import { resolve } from "node:path";

let server, base;
const FIXTURES = resolve("test/fixtures");

before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.port}`; });
after(() => server?.close());

test("GET /api/list-dir returns entries", async () => {
  const r = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.path, FIXTURES);
  assert.ok(Array.isArray(body.entries));
  assert.ok(body.entries.some((e) => e.name === "basic.jsonl"));
});

test("GET unknown path returns 404", async () => {
  const r = await fetch(`${base}/api/list-dir?path=${encodeURIComponent("/no/such/dir/xyz123")}`);
  assert.equal(r.status, 404);
});

test("rejects relative path", async () => {
  const r = await fetch(`${base}/api/list-dir?path=foo`);
  assert.equal(r.status, 400);
});
```

- [ ] **Step 10.3: Run, expect FAIL**

Run: `npm run test:integration`
Expected: cannot find `startServer`.

- [ ] **Step 10.4: Implement server skeleton with router**

`src/server.js`:

```javascript
import { createServer } from "node:http";
import { URL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { stat, readFile } from "node:fs/promises";
import { listDir } from "./routes/list-dir.js";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");

const ROUTES = new Map([
  ["/api/list-dir", listDir],
]);

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function send(res, status, body, headers = {}) {
  const h = { "Content-Type": "application/json; charset=utf-8", ...headers };
  res.writeHead(status, h);
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveStatic(req, res) {
  const u = new URL(req.url, "http://x");
  let p = u.pathname === "/" ? "/index.html" : u.pathname;
  if (p.startsWith("/session.html")) p = "/session.html";
  const fpath = join(PUBLIC_DIR, p);
  if (!fpath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "forbidden" });
  try {
    const buf = await readFile(fpath);
    const ext = p.slice(p.lastIndexOf("."));
    send(res, 200, buf, { "Content-Type": STATIC_TYPES[ext] || "application/octet-stream" });
  } catch {
    send(res, 404, { error: "not found" });
  }
}

async function handle(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
  const u = new URL(req.url, "http://x");
  const handler = ROUTES.get(u.pathname);
  if (handler) {
    try { return await handler(req, res, u); }
    catch (e) { return send(res, 500, { error: e.message }); }
  }
  if (u.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
  return serveStatic(req, res);
}

export function startServer({ port = 0 } = {}) {
  return new Promise((resolve) => {
    const srv = createServer(handle);
    srv.listen(port, "127.0.0.1", () => {
      const addr = srv.address();
      resolve({ port: addr.port, close: () => new Promise((r) => srv.close(r)) });
    });
  });
}

export { send };
```

- [ ] **Step 10.5: Implement first route stub**

`src/routes/list-dir.js`:

```javascript
import { readdir, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";

export async function listDir(req, res, url) {
  const raw = url.searchParams.get("path");
  let p;
  try { p = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(p); }
  catch { return send(res, 404, { error: "not found" }); }
  const out = [];
  let hasJsonl = false;
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    let s;
    try { s = await stat(join(p, name)); } catch { continue; }
    const isDir = s.isDirectory();
    if (!isDir && !name.endsWith(".jsonl")) continue;
    if (!isDir) hasJsonl = true;
    out.push({
      name,
      type: isDir ? "dir" : "file",
      size: s.size,
      mtime: s.mtime.toISOString(),
    });
  }
  // mark jsonl-dir
  if (hasJsonl) {
    // root dir itself contains jsonl files; clients infer from entries
  }
  send(res, 200, {
    path: p,
    parent: dirname(p) === p ? null : dirname(p),
    entries: out,
  });
}
```

(Note: `import { send } from "../server.js"` creates a circular-ish dep but works because send is a pure function exported at module top.)

- [ ] **Step 10.6: Run, expect PASS**

Run: `npm run test:integration`
Expected: 3 tests pass.

- [ ] **Step 10.7: Commit**

```bash
git add src/server.js src/routes/list-dir.js test/fixtures/multi-session-dir test/integration/api.test.js
git commit -m "feat: http server skeleton + /api/list-dir"
```

---

### Task 11: enrich /api/list-dir + isClaudeProject

**Files:**
- Modify: `src/routes/list-dir.js`
- Modify: `test/integration/api.test.js`

- [ ] **Step 11.1: Add failing assertion**

In `test/integration/api.test.js`, append:

```javascript
test("list-dir marks Claude project subdirs", async () => {
  const r = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`);
  const body = await r.json();
  const sub = body.entries.find((e) => e.name === "multi-session-dir");
  assert.equal(sub.type, "jsonl-dir");
  assert.equal(sub.isClaudeProject, true);
  assert.ok(typeof sub.sessionCount === "number" && sub.sessionCount >= 2);
});
```

- [ ] **Step 11.2: Run, expect FAIL**

Run: `npm run test:integration`
Expected: assertion fails (sub.type === "dir").

- [ ] **Step 11.3: Implement detection**

Replace `src/routes/list-dir.js`:

```javascript
import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";

async function classifyDir(absDir) {
  let entries;
  try { entries = await readdir(absDir); } catch { return { isClaudeProject: false, sessionCount: 0 }; }
  let count = 0;
  for (const n of entries) {
    if (n.endsWith(".jsonl")) count++;
  }
  return { isClaudeProject: count > 0, sessionCount: count };
}

export async function listDir(req, res, url) {
  const raw = url.searchParams.get("path");
  let p;
  try { p = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(p); }
  catch { return send(res, 404, { error: "not found" }); }
  const out = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    let s;
    try { s = await stat(join(p, name)); } catch { continue; }
    const isDir = s.isDirectory();
    if (!isDir && !name.endsWith(".jsonl")) continue;
    const entry = { name, type: isDir ? "dir" : "file", size: s.size, mtime: s.mtime.toISOString() };
    if (isDir) {
      const c = await classifyDir(join(p, name));
      if (c.isClaudeProject) entry.type = "jsonl-dir";
      entry.isClaudeProject = c.isClaudeProject;
      entry.sessionCount = c.sessionCount;
    }
    out.push(entry);
  }
  send(res, 200, { path: p, parent: dirname(p) === p ? null : dirname(p), entries: out });
}
```

- [ ] **Step 11.4: Run, expect PASS**

Run: `npm run test:integration`
Expected: 4 tests pass.

- [ ] **Step 11.5: Commit**

```bash
git add src/routes/list-dir.js test/integration/api.test.js
git commit -m "feat: list-dir reports isClaudeProject + sessionCount"
```

---

### Task 12: /api/sessions

**Files:**
- Create: `src/routes/sessions.js`
- Modify: `src/server.js` (register route)
- Modify: `test/integration/api.test.js`

- [ ] **Step 12.1: Add failing test**

Append to `test/integration/api.test.js`:

```javascript
const SESSIONS_DIR = resolve("test/fixtures/multi-session-dir");

test("GET /api/sessions returns metadata + subagents", async () => {
  const r = await fetch(`${base}/api/sessions?dir=${encodeURIComponent(SESSIONS_DIR)}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.dir, SESSIONS_DIR);
  assert.equal(body.sessions.length, 2);
  const s2 = body.sessions.find((s) => s.sessionId === "s2");
  assert.ok(s2.firstUserSummary.includes("second session start"));
  assert.equal(s2.subagentCount, 1);
  assert.equal(s2.subagents[0].agentId, "y");
  assert.equal(s2.subagents[0].agentType, "reviewer");
});
```

- [ ] **Step 12.2: Run, expect FAIL**

Run: `npm run test:integration`
Expected: 404 (route not registered).

- [ ] **Step 12.3: Implement route**

`src/routes/sessions.js`:

```javascript
import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";
import { computeMetadata } from "../parser/metadata.js";
import { listSubagents } from "../parser/subagent-index.js";
import { LRU } from "../lru.js";

const cache = new LRU(50);

function cacheKey(file, mtime, size) { return `${file}|${mtime}|${size}`; }

async function summarize(dir, name) {
  const file = join(dir, name);
  const st = await stat(file);
  const key = cacheKey(file, st.mtimeMs, st.size);
  let meta = cache.get(key);
  if (!meta) {
    meta = await computeMetadata(file);
    cache.set(key, meta);
  }
  const sessionId = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : name;
  const subagents = await listSubagents(dir, sessionId);
  return {
    sessionId,
    file,
    mtime: st.mtime.toISOString(),
    size: st.size,
    rounds: meta.rounds,
    tokens: meta.tokens,
    firstUserSummary: meta.firstUserSummary,
    subagentCount: subagents.length,
    subagents,
  };
}

export async function sessions(req, res, url) {
  const raw = url.searchParams.get("dir");
  let dir;
  try { dir = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(dir); }
  catch { return send(res, 404, { error: "not found" }); }
  const jsonls = entries.filter((n) => n.endsWith(".jsonl"));
  const out = [];
  for (const n of jsonls) {
    try { out.push(await summarize(dir, n)); }
    catch (e) { /* skip unreadable */ }
  }
  out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  send(res, 200, { dir, sessions: out });
}
```

- [ ] **Step 12.4: Register route**

In `src/server.js`, add to `ROUTES`:

```javascript
import { sessions } from "./routes/sessions.js";
// ...
const ROUTES = new Map([
  ["/api/list-dir", listDir],
  ["/api/sessions", sessions],
]);
```

- [ ] **Step 12.5: Run, expect PASS**

Run: `npm run test:integration`
Expected: 5 tests pass.

- [ ] **Step 12.6: Commit**

```bash
git add src/routes/sessions.js src/server.js test/integration/api.test.js
git commit -m "feat: add /api/sessions with LRU metadata cache"
```

---

### Task 13: /api/session + /api/subagent

**Files:**
- Create: `src/routes/session.js`
- Modify: `src/server.js`
- Modify: `test/integration/api.test.js`

- [ ] **Step 13.1: Add failing tests**

Append to `test/integration/api.test.js`:

```javascript
test("GET /api/session returns events array + ETag", async () => {
  const file = resolve("test/fixtures/basic.jsonl");
  const r = await fetch(`${base}/api/session?file=${encodeURIComponent(file)}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("ETag") || "", /W\/".+"/);
  const body = await r.json();
  assert.equal(body.events.length, 9);
});

test("GET /api/session honors If-None-Match -> 304", async () => {
  const file = resolve("test/fixtures/basic.jsonl");
  const r1 = await fetch(`${base}/api/session?file=${encodeURIComponent(file)}`);
  const etag = r1.headers.get("ETag");
  const r2 = await fetch(`${base}/api/session?file=${encodeURIComponent(file)}`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});

test("GET /api/subagent returns events", async () => {
  const file = resolve("test/fixtures/with-subagents/subagents/agent-x.jsonl");
  const r = await fetch(`${base}/api/subagent?file=${encodeURIComponent(file)}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.events.length, 2);
});
```

- [ ] **Step 13.2: Run, expect FAIL**

Run: `npm run test:integration`
Expected: 404 routes missing.

- [ ] **Step 13.3: Implement route**

`src/routes/session.js`:

```javascript
import { stat } from "node:fs/promises";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";
import { streamJsonl } from "../parser/jsonl-stream.js";

function buildETag(st) { return `W/"${st.mtimeMs}-${st.size}"`; }

export async function session(req, res, url) {
  const raw = url.searchParams.get("file");
  let file;
  try { file = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let st;
  try { st = await stat(file); }
  catch { return send(res, 404, { error: "not found" }); }
  const etag = buildETag(st);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag });
    return res.end();
  }
  const events = [];
  let malformed = 0;
  for await (const ev of streamJsonl(file, { onMalformed: () => malformed++ })) events.push(ev);
  send(res, 200, { file, events, malformed }, { ETag: etag });
}
```

- [ ] **Step 13.4: Register routes**

`src/server.js`:

```javascript
import { session } from "./routes/session.js";
const ROUTES = new Map([
  ["/api/list-dir", listDir],
  ["/api/sessions", sessions],
  ["/api/session", session],
  ["/api/subagent", session],
]);
```

- [ ] **Step 13.5: Run, expect PASS**

Run: `npm run test:integration`
Expected: 8 tests pass.

- [ ] **Step 13.6: Commit**

```bash
git add src/routes/session.js src/server.js test/integration/api.test.js
git commit -m "feat: add /api/session and /api/subagent with ETag/304"
```

---

### Task 14: /api/search

**Files:**
- Create: `src/routes/search.js`
- Modify: `src/server.js`
- Modify: `test/integration/api.test.js`

- [ ] **Step 14.1: Add failing tests**

Append to `test/integration/api.test.js`:

```javascript
test("search hits in session body", async () => {
  const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=second%20session%20start`);
  assert.equal(r.status, 200);
  const body = await r.json();
  const s = body.sessions.find((x) => x.sessionId === "s2");
  assert.ok(s.hitInSession);
  assert.ok(s.sessionMatches.length >= 1);
});

test("search hits in subagent surfaces parent session with subagent-only flag", async () => {
  const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=sidechain%20prompt%20for%20y`);
  const body = await r.json();
  const s = body.sessions.find((x) => x.sessionId === "s2");
  assert.equal(s.hitInSession, false);
  assert.equal(s.hitInSubagent, true);
  assert.equal(s.subagentMatches[0].agentId, "y");
});

test("invalid regex returns 400", async () => {
  const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=(&regex=1`);
  assert.equal(r.status, 400);
});
```

- [ ] **Step 14.2: Run, expect FAIL**

Run: `npm run test:integration`
Expected: 404.

- [ ] **Step 14.3: Implement route**

`src/routes/search.js`:

```javascript
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";
import { searchFile } from "../parser/search.js";
import { listSubagents } from "../parser/subagent-index.js";
import { computeMetadata } from "../parser/metadata.js";

const PER_FILE_MAX = 50;

export async function search(req, res, url) {
  const dirRaw = url.searchParams.get("dir");
  const q = url.searchParams.get("q") || "";
  const regex = url.searchParams.get("regex") === "1";
  if (q.length === 0) return send(res, 400, { error: "missing q" });
  let dir;
  try { dir = validateAbsolutePath(dirRaw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(dir); }
  catch { return send(res, 404, { error: "not found" }); }
  const jsonls = entries.filter((n) => n.endsWith(".jsonl"));
  const out = [];
  for (const name of jsonls) {
    const file = join(dir, name);
    const sessionId = name.slice(0, -".jsonl".length);
    let sessionRes;
    try { sessionRes = await searchFile(file, { q, regex, max: PER_FILE_MAX }); }
    catch (e) { return send(res, 400, { error: e.message }); }
    const subs = await listSubagents(dir, sessionId);
    const subagentMatches = [];
    for (const s of subs) {
      let r;
      try { r = await searchFile(s.file, { q, regex, max: PER_FILE_MAX }); }
      catch (e) { return send(res, 400, { error: e.message }); }
      if (r.matches.length) {
        subagentMatches.push({ agentId: s.agentId, file: s.file, count: r.matches.length, snippets: r.matches });
      }
    }
    if (sessionRes.matches.length === 0 && subagentMatches.length === 0) continue;
    let st;
    try { st = await stat(file); } catch { continue; }
    const meta = await computeMetadata(file);
    out.push({
      sessionId,
      file,
      mtime: st.mtime.toISOString(),
      size: st.size,
      hitInSession: sessionRes.matches.length > 0,
      hitInSubagent: subagentMatches.length > 0,
      sessionMatches: sessionRes.matches,
      subagentMatches,
      rounds: meta.rounds,
      tokens: meta.tokens,
      firstUserSummary: meta.firstUserSummary,
      subagentCount: subs.length,
      subagents: subs,
    });
  }
  out.sort((a, b) => {
    if (a.hitInSession !== b.hitInSession) return a.hitInSession ? -1 : 1;
    return a.mtime < b.mtime ? 1 : -1;
  });
  send(res, 200, { dir, q, regex, total: out.length, sessions: out });
}
```

- [ ] **Step 14.4: Register**

`src/server.js`:

```javascript
import { search } from "./routes/search.js";
const ROUTES = new Map([
  ["/api/list-dir", listDir],
  ["/api/sessions", sessions],
  ["/api/session", session],
  ["/api/subagent", session],
  ["/api/search", search],
]);
```

- [ ] **Step 14.5: Run, expect PASS**

Run: `npm run test:integration`
Expected: 11 tests pass.

- [ ] **Step 14.6: Commit**

```bash
git add src/routes/search.js src/server.js test/integration/api.test.js
git commit -m "feat: add /api/search with subagent-aware results"
```

---

## Phase 4 — CLI Wiring

### Task 15: CLI starts server, opens browser, prints URL

**Files:**
- Modify: `bin/cli.js`
- Create: `test/integration/cli-smoke.test.js`

- [ ] **Step 15.1: Write failing smoke test**

`test/integration/cli-smoke.test.js`:

```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

test("cli starts, prints listening URL, --no-open does not launch browser", async () => {
  const child = spawn("node", ["bin/cli.js", "--no-open", "-p", "0"], { stdio: ["ignore", "pipe", "pipe"] });
  let url = "";
  const lines = [];
  child.stdout.on("data", (b) => { lines.push(b.toString()); });
  // wait briefly for the listening line
  for (let i = 0; i < 30 && !url; i++) {
    await sleep(100);
    const joined = lines.join("");
    const m = joined.match(/listening:\s+(http:\/\/127\.0\.0\.1:\d+)/);
    if (m) url = m[1];
  }
  assert.ok(url, "no listening line printed");
  // hit /api/list-dir to confirm server is up
  const r = await fetch(`${url}/api/list-dir?path=${encodeURIComponent(process.cwd())}`);
  assert.equal(r.status, 200);
  child.kill("SIGINT");
});
```

- [ ] **Step 15.2: Run, expect FAIL**

Run: `npm run test:integration`
Expected: spawn exits with "server bootstrap not yet implemented".

- [ ] **Step 15.3: Wire up bin/cli.js**

Replace `bin/cli.js`:

```javascript
#!/usr/bin/env node
import mri from "mri";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { startServer } from "../src/server.js";
import { probeFreePort, defaultRange } from "../src/port-probe.js";
import { openInBrowser } from "../src/browser-open.js";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const argv = mri(process.argv.slice(2), {
  alias: { d: "dir", p: "port", h: "help", v: "version" },
  boolean: ["help", "version", "no-open"],
  string: ["dir", "port"],
});

if (argv.version) { console.log(pkg.version); process.exit(0); }
if (argv.help) {
  console.log(`Usage: claude-dialog-analyzer [-d <dir>] [-p <port>] [--no-open]
  -d, --dir <abs>    starting directory (default: ~/.claude/projects)
  -p, --port <n>     port (default: probe 5173..5183, 0=random)
  --no-open          do not launch browser
  -h, --help         show help
  -v, --version      print version`);
  process.exit(0);
}

const requestedPort = argv.port !== undefined ? Number(argv.port) : null;
const dir = argv.dir || join(homedir(), ".claude", "projects");

let port;
try {
  if (requestedPort === 0) port = 0;
  else if (requestedPort !== null) port = requestedPort;
  else port = await probeFreePort(defaultRange());
} catch (e) {
  process.stderr.write(`failed to find port: ${e.message}\n`);
  process.exit(1);
}

const server = await startServer({ port });
const url = `http://127.0.0.1:${server.port}`;
const startUrl = `${url}/?dir=${encodeURIComponent(dir)}`;
process.stdout.write(`listening: ${url}\n`);
if (!argv["no-open"]) openInBrowser(startUrl);

const shutdown = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- [ ] **Step 15.4: Run, expect PASS**

Run: `npm run test:integration`
Expected: 12 tests pass.

- [ ] **Step 15.5: Manual smoke**

Run: `node bin/cli.js --no-open -p 5199`
Expected: prints `listening: http://127.0.0.1:5199`, server stays alive. `Ctrl+C` shuts down.
In another terminal: `curl http://127.0.0.1:5199/api/list-dir?path=$HOME` → JSON response.

- [ ] **Step 15.6: Commit**

```bash
git add bin/cli.js test/integration/cli-smoke.test.js
git commit -m "feat: wire cli → server → browser launch"
```

---

## Phase 5 — Frontend (extracted from existing index.html)

### Task 16: Move existing index.html to reference + scaffold static assets

**Files:**
- Move: `index.html` → `legacy/index.html` (keep for porting reference)
- Move: `1efa1b78-1f46-425e-af9f-81a68da3fc46.jsonl` → `test/fixtures/full-real.jsonl`
- Create: `src/public/styles.css` (extracted CSS)
- Create: `src/public/js/api.js`
- Create: `src/public/js/markdown.js`
- Create: `src/public/vendor/.gitkeep`

- [ ] **Step 16.1: Move legacy artifacts**

```bash
mkdir -p legacy test/fixtures src/public/vendor
git mv index.html legacy/index.html
mv 1efa1b78-1f46-425e-af9f-81a68da3fc46.jsonl test/fixtures/full-real.jsonl
touch src/public/vendor/.gitkeep
```

- [ ] **Step 16.2: Extract `src/public/styles.css` from `legacy/index.html`**

Open `legacy/index.html` and copy lines from the `<style>` block (currently lines 11-470 approximately) into `src/public/styles.css`. Add a few new classes for the list page:

Append to `styles.css`:

```css
/* List page */
.toolbar { display:flex; align-items:center; gap:12px; padding:12px 20px; background:var(--panel); border-bottom:1px solid var(--border); flex-wrap:wrap; }
.toolbar .breadcrumb { display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:13px; }
.toolbar .breadcrumb a { color:var(--accent); text-decoration:none; cursor:pointer; }
.toolbar .breadcrumb a:hover { text-decoration:underline; }
.toolbar .search { margin-left:auto; display:flex; gap:6px; align-items:center; }
.toolbar input[type=text] { padding:6px 10px; border:1px solid var(--border); border-radius:6px; font:inherit; min-width:240px; }
.toolbar button { padding:6px 12px; border:1px solid var(--border); background:var(--panel); border-radius:6px; cursor:pointer; font:inherit; }
.toolbar button:hover { border-color:var(--accent); color:var(--accent); }
.session-table { max-width:1200px; margin:24px auto; border-collapse:collapse; width:calc(100% - 48px); background:var(--panel); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.session-table th, .session-table td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--border); font-size:13px; vertical-align:top; }
.session-table tr:last-child td { border-bottom:0; }
.session-table tr.subagent-only { background:#fafafa; border-left:3px solid var(--muted); }
.session-table .summary-cell { max-width:340px; }
.session-table .hits { font-size:11px; color:var(--accent); margin-left:6px; }
.subagent-row td { background:#f9fafb; padding:6px 14px 12px 36px; }
.subagent-table { width:100%; border-collapse:collapse; font-size:12.5px; }
.subagent-table td { padding:4px 8px; border-bottom:1px dashed var(--border); }
mark { background:#fef08a; padding:0 2px; border-radius:2px; }
/* Modal */
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:50; }
.modal { background:var(--panel); border-radius:10px; padding:18px; min-width:520px; max-width:80vw; max-height:80vh; display:flex; flex-direction:column; gap:10px; }
.modal h3 { margin:0; font-size:15px; }
.modal .picker-list { flex:1; overflow:auto; border:1px solid var(--border); border-radius:6px; padding:6px; min-height:280px; }
.modal .picker-list .item { padding:6px 8px; cursor:pointer; border-radius:4px; font-size:13px; display:flex; gap:6px; }
.modal .picker-list .item:hover { background:#f1f5f9; }
.modal .picker-list .item.dir { font-weight:500; }
.modal .picker-list .item .badge { font-size:10px; color:var(--accent); margin-left:auto; }
.modal .actions { display:flex; gap:8px; justify-content:flex-end; }
```

- [ ] **Step 16.3: Write `src/public/js/api.js`**

```javascript
export async function api(path, params = {}) {
  const u = new URL(path, location.origin);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}
```

- [ ] **Step 16.4: Write `src/public/js/markdown.js`**

```javascript
const MD_OPTS = { gfm: true, breaks: false };
let ready = false;
function init() {
  if (ready) return;
  if (window.marked && window.DOMPurify) {
    window.marked.setOptions(MD_OPTS);
    if (window.hljs) {
      window.marked.use({
        renderer: {
          code(code, lang) {
            const language = window.hljs.getLanguage(lang) ? lang : "plaintext";
            const highlighted = window.hljs.highlight(code, { language }).value;
            return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
          },
        },
      });
    }
    ready = true;
  }
}
export function md(text) {
  init();
  if (!ready) return escapeHtml(text);
  const html = window.marked.parse(text || "");
  return window.DOMPurify.sanitize(html);
}
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
```

- [ ] **Step 16.5: Verify build sanity**

Run: `npm run test:unit && npm run test:integration`
Expected: all pass (no behavioral change yet).

- [ ] **Step 16.6: Commit**

```bash
git add legacy/ src/public/styles.css src/public/js/api.js src/public/js/markdown.js src/public/vendor/.gitkeep test/fixtures/full-real.jsonl
git rm index.html
git commit -m "chore: extract legacy index.html, add shared frontend assets"
```

---

### Task 17: Detail page — port renderers + folding toggles

**Files:**
- Create: `src/public/session.html`
- Create: `src/public/js/renderers/{user,assistant,thinking,tool,compact,system-note}.js`
- Create: `src/public/js/fold-toggles.js`
- Create: `src/public/js/highlight-q.js`
- Create: `src/public/js/session.js`

This task ports the rendering logic from `legacy/index.html` (functions `renderUser` line 614, `renderAssistantText` line 623, `renderThinking` line 632, `renderTool` line 647, `renderCompact` line 749, `renderSystemNote` line 780) into modular files.

- [ ] **Step 17.1: Write `src/public/session.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Claude 会话详情</title>
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js"></script>
  <!-- offline fallback: replace above 4 lines with /vendor/* paths -->
</head>
<body>
  <header class="toolbar">
    <a href="/" id="back">← 会话列表</a>
    <h1 id="title" style="margin:0;font-size:14px;font-weight:600;"></h1>
    <div class="stats" id="stats"></div>
    <div class="actions" style="margin-left:auto;display:flex;gap:10px;">
      <label class="toggle"><input type="checkbox" data-fold="thinking"> 思考</label>
      <label class="toggle"><input type="checkbox" data-fold="tool"> 工具</label>
      <label class="toggle"><input type="checkbox" data-fold="system"> 系统</label>
      <label class="toggle"><input type="checkbox" data-fold="subagent"> subagent</label>
      <label class="toggle"><input type="checkbox" data-fold="askUserQuestion"> 提问</label>
    </div>
  </header>
  <main>
    <div id="banner" style="display:none;"></div>
    <div id="conversation"></div>
  </main>
  <script type="module" src="/js/session.js"></script>
</body>
</html>
```

- [ ] **Step 17.2: Port renderers**

Open `legacy/index.html` and copy the body of each render function into a corresponding `src/public/js/renderers/<name>.js` file as a default-exported function. Each function takes `(ev, ctx)` where `ctx` provides `{ md, toolResults, q }`.

`src/public/js/renderers/user.js`:

```javascript
import { md } from "../markdown.js";

export function renderUser(ev) {
  const c = ev.message?.content;
  let html = "";
  if (typeof c === "string") html = md(c);
  else if (Array.isArray(c)) {
    html = c.map((p) => p.type === "text" ? md(p.text || "") : "").join("");
  }
  return `<div class="row user" data-kind="user_text"><div class="meta">user</div><div class="bubble">${html}</div></div>`;
}
```

`src/public/js/renderers/assistant.js`:

```javascript
import { md } from "../markdown.js";

export function renderAssistantText(ev) {
  const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
  const text = arr.filter((p) => p.type === "text").map((p) => p.text || "").join("\n\n");
  if (!text) return "";
  return `<div class="row assistant" data-kind="assistant_text"><div class="meta">assistant</div><div class="bubble">${md(text)}</div></div>`;
}
```

`src/public/js/renderers/thinking.js`:

```javascript
import { md } from "../markdown.js";

export function renderThinking(ev) {
  const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
  const ts = arr.filter((p) => p.type === "thinking").map((p) => p.thinking || "").join("\n\n");
  if (!ts) return "";
  return `<details class="thinking" data-kind="thinking" open><summary>💭 思考</summary><div class="thinking-body">${md(ts)}</div></details>`;
}
```

`src/public/js/renderers/tool.js`:

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

export function renderTool(toolUse, toolResult) {
  const name = toolUse.name || "tool";
  const isAgent = name === "Agent" || name === "Task";
  const inputJson = JSON.stringify(toolUse.input || {}, null, 2);
  let resultHtml = "";
  if (!toolResult) resultHtml = `<div class="no-result">尚无返回</div>`;
  else {
    const c = toolResult.content;
    if (typeof c === "string") resultHtml = `<pre class="result">${escapeHtml(c)}</pre>`;
    else if (Array.isArray(c)) {
      resultHtml = c.map((p) => p.type === "text" ? `<pre class="result">${escapeHtml(p.text || "")}</pre>` : "").join("");
    }
  }
  const kind = isAgent ? "subagent" : "tool";
  return `<div class="tool" data-kind="${kind}"><div class="tool-head"><span class="tool-name">🔧 ${escapeHtml(name)}</span><span class="tool-id">${toolUse.id || ""}</span></div><pre class="tool-input">${escapeHtml(inputJson)}</pre>${resultHtml}</div>`;
}
```

`src/public/js/renderers/compact.js`:

```javascript
import { md } from "../markdown.js";

export function renderCompact(ev) {
  const meta = ev.compactMetadata || {};
  const summary = ev.summary || "";
  return `<div class="compact-block">
    <div class="compact"><span class="badge">上下文压缩 · pre ${meta.preTokens || 0} · ${meta.trigger || ""}</span></div>
    ${summary ? `<details class="compact-summary" data-kind="system" open><summary><span class="title">压缩摘要</span><span class="len">${summary.length} 字</span></summary><div class="body">${md(summary)}</div></details>` : ""}
  </div>`;
}
```

`src/public/js/renderers/system-note.js`:

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

export function renderSystemNote(ev) {
  return `<div class="system-note" data-kind="system">${escapeHtml(JSON.stringify(ev))}</div>`;
}
```

- [ ] **Step 17.3: Write `src/public/js/fold-toggles.js`**

```javascript
const KEY = "da:fold:v1";
const DEFAULT = { thinking: false, tool: true, system: false, subagent: true, askUserQuestion: true };

export function loadFoldState() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULT }; }
}

export function saveFoldState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

export function applyFold(root, state) {
  for (const [type, folded] of Object.entries(state)) {
    const targets = root.querySelectorAll(`[data-kind="${type}"]`);
    for (const el of targets) {
      if (el.tagName === "DETAILS") el.open = !folded;
      else el.classList.toggle("collapsed", folded);
    }
  }
}

export function bindFoldToggles(root) {
  const state = loadFoldState();
  const inputs = document.querySelectorAll("input[data-fold]");
  for (const inp of inputs) {
    inp.checked = !!state[inp.dataset.fold];
    inp.addEventListener("change", () => {
      state[inp.dataset.fold] = inp.checked;
      saveFoldState(state);
      applyFold(root, state);
    });
  }
  applyFold(root, state);
  return state;
}
```

CSS addition for collapsed plain divs — append to `styles.css`:

```css
[data-kind].collapsed { max-height:32px; overflow:hidden; opacity:0.7; cursor:pointer; }
[data-kind].collapsed::after { content:" (已折叠，点击展开)"; color:var(--muted); font-size:11px; }
```

- [ ] **Step 17.4: Write `src/public/js/highlight-q.js`**

```javascript
export function highlightAll(root, q) {
  if (!q) return;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.match(re)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let n; while ((n = walker.nextNode())) nodes.push(n);
  for (const tn of nodes) {
    const html = (tn.nodeValue).replace(re, (m) => `<mark>${m}</mark>`);
    const span = document.createElement("span");
    span.innerHTML = html;
    tn.replaceWith(span);
  }
}
```

- [ ] **Step 17.5: Write `src/public/js/session.js`**

```javascript
import { api } from "./api.js";
import { renderUser } from "./renderers/user.js";
import { renderAssistantText } from "./renderers/assistant.js";
import { renderThinking } from "./renderers/thinking.js";
import { renderTool } from "./renderers/tool.js";
import { renderCompact } from "./renderers/compact.js";
import { renderSystemNote } from "./renderers/system-note.js";
import { bindFoldToggles } from "./fold-toggles.js";
import { highlightAll } from "./highlight-q.js";

const params = new URL(location.href).searchParams;
const file = params.get("file");
const kind = params.get("kind") || "session";
const q = params.get("q") || "";

const $title = document.getElementById("title");
const $stats = document.getElementById("stats");
const $banner = document.getElementById("banner");
const $conv = document.getElementById("conversation");
const $back = document.getElementById("back");
if (kind === "subagent") document.body.classList.add("kind-subagent");
const lastDir = sessionStorage.getItem("da:lastDir");
if (lastDir) $back.href = `/?dir=${encodeURIComponent(lastDir)}`;

function buildToolResultIndex(events) {
  const idx = new Map();
  for (const ev of events) {
    if (ev?.type === "user") {
      const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
      for (const p of arr) if (p.type === "tool_result") idx.set(p.tool_use_id, p);
    }
  }
  return idx;
}

function renderEvent(ev, toolResults) {
  if (ev?.type === "system") {
    if (ev.subtype === "compact_boundary") return renderCompact(ev);
    return renderSystemNote(ev);
  }
  if (ev?.type === "user") {
    if (ev.isCompactSummary) return ""; // attached to compact_boundary already
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    if (arr.length && arr.every((p) => p.type === "tool_result")) return ""; // pair shown via tool_use
    return renderUser(ev);
  }
  if (ev?.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const out = [];
    if (arr.some((p) => p.type === "thinking")) out.push(renderThinking(ev));
    if (arr.some((p) => p.type === "text")) out.push(renderAssistantText(ev));
    for (const p of arr) if (p.type === "tool_use") out.push(renderTool(p, toolResults.get(p.id)));
    return out.join("");
  }
  if (ev?.type === "queue-operation") return ""; // hide
  return renderSystemNote(ev);
}

function attachCompactSummaries(events) {
  // events of type=user isCompactSummary: attach summary to the previous compact_boundary
  let pendingCompact = null;
  for (const ev of events) {
    if (ev?.type === "system" && ev.subtype === "compact_boundary") pendingCompact = ev;
    else if (ev?.type === "user" && ev.isCompactSummary && pendingCompact) {
      const c = ev.message?.content;
      pendingCompact.summary = typeof c === "string" ? c : "";
      pendingCompact = null;
    }
  }
}

async function main() {
  if (!file) { $banner.textContent = "缺少 file 参数"; $banner.style.display = "block"; return; }
  $title.textContent = decodeURIComponent(file);
  const endpoint = kind === "subagent" ? "/api/subagent" : "/api/session";
  let body;
  try { body = await api(endpoint, { file }); }
  catch (e) { $banner.textContent = `加载失败：${e.message}`; $banner.style.display = "block"; return; }
  if (body.malformed) { $banner.textContent = `已忽略 ${body.malformed} 行无法解析的内容`; $banner.style.display = "block"; }
  attachCompactSummaries(body.events);
  const toolResults = buildToolResultIndex(body.events);
  const html = body.events.map((ev) => renderEvent(ev, toolResults)).join("");
  $conv.innerHTML = html;
  $stats.textContent = `${body.events.length} 条事件`;
  bindFoldToggles($conv);
  if (q) highlightAll($conv, q);
}

main();
```

- [ ] **Step 17.6: Manual smoke**

Run: `node bin/cli.js --no-open -p 5199`
Open: `http://127.0.0.1:5199/session.html?file=$(realpath test/fixtures/basic.jsonl)`
Expected: page renders 9 events; toggling 工具 hides tool blocks; refresh persists state.

- [ ] **Step 17.7: Commit**

```bash
git add src/public/session.html src/public/js
git commit -m "feat: detail page with per-type fold toggles"
```

---

### Task 18: List page — directory picker + sessions table

**Files:**
- Create: `src/public/index.html`
- Create: `src/public/js/dir-picker.js`
- Create: `src/public/js/list.js`

- [ ] **Step 18.1: Write `src/public/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Claude 会话列表</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="toolbar">
    <span style="font-weight:600;">Claude 会话分析器</span>
    <nav class="breadcrumb" id="breadcrumb"></nav>
    <button id="pick">选目录</button>
    <button id="pick-native">浏览器选目录</button>
    <button id="refresh">刷新</button>
    <div class="search">
      <input id="q" type="text" placeholder="全文检索" />
      <label class="toggle"><input type="checkbox" id="regex"> 正则</label>
      <button id="search">搜索</button>
      <button id="clear" hidden>清空</button>
    </div>
  </header>
  <main>
    <div id="banner" style="display:none;padding:10px 20px;color:var(--muted);"></div>
    <div id="list-container"></div>
  </main>
  <script type="module" src="/js/list.js"></script>
</body>
</html>
```

- [ ] **Step 18.2: Write `src/public/js/dir-picker.js`**

```javascript
import { api } from "./api.js";

export function showDirPicker(initialPath) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `<div class="modal">
      <h3>选择目录</h3>
      <input id="m-path" type="text" value="${initialPath || ""}" />
      <div class="picker-list" id="m-list"></div>
      <div class="actions">
        <button id="m-cancel">取消</button>
        <button id="m-ok">确定</button>
      </div>
    </div>`;
    document.body.appendChild(back);
    const $path = back.querySelector("#m-path");
    const $list = back.querySelector("#m-list");

    async function render(p) {
      $path.value = p;
      try {
        const body = await api("/api/list-dir", { path: p });
        $list.innerHTML = "";
        if (body.parent) {
          const up = mkItem("📁 .. (上一级)", "dir", body.parent);
          $list.appendChild(up);
        }
        for (const e of body.entries) {
          if (e.type === "dir" || e.type === "jsonl-dir") {
            const tag = e.type === "jsonl-dir" ? `<span class="badge">${e.sessionCount} 会话</span>` : "";
            const item = mkItem(`📁 ${e.name}`, "dir", `${p}/${e.name}`.replace(/\/+/g, "/"), tag);
            $list.appendChild(item);
          }
        }
      } catch (e) { $list.innerHTML = `<div style="color:#dc2626;padding:8px;">${e.message}</div>`; }
    }
    function mkItem(label, cls, target, badge = "") {
      const div = document.createElement("div");
      div.className = `item ${cls}`;
      div.innerHTML = `<span>${label}</span>${badge}`;
      div.addEventListener("dblclick", () => render(target));
      div.addEventListener("click", () => $path.value = target);
      return div;
    }

    back.querySelector("#m-cancel").onclick = () => { back.remove(); resolve(null); };
    back.querySelector("#m-ok").onclick = () => { const v = $path.value.trim(); back.remove(); resolve(v); };
    $path.addEventListener("keydown", (e) => { if (e.key === "Enter") render($path.value); });
    render(initialPath || "/");
  });
}
```

- [ ] **Step 18.3: Write `src/public/js/list.js`**

```javascript
import { api } from "./api.js";
import { showDirPicker } from "./dir-picker.js";

const params = new URL(location.href).searchParams;
let currentDir = params.get("dir") || "";

const $crumb = document.getElementById("breadcrumb");
const $banner = document.getElementById("banner");
const $container = document.getElementById("list-container");

function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

function renderBreadcrumb(p) {
  if (!p) { $crumb.innerHTML = `<span style="color:var(--muted);">未选择目录</span>`; return; }
  const parts = p.split("/").filter(Boolean);
  let acc = "";
  const links = [`<a data-p="/">/</a>`];
  for (const part of parts) { acc += `/${part}`; links.push(`<a data-p="${acc}">${escapeHtml(part)}</a>`); }
  $crumb.innerHTML = links.join("<span style='color:var(--muted);'>/</span>");
  $crumb.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => goto(a.dataset.p)));
}

function fmtTokens(t) { return `${t.input}/${t.output}/${t.cacheRead}`; }
function fmtMtime(s) { return new Date(s).toLocaleString(); }

function renderSessionsTable(sessions, opts = {}) {
  if (!sessions.length) { $container.innerHTML = `<div class="empty-state">无会话</div>`; return; }
  const rows = sessions.map((s) => sessionRow(s, opts)).join("");
  $container.innerHTML = `<table class="session-table">
    <thead><tr><th>ID</th><th>mtime</th><th>轮次</th><th>tokens (in/out/cacheRead)</th><th>首条摘要</th><th>subagent</th><th>详情</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  bindRowEvents();
}

function sessionRow(s, opts) {
  const subagentOnly = opts.search && !s.hitInSession && s.hitInSubagent;
  const klass = subagentOnly ? "subagent-only" : "";
  const idShort = s.sessionId.slice(0, 8);
  const subBtn = `<button class="expand" data-id="${s.sessionId}">▶ ${s.subagentCount}</button>`;
  const hits = opts.search && (s.hitInSession || s.hitInSubagent) ?
    `<span class="hits">${(s.sessionMatches?.length || 0) + (s.subagentMatches?.reduce((a,b)=>a+b.count,0)||0)} hits</span>` : "";
  const note = subagentOnly ? `<div style="color:var(--muted);font-size:11px;">会话本体未命中，子代理命中</div>` : "";
  const detailHref = `/session.html?file=${encodeURIComponent(s.file)}${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}`;
  return `<tr class="${klass}" data-id="${s.sessionId}">
    <td><span title="${escapeHtml(s.file)}">${idShort}</span>${hits}</td>
    <td>${fmtMtime(s.mtime)}</td>
    <td>${s.rounds}</td>
    <td>${fmtTokens(s.tokens)}</td>
    <td class="summary-cell">${escapeHtml(s.firstUserSummary)}${note}</td>
    <td>${subBtn}</td>
    <td><a href="${detailHref}">查看</a></td>
  </tr>${renderSubRow(s, opts)}`;
}

function renderSubRow(s, opts) {
  const subs = opts.search ? (s.subagentMatches || []).map((m) => s.subagents.find((x) => x.agentId === m.agentId)).filter(Boolean) : s.subagents;
  if (!subs.length) return "";
  const open = opts.search && s.hitInSubagent;
  const display = open ? "" : "display:none;";
  const items = subs.map((sa) => `<tr><td>${sa.agentId.slice(0,10)}</td><td>${escapeHtml(sa.agentType || "")}</td><td>${escapeHtml(sa.firstPromptSummary)}</td><td><a href="/session.html?file=${encodeURIComponent(sa.file)}&kind=subagent${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}">查看</a></td></tr>`).join("");
  return `<tr class="subagent-row" data-parent="${s.sessionId}" style="${display}"><td colspan="7"><table class="subagent-table"><tbody>${items}</tbody></table></td></tr>`;
}

function bindRowEvents() {
  document.querySelectorAll(".expand").forEach((btn) => btn.addEventListener("click", () => {
    const row = document.querySelector(`tr.subagent-row[data-parent="${btn.dataset.id}"]`);
    if (!row) return;
    row.style.display = row.style.display === "none" ? "" : "none";
  }));
}

async function loadList(dir) {
  if (!dir) { $container.innerHTML = `<div class="empty-state">请先选择分析目录</div>`; return; }
  sessionStorage.setItem("da:lastDir", dir);
  $container.innerHTML = `<div class="empty-state">加载中…</div>`;
  try {
    const body = await api("/api/sessions", { dir });
    renderSessionsTable(body.sessions, { search: false });
  } catch (e) {
    $banner.textContent = `加载失败：${e.message}`; $banner.style.display = "block";
  }
}

async function runSearch(q, regex) {
  const $btn = document.getElementById("search");
  $btn.disabled = true; $btn.textContent = "搜索中…";
  try {
    const body = await api("/api/search", { dir: currentDir, q, regex: regex ? "1" : "0" });
    renderSessionsTable(body.sessions, { search: true, q });
    document.getElementById("clear").hidden = false;
  } catch (e) {
    $banner.textContent = `搜索失败：${e.message}`; $banner.style.display = "block";
  } finally { $btn.disabled = false; $btn.textContent = "搜索"; }
}

function goto(dir) { currentDir = dir; renderBreadcrumb(dir); loadList(dir); }

document.getElementById("pick").addEventListener("click", async () => {
  const p = await showDirPicker(currentDir || "/Users");
  if (p) goto(p);
});

document.getElementById("pick-native").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) { alert("仅 Chrome/Edge 支持"); return; }
  try {
    const handle = await window.showDirectoryPicker();
    alert(`已选择目录: ${handle.name}\n请在弹层中输入完整绝对路径以继续。`);
  } catch {}
});

document.getElementById("refresh").addEventListener("click", () => loadList(currentDir));

document.getElementById("search").addEventListener("click", () => {
  const q = document.getElementById("q").value.trim();
  if (!q) return;
  runSearch(q, document.getElementById("regex").checked);
});

document.getElementById("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("search").click();
  if (e.key === "Escape") document.getElementById("clear").click();
});

document.getElementById("clear").addEventListener("click", () => {
  document.getElementById("q").value = "";
  document.getElementById("clear").hidden = true;
  loadList(currentDir);
});

renderBreadcrumb(currentDir);
loadList(currentDir);
```

- [ ] **Step 18.4: Manual smoke**

Run: `node bin/cli.js --no-open -p 5199`
Open: `http://127.0.0.1:5199/?dir=$(realpath test/fixtures/multi-session-dir)`
Expected: 2 sessions in table; expand subagent row works; click 详情 opens detail page.

- [ ] **Step 18.5: Commit**

```bash
git add src/public/index.html src/public/js/dir-picker.js src/public/js/list.js
git commit -m "feat: list page with directory picker and sessions table"
```

---

## Phase 6 — E2E

### Task 19: Playwright config + list-flow e2e

**Files:**
- Create: `test/e2e/playwright.config.js`
- Create: `test/e2e/helpers.js`
- Create: `test/e2e/list-flow.spec.js`

- [ ] **Step 19.1: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: chromium downloads.

- [ ] **Step 19.2: Write `test/e2e/playwright.config.js`**

```javascript
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  use: { headless: true, viewport: { width: 1280, height: 800 } },
  reporter: "list",
});
```

- [ ] **Step 19.3: Write `test/e2e/helpers.js`**

```javascript
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export async function startCli({ cwd = process.cwd(), args = [] } = {}) {
  const child = spawn("node", ["bin/cli.js", "--no-open", "-p", "0", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let url = "";
  let buf = "";
  child.stdout.on("data", (b) => { buf += b.toString(); });
  for (let i = 0; i < 50 && !url; i++) {
    await sleep(100);
    const m = buf.match(/listening:\s+(http:\/\/127\.0\.0\.1:\d+)/);
    if (m) url = m[1];
  }
  if (!url) { child.kill(); throw new Error("cli failed to start"); }
  return { url, kill: () => child.kill("SIGINT") };
}
```

- [ ] **Step 19.4: Write `test/e2e/list-flow.spec.js`**

```javascript
import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

test("list page shows sessions and opens detail", async ({ page }) => {
  const dir = resolve("test/fixtures/multi-session-dir");
  await page.goto(`${cli.url}/?dir=${encodeURIComponent(dir)}`);
  await expect(page.locator('.session-table tbody tr[data-id="s1"]')).toBeVisible();
  await expect(page.locator('.session-table tbody tr[data-id="s2"]')).toBeVisible();
  // expand s2 (which has 1 subagent), subagent-row becomes visible
  await page.locator('tr[data-id="s2"] .expand').click();
  await expect(page.locator('tr.subagent-row[data-parent="s2"]')).toBeVisible();
  // open s1 detail (basic.jsonl content)
  await page.locator('tr[data-id="s1"]').locator("a", { hasText: "查看" }).click();
  await expect(page).toHaveURL(/\/session\.html\?file=/);
  // basic.jsonl: u1 → user row, a1 → assistant text row, a2 → no row (tool), u4 → user row, a3 → assistant text row = 4 .row
  await expect(page.locator("#conversation .row")).toHaveCount(4);
});
```

- [ ] **Step 19.5: Run, expect PASS (after potential count adjustment)**

Run: `npx playwright test`
Expected: all pass; if count off, adjust expectations.

- [ ] **Step 19.6: Commit**

```bash
git add test/e2e/playwright.config.js test/e2e/helpers.js test/e2e/list-flow.spec.js
git commit -m "test: add playwright list-flow e2e"
```

---

### Task 20: search-flow + fold-flow e2e

**Files:**
- Create: `test/e2e/search-flow.spec.js`
- Create: `test/e2e/fold-flow.spec.js`

- [ ] **Step 20.1: Write `test/e2e/search-flow.spec.js`**

```javascript
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
```

- [ ] **Step 20.2: Write `test/e2e/fold-flow.spec.js`**

```javascript
import { test, expect } from "@playwright/test";
import { startCli } from "./helpers.js";
import { resolve } from "node:path";

let cli;
test.beforeAll(async () => { cli = await startCli(); });
test.afterAll(async () => { cli?.kill(); });

test("fold toggle persists across reload", async ({ page }) => {
  const file = resolve("test/fixtures/basic.jsonl");
  await page.goto(`${cli.url}/session.html?file=${encodeURIComponent(file)}`);
  // tool toggle is on by default (folded)
  const toolBox = page.locator('input[data-fold="tool"]');
  await expect(toolBox).toBeChecked();
  // uncheck → tool blocks visible
  await toolBox.uncheck();
  await expect(page.locator(".tool").first()).toBeVisible();
  await expect(page.locator(".tool.collapsed")).toHaveCount(0);
  // reload, expect still unchecked
  await page.reload();
  await expect(page.locator('input[data-fold="tool"]')).not.toBeChecked();
});
```

- [ ] **Step 20.3: Run, expect PASS**

Run: `npx playwright test`
Expected: 5 e2e tests pass total.

- [ ] **Step 20.4: Run full test suite as commit gate**

Run: `npm test && npx playwright test`
Expected: all unit, integration, e2e pass.

- [ ] **Step 20.5: Commit**

```bash
git add test/e2e/search-flow.spec.js test/e2e/fold-flow.spec.js
git commit -m "test: add search-flow and fold-flow e2e"
```

---

## Phase 7 — Docs

### Task 21: docs/debugging.md + README expansion

**Files:**
- Create: `docs/debugging.md`
- Modify: `README.md`

- [ ] **Step 21.1: Write `docs/debugging.md`**

```markdown
# Dialog-Analysis Debugging Guide

This guide is written for both humans and AI agents iterating on this codebase.

## 1. Run locally

\`\`\`
npm install
npm test                    # unit + integration
npx playwright test         # e2e (requires `npx playwright install chromium` first)
node bin/cli.js --no-open   # start without launching browser
\`\`\`

`DEBUG_DA=1 node bin/cli.js` enables verbose logging to stderr (does not pollute stdout).
`--port 0` lets the OS allocate a port; the chosen port is printed as the first stdout line.

## 2. Code map

\`\`\`
bin/cli.js                  argv → server → browser
src/server.js               http router (all GET, 127.0.0.1 only)
src/routes/                 list-dir, sessions, session, search
src/parser/                 jsonl-stream, events, metadata, extract-text, subagent-index, search
src/public/                 static assets; session.html and index.html
src/public/js/renderers/    one file per event type (user/assistant/thinking/tool/compact/system-note)
src/public/js/fold-toggles  per-type toggle group (default + localStorage)
\`\`\`

Every file capped at ~200 lines. New event types must be added in two symmetric places: `src/parser/events.js` and `src/public/js/renderers/<type>.js`.

## 3. How to add a new event type

1. Add classification branch in `src/parser/events.js` `classifyEvent()`.
2. Add field extraction in `src/parser/extract-text.js` if it carries searchable text.
3. Create `src/public/js/renderers/<type>.js` exporting a render function.
4. Wire it into `src/public/js/session.js` `renderEvent()`.
5. If user-visible, add a toggle in `src/public/session.html` and a default in `src/public/js/fold-toggles.js` `DEFAULT`.
6. Add a fixture line to `test/fixtures/basic.jsonl` and a unit test in `test/unit/events.test.js`.

## 4. How to change search scope

Edit `src/parser/extract-text.js` `pieces()` to add or remove fields. Then add a unit test in `test/unit/extract-text.test.js`.

## 5. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE` on startup | port 5173..5183 all taken | `-p <other>` or kill the holder (`lsof -i :5173`) |
| CDN blocked, page blank | network policy strips jsdelivr | Replace 4 CDN script lines in `session.html` with `/vendor/*` paths and drop the same files into `src/public/vendor/` |
| Big jsonl renders slowly | sync DOM write | Split `renderEvent()` mapping into chunks via `requestIdleCallback` |
| Search slow | scanning ~30 large files synchronously per request | enable `DEBUG_DA=trace` to find the slow file; consider adding `--max-files` flag |
| `e2e tests time out` | server boot didn't print listening line | Increase poll count in `test/e2e/helpers.js` or check server logs in `child.stderr` |

## 6. AI iteration checklist

When asking an AI to modify this codebase, paste this list at the end of the prompt:

- [ ] Updated relevant unit fixtures and tests
- [ ] Recorded any new design decisions in `docs/superpowers/specs/`
- [ ] Ran `npm test && npx playwright test` and they pass
- [ ] No new runtime dependencies added (or justified the addition)
- [ ] No file exceeds ~200 lines (split if so)
- [ ] No ad-hoc backwards-compat shims for removed code

## 7. Why these design decisions

| Decision | Reason |
|---|---|
| Bind 127.0.0.1 only | Local tool, never expose dev sessions to network |
| GET-only API | Read-only tool, no mutation surface |
| LRU(50) for metadata, no content cache | Metadata is tiny + reused; content is huge + ephemeral; user explicitly opted out of content cache |
| Metadata cached by `(file, mtime, size)` | Auto-invalidates when jsonl is rewritten by Claude |
| Search Enter-or-button only | Files large; debounce wastes IO |
| Subagent-only hits show parent | Context required to interpret a sidechain |
| Per-type fold toggles | Different users care about different layers |
| No build step for frontend | Reduce surface area; CLI users don't run npm build |
| One renderer file per event type | Symmetry with parser events; isolating change blast-radius |
```

- [ ] **Step 21.2: Expand `README.md`**

Replace `README.md`:

```markdown
# claude-dialog-analyzer

Local browser tool for analyzing Claude Code session JSONL files.

## Install

\`\`\`
npm i -g claude-dialog-analyzer
\`\`\`

## Usage

\`\`\`
claude-dialog-analyzer                       # default ~/.claude/projects
claude-dialog-analyzer -d /path/to/project   # specific directory
claude-dialog-analyzer -p 8080               # specific port
claude-dialog-analyzer --no-open             # do not open browser (CI/SSH)
\`\`\`

## Features

- Lists Claude Code sessions with rounds, token usage, first-message summary, and subagents.
- Full-text search across sessions and subagents; subagent matches surface the parent session for context.
- Per-event-type fold toggles in the detail view (thinking / tool / system / subagent / askUserQuestion), persisted in localStorage.
- Pure local: binds to 127.0.0.1, GET-only, no network egress beyond CDN-loaded markdown libs (offline fallback in `src/public/vendor/`).

## Development

\`\`\`
npm install
npm test                  # unit + integration
npx playwright install chromium
npx playwright test       # e2e
\`\`\`

See [`docs/debugging.md`](docs/debugging.md) for code map, common issues, and AI iteration guidance.
See [`docs/superpowers/specs/`](docs/superpowers/specs/) for design decisions.

## License

MIT
```

- [ ] **Step 21.3: Final test gate**

Run: `npm test && npx playwright test`
Expected: all green.

- [ ] **Step 21.4: Commit**

```bash
git add docs/debugging.md README.md
git commit -m "docs: add debugging guide and expand README"
```

---

## Self-Review

After all 21 tasks complete, the spec coverage is:

| Spec section | Covered by |
|---|---|
| §0 目标与非目标 | Tasks 1–21 (whole plan) |
| §1 项目布局 | Task 16 + per-feature creates |
| §2 CLI | Tasks 1, 15 |
| §3.1 list-dir | Task 11 |
| §3.2 sessions | Task 12 |
| §3.3 session/subagent | Task 13 |
| §3.4 search | Task 14 |
| §3.5 search semantics | Tasks 9, 14 |
| §3.6 cache strategy | Tasks 12, 14 (no content cache) |
| §4 parser rules | Tasks 6, 7, 8 |
| §5 security | Tasks 2, 10 |
| §6.1 list page | Task 18 |
| §6.2 detail page | Task 17 |
| §6.3 routing | Tasks 17, 18 |
| §7 error handling | Tasks 10, 13, 14 |
| §8 testing | Phase 6 + per-task unit/integration |
| §9 debugging guide | Task 21 |
| §10 relation to legacy | Task 16 |

---

**Plan complete.** Ready to invoke executing-plans (inline) or subagent-driven-development (recommended).
