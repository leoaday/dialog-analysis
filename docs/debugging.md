# Dialog-Analysis Debugging Guide

This guide is written for both humans and AI agents iterating on this codebase.

## 1. Run locally

```
npm install
npm test                    # unit + integration
npx playwright test         # e2e (requires `npx playwright install chromium` first)
node bin/cli.js --no-open   # start without launching browser
```

`DEBUG_DA=1 node bin/cli.js` enables verbose logging to stderr (does not pollute stdout).
`--port 0` lets the OS allocate a port; the chosen port is printed as the first stdout line.

## 2. Code map

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

## 3. How to add a new event type

1. Add classification branch in `src/parser/events.js` (`classifyEvent` and helpers if needed).
2. Add field extraction in `src/parser/extract-text.js` if it carries searchable text.
3. Create `src/public/js/renderers/<type>.js` exporting a render function.
4. Wire it into `src/public/js/session.js` `renderEvent()` (or `dispatchToolUse()` if it's a tool).
5. Add the kind to `src/public/js/filter-chips.js` `KINDS` and `DEFAULTS`.
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

## 7. Filter chips behavior

Each chip has two independent controls:
- **Chip body click** (anywhere except the checkbox): toggles `visible` (show/hide all blocks of that kind via CSS `display:none`).
- **Checkbox click** (right side of chip): toggles `expanded` (whether `<details>` blocks of that kind start open or folded). Click is `stopPropagation`'d so it doesn't trigger the chip body.

State is persisted to `localStorage["da:filter:v2"]` as an object: `{ kind: { visible: bool, expanded: bool } }`. v2.1 string state ("open"/"folded"/"hidden") is auto-migrated on first load: `"hidden" → {visible:false, expanded:false}`, `"open" → {visible:true, expanded:true}`, `"folded" → {visible:true, expanded:false}`.

Defaults are in `src/public/js/filter-chips.js` `DEFAULTS_RICH` (13 kinds; `system` and `unknown` default to `{visible:false}`).

**Performance model:** chip clicks update only the clicked kind. Body data attribute (`data-show-<kind>`) toggles `display:none` via CSS rules generated at page load. `<details open>` state updates use a single batched query limited to that kind. Chip body click also triggers scroll-anchor capture/restore (see section 8).

**Tool input/output sub-toggles**: separate global toggles to the right of the chip row (in their own row). State persists to `localStorage["da:sub-toggles:v1"]`. Orthogonal to chips.

**Per-card override**: clicking any card's summary toggles just that card. Chip changes (visibility or expand) will subsequently override per-card state on next chip click.

**Keyboard**: chips are `role="button"` with `tabindex="0"` — `Space`/`Enter` triggers chip body click. Checkbox uses native keyboard handling.

## 8. Scroll anchor (filter mutation)

When a chip click changes which messages are visible, the viewport would naturally jump because messages above the fold disappear and lower content shifts up. To prevent this, `src/public/js/scroll-anchor.js` provides:

- `captureAnchor()`: finds the first visible `.msg-row` whose `top >= 0` (i.e. at or below viewport top), records its `data-idx` and current `top`.
- `restoreAnchor(anchor)`: locates the same row by `data-idx`. If hidden, walks forward to the next visible sibling. Adjusts `window.scrollBy(...)` to put that row back at its captured top.

Wired in `bindChips(...)` via `{beforeMutate, afterMutate}` hooks. Each `.msg-row` carries `data-idx="<event-index>"` set by `wrapMsgRow()` in `session.js`.

For sessions with hundreds of events the anchor lookup is O(N) on `getBoundingClientRect`; on Chrome 118 with 583 rows this is ~6ms — fast enough not to delay the chip click.

## 9. Timeline-as-msg-row layout

Each event renders as a `.msg-row` containing two grid cells: a `.ts` (timestamp) on the left and a `.msg-cell` (the content card) on the right. The `.msg-row` participates in the outer `.convo-grid` via CSS subgrid (with `display: contents` fallback). Filter chip hiding affects the entire `.msg-row` via CSS, so timestamps stay aligned to their cards automatically.

The `.ts` element uses `position: sticky; top: 14px;` so for tall cards the timestamp stays visible at the card's top while scrolling.

Events without a `timestamp` field render an empty `.ts` (no time, no border-left dot — just empty space).

Cross-day boundaries insert a `.day-divider` row spanning both columns: `── 2026-05-09 ──`.

## 10. Why these design decisions

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
| Shared `metadata-cache.js` between sessions and search | Avoid re-streaming the same file in `/api/sessions` and `/api/search` |
