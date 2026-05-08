# Dialog-Analysis CLI 设计稿

- 日期：2026-05-08
- 状态：已与用户确认四节设计；待落实施计划
- 范围：把现有的 `dialog-analysis/index.html` 单页工具改造为可全局安装的 Node CLI；增加首页（目录选择 + 会话/子代理列表 + 全文检索），保留并扩展现有详情页（折叠 toggle）

## 0. 目标与非目标

**目标**

1. 通过 `npm i -g claude-dialog-analyzer` 安装后，运行同名命令即在本机起 HTTP 服务并自动唤起浏览器。
2. 首页：
   - 选择"分析目录"，默认起点 `~/.claude/projects`，支持服务端目录浏览器、面包屑、`showDirectoryPicker` 快捷起点、CLI 启动参数三种入口。
   - 列出会话：会话 ID（文件名）、修改时间、轮次、in/out/cache token、首条消息摘要、subagent 数量徽标（可展开子列表）、详情链接。
   - 后端全文检索：输入关键字 → 回车或点搜索按钮触发 → 结果包含命中的会话与命中的 subagent；**子代理命中时父会话仍展示**。
3. 详情页（沿用现有 `index.html` 渲染器）：每种消息类型独立 toggle 折叠（thinking / system / tool / subagent / askUserQuestion），初始默认折叠 tool / subagent / askUserQuestion，状态写 `localStorage`。
4. 跨平台 win/linux/mac，仅依赖 Node 18+，前端零构建、零必需 CDN。

**非目标**

- 编辑/写入会话文件
- 多用户/远程访问（仅绑 127.0.0.1）
- 复杂检索（向量、CJK 分词、模糊）；仅支持子串与正则
- 数据库或磁盘持久化索引

## 1. 项目布局

```
dialog-analysis/
├── package.json            # bin: claude-dialog-analyzer -> bin/cli.js, type: module, engines.node>=18
├── bin/cli.js              # 解析参数 → 启 server → 打开浏览器
├── src/
│   ├── server.js           # 内置 http，无框架
│   ├── routes/             # list-dir / sessions / session / subagent / search
│   ├── parser/             # jsonl 流式解析、轮次/token/摘要、subagent 索引、search
│   ├── browser-open.js     # mac/win/linux 跨平台启浏览器
│   └── public/             # index.html(列表) / session.html(详情) / styles.css / js/...
│       └── vendor/         # marked / dompurify / highlight.js 离线副本（fallback）
├── test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/                # Playwright
│   └── fixtures/           # sample jsonl + subagents/
├── docs/
│   ├── superpowers/specs/  # 本设计稿
│   └── debugging.md        # 调试指南（最终交付物之一）
└── package-lock.json
```

约束：**单个源码文件 ≤ 200 行**；解析器与渲染器分别按事件类型拆分子文件；新事件类型新增需走对称的 parser+renderer+toggle+fixture 四点修改路径（见调试指南）。

## 2. CLI

```
claude-dialog-analyzer [-d <dir>] [-p <port>] [--no-open] [-h]
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `-d, --dir <abs>` | `~/.claude/projects` | 启动后预选目录 |
| `-p, --port <n>` | 自动 | 从 5173 起依次探测 5174…5183，全占则 EXIT 1 + 提示 `-p` |
| `--no-open` | false | 不调浏览器，CI/SSH 用 |
| `-h, --help` | – | 输出帮助 |

启动行为：
- 仅绑 `127.0.0.1`
- 服务起来后向 stdout 第一行打印 `listening: http://127.0.0.1:<port>`，便于自动化抓取
- 然后 `--no-open` 为 false 时调 `src/browser-open.js`（mac `open`、win `start ""`、linux `xdg-open`）
- Ctrl+C 优雅关闭

依赖：
- runtime：`open`（跨平台启浏览器）、`mri`（轻量 argv 解析）。其余使用 Node 内置（`http`/`fs`/`path`/`url`/`readline`）。
- 前端：`marked`、`dompurify`、`highlight.js` 来自 CDN，并把同版本 minified 副本放 `public/vendor/`，README 标注离线切换注释（`session.html` 顶部 5 行）。
- dev：`@playwright/test`。

## 3. HTTP API

全部只读 GET，强制绝对路径，响应附 `ETag: W/"<mtime>-<size>"` 用于客户端 304。

### 3.1 `GET /api/list-dir?path=<abs>`

```jsonc
{
  "path": "/Users/x/.claude/projects",
  "parent": "/Users/x/.claude",          // null 表示已到根
  "entries": [
    {
      "name": "-Users-leon-…",
      "type": "dir",                      // "dir" | "file" | "jsonl-dir"
      "size": 0,
      "mtime": "2026-05-08T08:39:00Z",
      "isClaudeProject": true,            // dir 内含 *.jsonl
      "sessionCount": 34                  // 仅 jsonl-dir/Claude 项目目录有
    }
  ]
}
```

### 3.2 `GET /api/sessions?dir=<abs>`

```jsonc
{
  "dir": "...",
  "sessions": [{
    "sessionId": "1efa1b78-…",
    "file": "/abs/path/1efa1b78-…jsonl",
    "mtime": "...",
    "size": 3207459,
    "rounds": 23,
    "tokens": { "input": 41200, "output": 9821, "cacheCreate": 51211, "cacheRead": 488122 },
    "firstUserSummary": "以 @dialog-analysis/ 目录为项目目录…",
    "subagentCount": 7,
    "subagents": [{
      "agentId": "a17c90e32cb6baee2",
      "file": "/abs/.../subagents/agent-a17c90e32cb6baee2.jsonl",
      "firstPromptSummary": "你是为 playbit 项目做基础研究的研究员…",
      "agentType": "researcher"          // 来自同名 .meta.json，缺则空字符串
    }]
  }]
}
```

### 3.3 `GET /api/session?file=<abs>` / `GET /api/subagent?file=<abs>`

```jsonc
{
  "file": "...",
  "events": [ /* 原始 JSONL 行解析后的对象，按文件顺序 */ ],
  "malformed": 0
}
```

两端点同实现，仅前端图标/标题不同。

### 3.4 `GET /api/search?dir=<abs>&q=<query>&regex=0|1`

```jsonc
{
  "dir": "...",
  "q": "...",
  "regex": false,
  "total": 12,                            // 命中文件数（session+subagent 去重到 session）
  "sessions": [{
    "sessionId": "...",
    "file": "...",
    "hitInSession": true,
    "hitInSubagent": false,
    "sessionMatches": [{
      "eventIdx": 17,
      "role": "user",                     // user|assistant|system
      "type": "text",                     // text|thinking|tool_use|tool_result|compact_summary
      "snippet": "…前后 ±60 字符 …",
      "matchRanges": [[63, 71]]
    }],
    "subagentMatches": [{
      "agentId": "...",
      "file": "...",
      "count": 3,
      "snippets": [{ "eventIdx": 4, "snippet": "...", "matchRanges": [[12,20]] }]
    }],
    "rounds": 23, "tokens": { "...": "..." },
    "firstUserSummary": "...", "subagentCount": 7, "subagents": [/* 同 3.2 */]
  }]
}
```

### 3.5 检索语义

- 默认大小写不敏感子串；`regex=1` 时 `new RegExp(q, "i")`，编译失败返回 `400 {error:"invalid regex"}`
- 检索范围（`extractText(event)`）：`text`、`thinking`、`tool_use.input`（JSON 序列化后）、`tool_result.content` 文本部分、`isCompactSummary` 摘要文本。**不**检索 `usage`、`uuid`、内部字段
- `snippet` 截 ±60 字符，`matchRanges` 相对 `snippet` 起点
- 单文件命中数硬上限 50；超出截断 `truncated: true`
- 结果排序：`hitInSession` 优先，其次 `mtime` 倒序
- **关键语义**：`hitInSession=false && hitInSubagent=true` 时父会话**仍**进 `sessions[]`，并在前端用淡灰色 + 提示文案"匹配在 subagent 中"，展开行只显示命中的子代理

### 3.6 缓存策略

| 数据 | 缓存？ | 说明 |
|---|---|---|
| 元信息（rounds/tokens/firstUserSummary/subagent 索引） | 是 | 内存 LRU(50)，键 `(file, mtime, size)`，命中即跳过重扫；用于 `/api/sessions` |
| jsonl 原始内容 / 搜索 snippet | **否** | `/api/search`、`/api/session` 每次现场流式读盘 |

`/api/search` 实现：对每个候选 jsonl 用 `readline` 逐行读，匹配后只在内存里留 `snippet`（±60 字符）+ `eventIdx`，不留原 line；命中累加到 50 即提前关流；元信息从 LRU 拿，缺失则现扫描，但**不**缓存原内容。绝不一次性 `fs.readFileSync`。

## 4. 解析器规则

### 4.1 轮次（人类轮次）

`type=="user"` 且**不**满足以下任一：
- content 是数组且全部元素 `type=="tool_result"`
- `isMeta === true`
- `isCompactSummary === true`

### 4.2 Token 累加

遍历 `type=="assistant"` 的 `message.usage`，分别累加 `input_tokens`、`output_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens`，作为 `tokens.input/output/cacheCreate/cacheRead`。

### 4.3 首条摘要

首个人类轮次 → 取所有 text content 拼接 → 去前后空白 → 多空白合一 → 截 120 字符（按 unicode code point）。

### 4.4 Subagent 索引

扫描 `<sessionId>/subagents/agent-*.jsonl`：
- `firstPromptSummary` 同 4.3 但作用于 subagent jsonl 第一条 user
- `agentType` 取同目录 `agent-<id>.meta.json` 的 `type` 或 `name` 字段，缺则空

## 5. 安全

- 仅 GET、仅 bind `127.0.0.1`
- 任何路径入参 → `path.resolve` → 校验：不含 NUL 字节、是绝对路径（以 `/` 或盘符开头）→ 通过则照单接受。本机工具，**不做沙盒**
- 不写文件，不返回 stack trace 给客户端，错误响应只含 `{error: "..."}` 概要

## 6. 前端

### 6.1 列表页 `/` `?dir=<abs>`

顶栏：`📁 路径面包屑（可点击逐级返回）` `[选目录]` `[浏览器选目录]` `[刷新]` `搜索框 [正则] [搜索]`

- "选目录"：弹 modal，内嵌 `/api/list-dir` 驱动的目录浏览器，支持双击进入、面包屑、键入绝对路径直跳
- "浏览器选目录"：调 `showDirectoryPicker()`；不可用则禁用 + tooltip"仅 Chrome/Edge 支持"。选完取 `handle.name` 提示用户在弹层确认完整绝对路径（File System Access API 拿不到绝对路径，仅作"快捷起点"提示）
- 搜索框：**回车或点 [搜索] 触发**，不防抖、不自动应用；搜索期间按钮显示"搜索中…"且禁用；`Esc` 或 `[清空]` 退回普通会话列表

主表（默认 `mtime` 倒序）：

| 列 | 内容 |
|---|---|
| ID | sessionId 短 8 位 + tooltip 全 ID 与文件路径 |
| mtime | 相对时间 |
| 轮次 | rounds |
| in/out/cache | tokens 三栏 |
| 首条摘要 | firstUserSummary |
| subagent | `[ ▶ N ]` 徽标，点击展开当前行下方插一行子列表 |
| 详情 | `[查看]` → `/session.html?file=<abs>` |

子列表行：`agentId | agentType | firstPromptSummary | [查看]`（→ `/session.html?file=<abs>&kind=subagent`）

搜索结果视图：
- 主行附 `[N hits]` 徽标，后跟前 2 条 `snippet` 缩略（高亮 `matchRanges`）
- 主行展开区只显示命中的 subagent，未命中的 subagent 折起
- subagent-only 命中：主行左缘加竖线 + 灰底 + 文案"会话本体未命中，子代理命中"
- 跳详情页时 URL 附 `&q=<query>`

### 6.2 详情页 `/session.html?file=<abs>` `?kind=session|subagent` `?q=<query>`

完全沿用现有渲染器，新增：

- 顶栏左侧：`← 会话列表`（按 `sessionStorage` 里上次的 dir 回跳，缺失则回 `/`）
- 顶栏右侧：折叠 toggle 群 `thinking` `tool` `system` `subagent` `askUserQuestion`，每个独立 checkbox
- 初始默认：`tool`、`subagent`、`askUserQuestion` = 折叠；`thinking`、`system` = 展开
- 用户切换后写 `localStorage["da:fold:v1"]`，下次打开沿用
- 折叠粒度：toggle 控制"该类型整体折叠/展开"。已折叠的单条仍可点击 details 单独展开；切 toggle 后批量重置为对应状态
- subagent 折叠卡片显示 `agentId` + `firstPromptSummary` + `[打开 subagent 详情]`
- `kind=subagent` 时顶栏色调淡紫，与主会话视觉区分
- `q=<query>` 时遍历渲染完成的文本节点，把命中的 substring 用 `<mark>` 包裹（仅作用于已渲染文本，不重新解析事件结构）

### 6.3 URL 路由

| URL | 作用 |
|---|---|
| `/` | 列表（无目录） |
| `/?dir=<abs>` | 列表（指定目录） |
| `/session.html?file=<abs>` | 主会话详情 |
| `/session.html?file=<abs>&kind=subagent` | subagent 详情 |
| `?q=<query>` 任一页面 | 携带搜索关键字 |

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| 端口被占 | 启动时探测 5173→5183，全占 EXIT 1 + 提示 `-p` |
| `~/.claude/projects` 不存在 | 启动不报错，列表页空状态提示"目录不存在，请切换" |
| jsonl 含坏行 | 跳过，`malformed++`，响应里携带；详情页顶部 banner 提示"已忽略 N 行" |
| 路径含 NUL / 非绝对 / 不存在 | `400 {error}`；前端 toast |
| 文件 > 200MB | 仍处理，响应头 `X-Stream-Hint: large`，前端展示"大文件，渲染中"占位 |
| `regex=1` 表达式非法 | `400 {error: "invalid regex"}` |

## 8. 测试

三层金字塔，全部跑过才能 commit（遵循 E2E 前置规则）：

1. **单测** (`node --test`)
   - 解析器：fixture jsonl → rounds / tokens / firstSummary 期望值
   - 路径校验、缓存 LRU 行为、`extractText` 覆盖各事件类型
   - 搜索 substring/regex 命中、snippet 截取、`matchRanges` 偏移
2. **集成**：`spawn` 起 server，`fetch` 5 个端点，断言 JSON shape 与 ETag
3. **E2E** (Playwright)
   - 启动 CLI（`--no-open` + 固定端口）
   - 列表页：选目录 → 看到表 → 展开 subagent → 点详情 → 验证渲染
   - 搜索：输入关键字 + 回车 → 看到 hits → subagent-only 命中行带提示且展开 → 跳详情时 URL 携带 `q`
   - 折叠 toggle：切换 thinking/tool → DOM 检查 + 刷新后保留（localStorage 持久）
   - fixture：用 `1efa1b78-1f46-425e-af9f-81a68da3fc46.jsonl` + 一个含 `subagents/` 的目录拷贝

## 9. 调试指南（最终交付到 `docs/debugging.md`）

为后续 AI 迭代专门写的章节，目录如下：

1. **启动 & 日志**
   - `DEBUG_DA=1` 开 verbose；`DEBUG_DA=trace` 打印每条搜索命中。日志写 stderr，不污染 stdout
   - `--port 0` 让 OS 分配，端口写 stdout 第一行
2. **代码导航地图**
   - `bin/cli.js` → `src/server.js` → `src/routes/*` → `src/parser/*` → `src/public/*`
   - 每个文件 ≤200 行；每个事件类型在 parser 与 renderer 两侧入口位置标记 `// EVENT: <type>`
3. **如何加一种新事件类型**：
   - a) `parser/events.js` 加判定 → b) `public/js/session.js` 加 renderer → c) 详情页 toggle 列表加一项 → d) 单测 fixture
4. **如何调整搜索范围**：
   - 在 `parser/search.js` 的 `extractText(event)` 里加/删字段；附 fixture 验证
5. **常见问题**
   - CDN 被墙：把 `public/vendor/` 切回；`session.html` 顶部已留切换注释
   - 大文件渲染慢：检查是否退化为同步 `JSON.parse`；改 `for-of` 分批 `requestIdleCallback`
   - 端口冲突：`lsof -i :5173`；或 `-p` 指定
   - 搜索慢：`DEBUG_DA=trace` 看慢文件；考虑 `--max-files`
6. **AI 迭代 checklist**（每次修改贴给 AI）
   - 是否更新对应单测 fixture？
   - 是否在 `docs/superpowers/specs/` 增量记录决策？
   - 是否跑过 e2e？
   - 是否新增依赖？尽量不引

## 10. 与现状的关系

- `dialog-analysis/index.html` 当前是单页拖拽分析器。本次：
  - 把渲染器从 `index.html` 拆出至 `src/public/js/`（renderer 拆分按事件类型分文件）
  - `index.html` 重写为"列表页"
  - 新增 `session.html` 承接现详情页角色，并加 toggle 群
- `1efa1b78-…jsonl` 移到 `test/fixtures/` 作为基准 fixture，主目录不再保留
