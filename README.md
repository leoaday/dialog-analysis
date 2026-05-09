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

## Releasing

发布新版本：

```bash
# 1. 在 master 上确保所有要发布的代码已合并并 push
git checkout master && git pull

# 2. 打 tag（格式 vX.Y.Z）
git tag v0.2.0
git push origin v0.2.0

# 3. 等 GitHub Action 跑完（~3 分钟首次，~1 分钟后续），自动产出：
#    - claude-dialog-analyzer-0.2.0.tgz
#    - claude-dialog-analyzer-0.2.0.zip
#    - checksums.sha256
#    并创建 GitHub Release（含自动生成的 release notes）
```

如果 tag 版本与 `package.json` 不一致，CI 会自动同步 `package.json` 并 push 回 master。
此时本地 master 落后 1 commit，记得 `git pull` 后再继续开发。

如果 tag 不在 master 分支上，CI 会拒绝发布并报错。

## License

MIT
