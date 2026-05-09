# GitHub Release CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the spec at `docs/superpowers/specs/2026-05-09-github-release-ci-design.md` — push `v*.*.*` tag triggers GitHub Action that runs full test suite, builds tarball + zip + sha256, creates GitHub Release with auto-generated notes.

**Architecture:** Single workflow file at `.github/workflows/release.yml` (~80 lines yaml). README chapter documents the user-facing flow.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`, `softprops/action-gh-release@v2`). No new project dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-09-github-release-ci-design.md`](../specs/2026-05-09-github-release-ci-design.md)

---

## File Structure

```
.github/workflows/release.yml         CREATE
README.md                             MODIFY (append "Releasing" section before License)
```

**Branch:** `feat/ci-release` (already created from master).

**Validation note:** This plan introduces no business-logic code. CI workflow correctness is validated by:
1. yaml syntax check (via `python3 -c` or actionlint if available)
2. Manual end-to-end test by pushing a throwaway tag (`v0.0.0-test`), observing the action, then deleting the tag + draft release
3. First real release (`v0.2.0` or whatever the next version is) is the production smoke test

---

## Task 1: Create release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1.1: Create directory and file**

Run:
```bash
cd /Users/leon/Documents/Claude/Projects/dialog-analysis
mkdir -p .github/workflows
```

- [ ] **Step 1.2: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: [ "v*.*.*" ]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Extract version from tag
        run: |
          echo "TAG=${GITHUB_REF_NAME}" >> $GITHUB_ENV
          echo "VERSION=${GITHUB_REF_NAME#v}" >> $GITHUB_ENV

      - name: Verify tag is on master
        run: |
          git fetch origin master --depth=0 || git fetch origin master
          if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/master; then
            echo "::error::Tag $TAG is not on master branch. Release aborted."
            exit 1
          fi

      - name: Sync package.json version
        run: |
          CURRENT=$(node -p "require('./package.json').version")
          if [ "$CURRENT" != "$VERSION" ]; then
            npm version "$VERSION" --no-git-tag-version
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add package.json package-lock.json
            git commit -m "chore: sync package.json to $TAG"
            git push origin HEAD:master
          fi

      - name: Install dependencies
        run: npm ci

      - name: Run unit + integration tests
        run: npm test

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run e2e tests
        run: npx playwright test --config=test/e2e/playwright.config.js

      - name: Build artifacts
        run: |
          npm pack
          mkdir -p dist
          tar -xzf "claude-dialog-analyzer-${VERSION}.tgz" -C dist
          ( cd dist && zip -r "../claude-dialog-analyzer-${VERSION}.zip" package )
          sha256sum "claude-dialog-analyzer-${VERSION}.tgz" "claude-dialog-analyzer-${VERSION}.zip" > checksums.sha256
          ls -la *.tgz *.zip checksums.sha256

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            claude-dialog-analyzer-${{ env.VERSION }}.tgz
            claude-dialog-analyzer-${{ env.VERSION }}.zip
            checksums.sha256
```

- [ ] **Step 1.3: Validate yaml syntax**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "yaml OK"
```
Expected output: `yaml OK`. If python yaml module unavailable, use:
```bash
node -e "require('js-yaml')" 2>/dev/null && node -e "console.log(JSON.stringify(require('js-yaml').load(require('fs').readFileSync('.github/workflows/release.yml','utf8'))).slice(0,80))" || echo "js-yaml unavailable; rely on GitHub Actions parser at push time"
```
Either approach confirms basic syntax. The actual semantic validation happens when GitHub parses the file on first tag push.

- [ ] **Step 1.4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add Release workflow (tag → tests → tarball+zip+sha256 → GitHub Release)"
```

---

## Task 2: README "Releasing" section

**Files:**
- Modify: `README.md`

- [ ] **Step 2.1: Read current README to find insertion point**

Read `README.md`. The existing structure ends with:
```
...
## License

MIT
```

The new "## Releasing" section must be inserted **before** "## License" so License stays last.

- [ ] **Step 2.2: Insert "Releasing" section**

Use the Edit tool to find:
```markdown
## License

MIT
```

Replace with:
````markdown
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
````

- [ ] **Step 2.3: Verify README markdown still parses**

```bash
cd /Users/leon/Documents/Claude/Projects/dialog-analysis
head -100 README.md | tail -30   # spot-check formatting around the inserted section
```
Expected: the new "## Releasing" block visible, "## License" follows it.

- [ ] **Step 2.4: Commit**

```bash
git add README.md
git commit -m "docs: add Releasing section explaining tag-driven CI flow"
```

---

## Self-Review

| Spec section | Plan task |
|---|---|
| §A.1 trigger on `v*.*.*` tag | Task 1 (`on.push.tags`) |
| §A.2 version extraction | Task 1 (Extract version step) |
| §A.3 master ancestry guard | Task 1 (Verify tag is on master step) |
| §A.4 package.json auto-sync | Task 1 (Sync package.json version step) |
| §B 3 artifacts (tgz/zip/sha256) | Task 1 (Build artifacts step) |
| §C.1 test gate (unit/int/e2e) | Task 1 (3 test steps in order) |
| §C.2 auto release notes | Task 1 (`generate_release_notes: true`) |
| §D file list | Tasks 1 + 2 |
| §E full workflow yaml | Task 1.2 (verbatim) |
| §F README chapter | Task 2 |
| §G error handling | All in workflow steps; no separate task needed |
| §H workflow validation | Yaml syntax check (Step 1.3) + first real tag push (out of plan scope) |
| §I no impact on src/test/runtime | Confirmed — only `.github/` and `README.md` touched |

No placeholders. No "similar to" references. Each task ends with a commit. Both commits land on `feat/ci-release` branch and can be merged together.

---

**Plan complete.**
