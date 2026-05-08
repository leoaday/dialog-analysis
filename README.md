# claude-dialog-analyzer

Local browser tool for analyzing Claude Code session JSONL files.

## Install

```
npm i -g claude-dialog-analyzer
```

## Usage

```
claude-dialog-analyzer                       # default ~/.claude/projects
claude-dialog-analyzer -d /path/to/project   # specific directory
claude-dialog-analyzer -p 8080               # specific port
claude-dialog-analyzer --no-open             # do not open browser (CI/SSH)
```

## Features

- Lists Claude Code sessions with rounds, token usage, first-message summary, and subagents.
- Full-text search across sessions and subagents; subagent matches surface the parent session for context.
- Per-event-type fold toggles in the detail view (thinking / tool / system / subagent / askUserQuestion), persisted in localStorage.
- Pure local: binds to 127.0.0.1, GET-only, no network egress beyond CDN-loaded markdown libs (offline fallback in `src/public/vendor/`).

## Development

```
npm install
npm test                  # unit + integration
npx playwright install chromium
npx playwright test       # e2e
```

See [`docs/debugging.md`](docs/debugging.md) for code map, common issues, and AI iteration guidance.
See [`docs/superpowers/specs/`](docs/superpowers/specs/) for design decisions.

## License

MIT
