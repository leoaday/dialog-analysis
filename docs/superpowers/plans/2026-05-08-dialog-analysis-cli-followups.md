# Dialog-Analysis CLI Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven gaps identified by the final code review of the `feat/cli-rewrite` branch. Each item is small and independent; they can be tackled in any order, but this plan orders them by impact (security/correctness first, polish last).

**Architecture:** No architectural change. Each task is a localized edit to existing files plus minimal tests where applicable.

**Source review:** Final code review at end of `docs/superpowers/plans/2026-05-08-dialog-analysis-cli.md` execution session.

**Branch:** Continue on `feat/cli-rewrite` if not yet merged, else cut a new `feat/cli-followups` branch from `master`.

---

## File Structure

This plan adds three new files and modifies eight existing ones:

```
src/log.js                                  # NEW: DEBUG_DA verbose/trace logger
src/public/vendor/marked.min.js             # NEW: offline fallback copy
src/public/vendor/purify.min.js             # NEW: offline fallback copy
src/public/vendor/highlight.min.js          # NEW: offline fallback copy
src/public/vendor/github.min.css            # NEW: offline fallback hljs theme
test/unit/log.test.js                       # NEW: log helper unit test
src/parser/search.js                        # MODIFY: route via log helper, expose truncated up the call site
src/routes/search.js                        # MODIFY: include truncated per session and per subagent in response
src/public/js/dir-picker.js                 # MODIFY: escape initialPath and e.name; add escapeHtml helper
src/public/js/list.js                       # MODIFY: rely on dir-picker (no change here unless needed)
src/public/js/session.js                    # MODIFY: also rely on response.truncated for banner hint (optional)
src/public/index.html                       # MODIFY: disable pick-native button when API unavailable, add title tooltip
src/public/styles.css                       # MODIFY: add .kind-subagent theming + button:disabled styling
src/public/session.html                     # MODIFY: add a tiny "[offline mode]" data-attribute hook (no behavior change)
```

---

## Task A: dir-picker HTML attribute escape (security hygiene)

**Files:**
- Modify: `src/public/js/dir-picker.js`

The current `showDirPicker` injects `initialPath` directly into a `value="..."` attribute and `e.name` into `innerHTML` — a path containing `"` would break out of the attribute, and entry names with `<` or `&` are not safe to interpolate.

- [ ] **Step A.1: Add escapeHtml at top of file**

Insert after the import line:

```javascript
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
```

- [ ] **Step A.2: Escape initialPath in the attribute**

Change:
```javascript
<input id="m-path" type="text" value="${initialPath || ""}" />
```
to:
```javascript
<input id="m-path" type="text" value="${escapeHtml(initialPath || "")}" />
```

- [ ] **Step A.3: Escape e.name in the list item**

Find the loop building `<span>${label}</span>...` items. The current line is:
```javascript
const item = mkItem(`📁 ${e.name}`, "dir", `${p}/${e.name}`.replace(/\/+/g, "/"), tag);
```

Change to:
```javascript
const item = mkItem(`📁 ${escapeHtml(e.name)}`, "dir", `${p}/${e.name}`.replace(/\/+/g, "/"), tag);
```

(The path argument used for navigation does NOT need HTML escaping since it's stored in a JS variable, not interpolated into HTML.)

- [ ] **Step A.4: Verify**

Run: `npm test && npx playwright test --config=test/e2e/playwright.config.js`
Expected: 56/56 + 5/5 still pass.

For a manual check, in dev console after CLI start:
```javascript
showDirPicker('/path/with/"<&">/in/it')
```
The `<input>` should not visibly break.

- [ ] **Step A.5: Commit**

```bash
git add src/public/js/dir-picker.js
git commit -m "fix: escape user-controlled path strings in dir-picker html"
```

---

## Task B: surface `truncated` flag from search

**Files:**
- Modify: `src/routes/search.js`
- Modify: `test/integration/api.test.js`

`searchFile()` already returns `{ matches, truncated }`. The route discards `truncated`. Spec says "超出截断 `truncated: true`" must reach the client.

- [ ] **Step B.1: Write failing assertion**

Append a test to `test/integration/api.test.js`:

```javascript
test("search reports per-file truncated flag when matches exceed cap", async () => {
  // synthesize a file with > 50 matches inline
  const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "da-trunc-"));
  const file = join(dir, "many.jsonl");
  // 60 user lines each containing the literal "needle"
  const lines = Array.from({ length: 60 }, (_, i) =>
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: `needle ${i}` }] }, uuid: `u${i}` })
  );
  writeFileSync(file, lines.join("\n") + "\n");
  try {
    const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(dir)}&q=needle`);
    assert.equal(r.status, 200);
    const body = await r.json();
    const s = body.sessions[0];
    assert.equal(s.sessionMatches.length, 50);
    assert.equal(s.truncated, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step B.2: Run, expect FAIL**

Run: `npm run test:integration`
Expected: assertion failure on `s.truncated === true` (the field doesn't exist on the response).

- [ ] **Step B.3: Plumb the field through**

In `src/routes/search.js`, where the per-session result is assembled:

OLD:
```javascript
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
```

NEW (add `truncated` and per-subagent truncation):
```javascript
out.push({
  sessionId,
  file,
  mtime: st.mtime.toISOString(),
  size: st.size,
  hitInSession: sessionRes.matches.length > 0,
  hitInSubagent: subagentMatches.length > 0,
  sessionMatches: sessionRes.matches,
  truncated: sessionRes.truncated || subagentMatches.some((m) => m.truncated),
  subagentMatches,
  rounds: meta.rounds,
  tokens: meta.tokens,
  firstUserSummary: meta.firstUserSummary,
  subagentCount: subs.length,
  subagents: subs,
});
```

Also update the inner subagent loop:

OLD:
```javascript
if (r.matches.length) {
  subagentMatches.push({ agentId: s.agentId, file: s.file, count: r.matches.length, snippets: r.matches });
}
```

NEW:
```javascript
if (r.matches.length) {
  subagentMatches.push({ agentId: s.agentId, file: s.file, count: r.matches.length, snippets: r.matches, truncated: r.truncated });
}
```

- [ ] **Step B.4: Run, expect PASS**

Run: `npm run test:integration`
Expected: all integration tests pass (12 → 13 with the new one).

- [ ] **Step B.5: Commit**

```bash
git add src/routes/search.js test/integration/api.test.js
git commit -m "feat: expose per-file truncated flag in /api/search response"
```

---

## Task C: DEBUG_DA logging helper

**Files:**
- Create: `src/log.js`
- Create: `test/unit/log.test.js`
- Modify: `src/parser/search.js` (call trace logger when matches found)
- Modify: `bin/cli.js` (call verbose logger on startup)

- [ ] **Step C.1: Write failing tests**

`test/unit/log.test.js`:

```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { log } from "../../src/log.js";

test("log() respects DEBUG_DA env levels", () => {
  // capture stderr
  const original = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = (s) => { captured.push(String(s)); return true; };
  try {
    process.env.DEBUG_DA = "";
    log.info("ignored");
    assert.equal(captured.length, 0);

    process.env.DEBUG_DA = "1";
    log.info("seen");
    log.trace("not at info level");
    assert.equal(captured.length, 1);
    assert.match(captured[0], /seen/);

    process.env.DEBUG_DA = "trace";
    captured.length = 0;
    log.info("info-here");
    log.trace("trace-here");
    assert.equal(captured.length, 2);
  } finally {
    process.stderr.write = original;
    delete process.env.DEBUG_DA;
  }
});
```

- [ ] **Step C.2: Run, expect FAIL** (cannot find module)

- [ ] **Step C.3: Implement**

`src/log.js`:

```javascript
function level() {
  const v = (process.env.DEBUG_DA || "").toLowerCase();
  if (v === "trace") return 2;
  if (v === "1" || v === "true" || v === "info") return 1;
  return 0;
}

function emit(prefix, args) {
  const line = `[da:${prefix}] ${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`;
  process.stderr.write(line);
}

export const log = {
  info(...args) { if (level() >= 1) emit("info", args); },
  trace(...args) { if (level() >= 2) emit("trace", args); },
};
```

- [ ] **Step C.4: Wire into bin/cli.js**

Add to imports in `bin/cli.js`:
```javascript
import { log } from "../src/log.js";
```

After the `process.stdout.write(...)` listening line:
```javascript
log.info("starting", { dir, port: server.port });
```

And in the `shutdown` handler:
```javascript
const shutdown = async () => { log.info("shutdown signal"); await server.close(); process.exit(0); };
```

- [ ] **Step C.5: Wire into search.js**

Add to imports in `src/parser/search.js`:
```javascript
import { log } from "../log.js";
```

In `searchFile`, after the `for await` loop completes (just before `return { matches, truncated }`), add:
```javascript
log.trace("searched", { filePath, matches: matches.length, truncated });
```

- [ ] **Step C.6: Verify**

Run: `npm test`
Expected: 56 + 1 = 57 unit/integration pass.

Manual smoke (no automation needed):
```bash
DEBUG_DA=1 node bin/cli.js --no-open -p 5199 2>&1 | head -3
# expect "[da:info] starting ..." line on stderr (mixed with stdout listening line)
```

- [ ] **Step C.7: Commit**

```bash
git add src/log.js test/unit/log.test.js bin/cli.js src/parser/search.js
git commit -m "feat: add DEBUG_DA logging (info/trace levels)"
```

---

## Task D: kind-subagent theming

**Files:**
- Modify: `src/public/styles.css`

The `session.js` adds `class="kind-subagent"` to `<body>` when the URL is `?kind=subagent`, but CSS has no rule for it. Add a subtle purple accent.

- [ ] **Step D.1: Append to `src/public/styles.css`**

```css
/* Subagent detail page accent */
body.kind-subagent header.toolbar { background: #f5f3ff; border-bottom-color: #c4b5fd; }
body.kind-subagent header.toolbar h1::before { content: "subagent · "; color: #7c3aed; font-weight: 600; }
```

- [ ] **Step D.2: Verify visually (no automated test)**

Run: `npm test && npx playwright test --config=test/e2e/playwright.config.js`
Expected: 57 + 5 still pass (no regression).

- [ ] **Step D.3: Commit**

```bash
git add src/public/styles.css
git commit -m "feat: add subagent kind theming (light purple toolbar)"
```

---

## Task E: showDirectoryPicker fallback — disabled button + tooltip

**Files:**
- Modify: `src/public/index.html`
- Modify: `src/public/js/list.js`

Replace the alert-on-unsupported pattern with a `disabled` button carrying a `title` tooltip. Spec section 6.1: "不可用则禁用 + tooltip 仅 Chrome/Edge 支持".

- [ ] **Step E.1: Modify the button in `src/public/index.html`**

Change:
```html
<button id="pick-native">浏览器选目录</button>
```
to:
```html
<button id="pick-native" title="浏览器原生目录选择器">浏览器选目录</button>
```

- [ ] **Step E.2: Modify the click handler in `src/public/js/list.js`**

Replace the entire `pick-native` handler:

OLD:
```javascript
document.getElementById("pick-native").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) { alert("仅 Chrome/Edge 支持"); return; }
  try {
    const handle = await window.showDirectoryPicker();
    alert(`已选择目录: ${handle.name}\n请在弹层中输入完整绝对路径以继续。`);
  } catch {}
});
```

NEW:
```javascript
const pickNative = document.getElementById("pick-native");
if (!window.showDirectoryPicker) {
  pickNative.disabled = true;
  pickNative.title = "仅 Chrome/Edge 支持";
} else {
  pickNative.addEventListener("click", async () => {
    try {
      const handle = await window.showDirectoryPicker();
      const guess = (currentDir ? currentDir.replace(/\/[^/]+$/, "") : "/Users") + "/" + handle.name;
      const confirmed = await showDirPicker(guess);
      if (confirmed) goto(confirmed);
    } catch { /* user cancelled */ }
  });
}
```

(The new behavior: native picker gives us a hint name; we open the server-side dir picker pre-populated with a best-guess absolute path, letting the user confirm. No more alert popups.)

- [ ] **Step E.3: Verify**

Run: `npm test && npx playwright test --config=test/e2e/playwright.config.js`
Expected: 57 + 5 pass (no e2e covers this yet — adding one is optional).

Manual: open the page in Chrome (button enabled) and Firefox/Safari (button disabled + tooltip).

- [ ] **Step E.4: Commit**

```bash
git add src/public/index.html src/public/js/list.js
git commit -m "ui: replace alert fallback with disabled+tooltip for native dir picker"
```

---

## Task F: vendor offline fallback

**Files:**
- Create: `src/public/vendor/marked.min.js`
- Create: `src/public/vendor/purify.min.js`
- Create: `src/public/vendor/highlight.min.js`
- Create: `src/public/vendor/github.min.css`
- Modify: `src/public/session.html`

Download minified versions of the three runtime libs (matching versions used in CDN script tags) and the highlight.js theme CSS into `src/public/vendor/`. Document the offline switch.

- [ ] **Step F.1: Download files**

```bash
cd src/public/vendor
curl -L -o marked.min.js https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js
curl -L -o purify.min.js https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js
curl -L -o highlight.min.js https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js
curl -L -o github.min.css https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css
cd -
ls -la src/public/vendor/
# expect 4 non-empty files plus the .gitkeep
```

- [ ] **Step F.2: Update `src/public/session.html` with the switch**

Replace the four `<script>`/`<link>` block plus the comment:

OLD:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css" />
<script src="https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js"></script>
<!-- offline fallback: replace above 4 lines with /vendor/* paths -->
```

NEW:
```html
<!-- ONLINE (default): faster initial parse via CDN. -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css" />
<script src="https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js"></script>

<!-- OFFLINE: comment out the four lines above and uncomment the four below.
<link rel="stylesheet" href="/vendor/github.min.css" />
<script src="/vendor/marked.min.js"></script>
<script src="/vendor/purify.min.js"></script>
<script src="/vendor/highlight.min.js"></script>
-->
```

- [ ] **Step F.3: Verify offline mode actually works**

Manual test (best done in a browser with network throttling):
1. Switch to offline-mode lines in `session.html`
2. Start CLI, navigate to a session detail page
3. Confirm markdown still renders (i.e., `marked`, `DOMPurify`, `hljs` all loaded from `/vendor/`)
4. Switch the lines back to online

For automated verification, append to `test/integration/api.test.js`:

```javascript
test("vendor static files are served", async () => {
  for (const f of ["marked.min.js", "purify.min.js", "highlight.min.js", "github.min.css"]) {
    const r = await fetch(`${base}/vendor/${f}`);
    assert.equal(r.status, 200, `vendor/${f} should serve`);
    const text = await r.text();
    assert.ok(text.length > 1000, `vendor/${f} should be non-trivial`);
  }
});
```

- [ ] **Step F.4: Run, expect PASS**

Run: `npm run test:integration`
Expected: 14/14 pass (12 + 1 from Task B + 1 new).

- [ ] **Step F.5: Commit**

```bash
git add src/public/vendor/marked.min.js src/public/vendor/purify.min.js src/public/vendor/highlight.min.js src/public/vendor/github.min.css src/public/session.html test/integration/api.test.js
git commit -m "feat: vendor marked/purify/highlight.js for offline mode"
```

---

## Task G: multi-file route ETags

**Files:**
- Modify: `src/routes/list-dir.js`
- Modify: `src/routes/sessions.js`
- Modify: `src/routes/search.js`
- Modify: `test/integration/api.test.js`

For directory-level endpoints, compute a weak ETag from the max mtime + count of relevant entries. This is a coarse digest — when ANY contained jsonl changes, the ETag flips, which is the desired invalidation behavior.

- [ ] **Step G.1: Add a small helper** (decision: inline per route, since each route has different "relevant entries" semantics)

For each route, after computing the response body but before sending, build an ETag from a stable digest. Pattern:

```javascript
function buildDirEtag(entries) {
  // entries is array of { mtime: ISO, file?: ... }; reduce to max mtime + count
  let maxMtime = "";
  for (const e of entries) {
    if (e.mtime && e.mtime > maxMtime) maxMtime = e.mtime;
  }
  return `W/"${entries.length}-${maxMtime}"`;
}
```

Add this `buildDirEtag` as a top-level helper in `src/routes/sessions.js` and `src/routes/search.js`. For `list-dir`, the relevant entries are different (dir entries with mtime), so use a similar in-place computation.

- [ ] **Step G.2: Apply to /api/sessions**

After `out.sort(...)` and before `send(res, 200, ...)`:

```javascript
const etag = buildDirEtag(out);
if (req.headers["if-none-match"] === etag) {
  res.writeHead(304, { ETag: etag });
  return res.end();
}
send(res, 200, { dir, sessions: out }, { ETag: etag });
```

(Replace the trailing `send(res, 200, { dir, sessions: out });`.)

- [ ] **Step G.3: Apply to /api/search**

Same pattern, but the digest also includes `q` and `regex` (different queries against the same dir produce different responses):

```javascript
function buildSearchEtag(out, q, regex) {
  let maxMtime = "";
  for (const e of out) if (e.mtime > maxMtime) maxMtime = e.mtime;
  return `W/"${out.length}-${maxMtime}-${encodeURIComponent(q)}-${regex ? 1 : 0}"`;
}
```

After computing `out` and sorting:

```javascript
const etag = buildSearchEtag(out, q, regex);
if (req.headers["if-none-match"] === etag) {
  res.writeHead(304, { ETag: etag });
  return res.end();
}
send(res, 200, { dir, q, regex, total: out.length, sessions: out }, { ETag: etag });
```

- [ ] **Step G.4: Apply to /api/list-dir**

In `src/routes/list-dir.js`, build ETag from entries (each entry has `mtime`):

```javascript
function buildEtag(entries) {
  let maxMtime = "";
  for (const e of entries) if (e.mtime > maxMtime) maxMtime = e.mtime;
  return `W/"${entries.length}-${maxMtime}"`;
}
```

Before the trailing `send(res, 200, ...)`:

```javascript
const etag = buildEtag(out);
if (req.headers["if-none-match"] === etag) {
  res.writeHead(304, { ETag: etag });
  return res.end();
}
send(res, 200, { path: p, parent: dirname(p) === p ? null : dirname(p), entries: out }, { ETag: etag });
```

- [ ] **Step G.5: Add integration tests**

Append to `test/integration/api.test.js`:

```javascript
test("/api/list-dir returns ETag and honors If-None-Match", async () => {
  const r1 = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`);
  const etag = r1.headers.get("ETag");
  assert.match(etag || "", /W\/".+"/);
  const r2 = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});

test("/api/sessions returns ETag and honors If-None-Match", async () => {
  const r1 = await fetch(`${base}/api/sessions?dir=${encodeURIComponent(SESSIONS_DIR)}`);
  const etag = r1.headers.get("ETag");
  assert.match(etag || "", /W\/".+"/);
  const r2 = await fetch(`${base}/api/sessions?dir=${encodeURIComponent(SESSIONS_DIR)}`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});

test("/api/search returns ETag and honors If-None-Match", async () => {
  const r1 = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=second%20session%20start`);
  const etag = r1.headers.get("ETag");
  assert.match(etag || "", /W\/".+"/);
  const r2 = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=second%20session%20start`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});
```

- [ ] **Step G.6: Run, expect PASS**

Run: `npm run test:integration`
Expected: 17/17 pass (14 + 3 new).

- [ ] **Step G.7: Commit**

```bash
git add src/routes/list-dir.js src/routes/sessions.js src/routes/search.js test/integration/api.test.js
git commit -m "feat: ETag/304 on directory-level routes (list-dir, sessions, search)"
```

---

## Task H: final test gate + branch wrap

- [ ] **Step H.1: Full suite**

Run: `npm test && npx playwright test --config=test/e2e/playwright.config.js`
Expected: 57 unit/integration + 5 e2e = 62 tests pass.

- [ ] **Step H.2: Manual sanity check**

```bash
node bin/cli.js --no-open -p 5199 >/tmp/cli.log 2>&1 &
sleep 1.5
# 1. list-dir works (with ETag)
curl -sI "http://127.0.0.1:5199/api/list-dir?path=$(pwd)/test/fixtures" | grep -i etag
# 2. /vendor/marked.min.js serves
curl -sI "http://127.0.0.1:5199/vendor/marked.min.js" | head -2
# 3. session detail loads (kind=subagent renders header tinted purple — visual check only)
curl -s "http://127.0.0.1:5199/session.html?file=$(pwd)/test/fixtures/with-subagents/parent/subagents/agent-x.jsonl&kind=subagent" | grep -c kind-subagent
pkill -f 'bin/cli.js'
```

- [ ] **Step H.3: Final review readiness**

Branch ready for either:
- Merge to `master` (if you want to ship as one big change)
- Stay on branch for further user review

Commit history will show the original 27 + 7 follow-up commits.

---

## Self-Review

Spec coverage:
| Original review issue | Task that addresses it |
|---|---|
| dir-picker unescaped HTML | Task A |
| `truncated` not in /api/search response | Task B |
| `DEBUG_DA` no-op | Task C |
| `.kind-subagent` body class unstyled | Task D |
| `showDirectoryPicker` uses alert instead of disabled button | Task E |
| `vendor/` directory empty | Task F |
| ETag absent on multi-file routes | Task G |

All 7 follow-ups are tasks A-G. No placeholder steps. Each task ends with a commit and a test-suite gate. Scope is limited to the items the final review flagged — no scope creep into other features.
