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
src/parser/                 jsonl-stream, events (12 kinds), metadata, extract-text, subagent-index, search, metadata-cache
src/public/                 static assets; session.html and index.html
src/public/js/renderers/    one file per event/tool type
                            user, assistant, thinking, tool, tool-edit, tool-read, tool-todowrite,
                            tool-bash, tool-glob-grep, tool-web, ask, tool-rejection, compact, system-note
src/public/js/filter-chips  three-state filter (open / folded / hidden) per kind, localStorage
src/public/js/timeline      left-column timeline (browser-local TZ, delta to previous event)
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

Each kind chip cycles through three states on click:
- **open**: shown, all `<details>` inside open
- **folded**: shown, all `<details>` inside closed
- **hidden**: removed from layout (`display: none`)

State persists to `localStorage["da:filter:v2"]`. Defaults are in `src/public/js/filter-chips.js` `DEFAULTS`. The chip control supersedes the old single-checkbox toggles from v1.

Per-block override: while a chip is in "folded" state, you can click an individual `<details>` summary inside any block to expand just that one (DOM state changes locally; chip global state does not flip).

## 8. Why these design decisions

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
