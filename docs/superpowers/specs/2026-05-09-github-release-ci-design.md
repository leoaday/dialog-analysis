# GitHub Release CI 设计稿

- 日期：2026-05-09
- 状态：与用户四节确认（§A 触发+版本同步 / §B 产物 / §C 测试+notes / §D 文件清单）
- 范围：单文件 GitHub Actions workflow，push tag 后自动跑测试 + 打包 + 创建 GitHub Release
- 触发：用户希望从 npm pack 手动流程升级为 tag 自动化

## 0. 目标与非目标

**目标**

1. push `v*.*.*` 格式的 tag → workflow 自动跑全部测试（unit + integration + e2e）
2. 测试通过 → 自动构建 3 种产物（tarball / zip / sha256 checksums）
3. 创建 GitHub Release，自动生成 release notes（GitHub API），上传 3 个 asset
4. 自动同步 `package.json` version 到 tag（避免"忘改 version"错误）
5. 防错保护：tag 不在 master 上时拒绝同步操作（避免污染 master）

**非目标**

- 不发布到 npm registry（不调 `npm publish`）
- 不做多平台/多 Node 版本矩阵
- 不打 standalone 二进制（pkg/nexe）
- 不做 release candidate 流程（只支持正式版 tag）
- 不维护 CHANGELOG.md（GitHub 自动 release notes 替代）

## §A 触发与版本同步

### A.1 触发

```yaml
on:
  push:
    tags: [ "v*.*.*" ]
```

仅匹配语义化版本 tag（如 `v0.2.0`、`v1.0.0`、`v1.2.3`）。`v0.1` 这种两段式或 `release-2026` 自由格式 tag **不**触发。

### A.2 版本提取

```bash
TAG=${GITHUB_REF_NAME}            # 如 "v0.2.0"
VERSION=${TAG#v}                  # 如 "0.2.0"
```

### A.3 master 可达性守护

push 回 master 前必须确认 tag commit 是 master 的祖先。否则可能：
- tag 在 feature 分支上 → push 强行覆盖 master 的内容
- tag 在 master 之前 → push 把 master 退回旧版本

```bash
if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/master; then
  echo "::error::Tag $GITHUB_REF_NAME 不在 master 分支上。release 中止。"
  exit 1
fi
```

不在 master 上的 tag 直接 fail，不发 release。

### A.4 版本同步

```bash
CURRENT=$(node -p "require('./package.json').version")
if [ "$CURRENT" != "$VERSION" ]; then
  npm version "$VERSION" --no-git-tag-version
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git add package.json package-lock.json
  git commit -m "chore: sync package.json to $GITHUB_REF_NAME"
  git push origin HEAD:master
fi
```

`npm version` 同时改 `package.json` 和 `package-lock.json`。`--no-git-tag-version` 阻止它再创建 tag（已有触发 tag）。

**副作用**：master 多一个 sync commit。本地需 `git pull` 才能继续工作。在 README 加提示。

## §B 三种产物 + 校验和

```bash
npm pack
# → claude-dialog-analyzer-0.2.0.tgz

mkdir dist
tar -xzf claude-dialog-analyzer-*.tgz -C dist
( cd dist && zip -r "../claude-dialog-analyzer-${VERSION}.zip" package )
# → claude-dialog-analyzer-0.2.0.zip

sha256sum claude-dialog-analyzer-${VERSION}.tgz claude-dialog-analyzer-${VERSION}.zip > checksums.sha256
# → checksums.sha256（每行：<sha256>  <filename>）
```

3 个 asset 上传到 release。

注意 npm pack 输出文件名是 `<name>-<version>.tgz`（包名规范化后的形式），等价于 `claude-dialog-analyzer-${VERSION}.tgz`。

## §C 测试门 + Release notes

### C.1 测试门

```bash
npm ci                                            # ~10s
npm test                                          # unit + integration ~2s
npx playwright install --with-deps chromium      # cached after first run
npx playwright test --config=test/e2e/playwright.config.js   # ~12s
```

任一步失败 → workflow fail → 不构建产物、不创建 release。

总耗时预估：首次 ~3min（chromium 下载占大头），缓存命中后 ~1min。

### C.2 Release notes

```yaml
- uses: softprops/action-gh-release@v2
  with:
    generate_release_notes: true
    files: |
      claude-dialog-analyzer-*.tgz
      claude-dialog-analyzer-*.zip
      checksums.sha256
```

`generate_release_notes: true` 调 GitHub `/repos/{owner}/{repo}/releases/generate-notes` API，自动列从上个 tag 到当前 tag 的 commit + PR + 贡献者。无需 CHANGELOG。

## §D 文件清单 + 权限

涉及文件：

```
.github/workflows/release.yml         CREATE   ~80 行 yaml
README.md                             MODIFY   加 "Releasing" 章节
```

权限（在 workflow 顶部声明）：

```yaml
permissions:
  contents: write    # 创建 release + push 同步 commit 到 master
```

GitHub Action `softprops/action-gh-release@v2` 是社区标准 release action，使用 `GITHUB_TOKEN`（默认无需配置 secrets）。

## §E 完整 workflow 文件

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

## §F README "Releasing" 章节

追加到 `README.md` 末尾（License 之前）：

```markdown
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
```

## §G 错误处理 / 边界

| 场景 | 行为 |
|---|---|
| tag 不匹配 `v*.*.*` 格式 | workflow 不触发 |
| tag 不在 master 分支上 | step 2 fail，workflow 退出，不发 release |
| package.json 与 tag 一致 | sync step 跳过 |
| package.json 与 tag 不一致 | npm version 改写 + commit + push 回 master |
| `npm test` 失败 | workflow fail，不构建、不发 release |
| e2e 失败 | workflow fail，不构建、不发 release |
| `npm pack` 失败 | workflow fail（极少发生） |
| Release 已存在（重复 push 同 tag） | softprops/action-gh-release 默认更新现有 release（覆盖 assets） |
| GITHUB_TOKEN 无权限 | step fail，错误信息显示 permissions 配置缺失 |

## §H 测试

CI 工作流本身较难单元测试。验收方式：

1. 手动测试：在 branch 上 push 一个 throwaway tag（如 `v0.0.0-test`），观察 workflow 行为。完成后删除 tag 和 release。
2. 后续真实使用：v0.2.0 第一次正式 release 即是端到端验证。

不需要新增 unit / e2e 测试 — workflow 不涉及业务逻辑。

## §I 与现状关系

新增：`.github/workflows/release.yml`、README "Releasing" 章节。
不动：所有 src/、test/、docs/、package.json（运行时不变）。

CI 不会改变本地开发流程。本地 `npm test`、`npx playwright test`、`npm pack` 仍可手工跑。
