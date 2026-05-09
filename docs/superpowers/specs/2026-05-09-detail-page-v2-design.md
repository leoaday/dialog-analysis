# 详情页 v2 设计稿（dialog-analysis）

- 日期：2026-05-09
- 状态：与用户三节确认（§A 分类 / §B 渲染器 / §C UI）
- 范围：详情页（`/session.html`）的分类、渲染、布局全面升级；列表页与后端 API 不动
- 目标：覆盖用户提出的 10 项优化（#1–#10），包含一个分类 bug（#6）

## 0. 目标与非目标

**目标**

1. 修分类 bug：subagent 后台返回时由 Claude Code 注入的 `<task-notification>` 用户消息不再被识别为人类轮次。
2. 重构事件分类，从 6 类细化到 12 类，每类独立可过滤、独立可折叠，新增"未定义"安全网。
3. 通用 tool 渲染器分离 input / output 折叠状态；工具 ID 不再与名字粘在一起。
4. 9 个 built-in 工具特化渲染（Edit/MultiEdit/Write/Read/TodoWrite/Bash/Glob/Grep/WebFetch/WebSearch）。
5. 详情页 UI v2：左侧时间线列（绝对时间+增量+本地时区）；顶部双行 toolbar，第二行 filter chips（chip 三态）；消息卡片精修。
6. AskUserQuestion 工具调用与用户拒绝 tool 的反馈输入各成独立分类，可过滤可折叠。

**非目标**

- 列表页（`/index.html`）UI 不动
- 后端 API 不动
- markdown 渲染管线（marked / DOMPurify / highlight.js）不动
- 不引入前端构建步骤；继续无构建静态 ESM 模块
- 不引入新运行时依赖

## §A 消息分类法（覆盖 #3 #6 #7 #8）

新引入 12 个 `kind`（`data-kind` 取值），全部独立可过滤可折叠：

| kind | 来源判定 | 默认显示 | 默认折叠 |
|---|---|---|---|
| `user` | `type=="user"` 且为真人输入：content 含 text/image piece，**且**不是 isMeta、不是 isCompactSummary、不是纯 tool_result 数组、不是 task-notification | 显示 | 展开 |
| `assistant` | `type=="assistant"` 且 content 含 text piece | 显示 | 展开 |
| `thinking` | `type=="assistant"` 且 content 含 thinking piece | 显示 | 展开 |
| `tool` | tool_use（`name` 不在下方任一特化集合） | 显示 | 折叠 |
| `tool_edit` | tool_use 且 `name ∈ {Edit, MultiEdit, Write}` | 显示 | 折叠 |
| `tool_read` | tool_use 且 `name == "Read"` | 显示 | 折叠 |
| `tool_todowrite` | tool_use 且 `name == "TodoWrite"` | 显示 | 折叠 |
| `subagent` | tool_use 且 `name ∈ {Agent, Task}`；以及该 toolUse 之后由系统注入的 `<task-notification>` 合成 user 消息 | 显示 | 折叠 |
| `ask` | tool_use 且 `name == "AskUserQuestion"`，以及配对的 user 答复 | 显示 | 展开 |
| `tool_rejection` | 配对 tool_result，其 `content` 文本以 `User rejected` / `The user doesn't want to proceed with this tool use` / 类似前缀开头 | 显示 | 展开 |
| `system` | `type=="system"`、`compact_boundary`、`queue-operation`、`stop_hook_summary` 等 | **隐藏** | 折叠 |
| `unknown` | 任何不匹配上述全部规则的事件（兜底） | **隐藏** | 折叠 |

### A.1 关键判定细化

**task-notification 检测**（修 #6）：

```javascript
function isTaskNotification(ev) {
  if (ev?.type !== "user") return false;
  const c = ev.message?.content;
  if (typeof c !== "string") return false;
  return c.startsWith("<task-notification>");
}
```

`isHumanTurn` 增加 `if (isTaskNotification(ev)) return false`。`classifyEvent` 在原 user 分支前先检 task-notification，命中则归入 `subagent` 而非 `user`。

**tool_rejection 检测**：当 `tool_result` 的 `content`（string 或 array.text）首部命中以下之一时归类：

- `User rejected`
- `The user doesn't want to proceed with this tool use`
- 字符串以 `[Request interrupted by user`

判定函数：`isToolRejection(toolResult)`。命中时该 tool_result 改为 `tool_rejection` 卡片渲染（含拒绝文案 + 用户附加意见，如有）。

**subagent kind 范围**：把 Agent/Task tool_use **及** 其结果（含同步 tool_result 与异步 task-notification）都标 `subagent`。

**ask kind**：AskUserQuestion 的 tool_use 卡渲染问题与选项；下一条 user 消息（promptId 配对）作为答复，附在卡片下方。

### A.2 子代理事件归并（细节）

后台 subagent 流程示例（来自 `1712289b-...jsonl`）：

| line | type | 现行误判 | v2 正确分类 |
|---|---|---|---|
| 116 | assistant `tool_use{name:"Agent"}` | tool_use（pos 显示 "Bashtoolu_..."） | `subagent`（带特化渲染） |
| 117 | user `tool_result` 同步返回 "Async agent launched" | tool_result | `subagent`（合并到 116 卡） |
| 121 | `queue-operation` 含 `<task-notification>` | system_other | `system`（默认隐藏） |
| 124 | user `content="<task-notification>...全文"` | **`user`（误判）** | **`subagent`（合并到 116 卡的"async result"区）** |

第 124 行的合成 user 消息含 subagent 完整报告，渲染时 attach 到第 116 行 Agent 卡片末尾的 "异步返回" 折叠区，而非作为新 user 气泡。`rounds` 不计。

## §B 渲染器 v2（覆盖 #4 #5 #9）

### B.1 通用 tool 渲染器（修 #4 #5）

替换当前 `<span class="tool-name">🔧 Bash</span><span class="tool-id">toolu_...</span>`。新形态：

```html
<div class="tool" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🔧 Bash</span>
    <span class="tool-id" title="toolu_018J24...">toolu_018…</span>
  </div>
  <details class="tool-input" data-fold-sub="tool-input"><summary>Input</summary>...</details>
  <details class="tool-output" data-fold-sub="tool-output"><summary>Output</summary>...</details>
</div>
```

- `tool-name` 与 `tool-id` 之间加 `flex` 间隔；`tool-id` 截断到 8 字符 + tooltip 显示完整。
- `tool-input` / `tool-output` 各自一个 `<details>`，可**独立点击 summary 展开/折叠**（满足 #5 单独控制）。block 初始 open 状态由该工具所属的 filter chip 折叠态决定（chip 折叠 → 两个 details 都 closed；chip 展开 → 都 open），用户可手动点单个 summary 翻转。
- 工具特化渲染器（B.2）也使用同样的 input/output 双 details 结构。
- 已经合并的 tool_result 通过 `tool_use_id` 在前端 build 一个 Map 配对，沿用现行 `buildToolResultIndex` 逻辑。

### B.2 工具特化渲染器（#9）

9 个 built-in 工具特化。每个文件路径：`src/public/js/renderers/tool-<name>.js`，导出 `render<Name>(toolUse, toolResult)`。

| 工具 | data-kind | 折叠态（一行摘要） | 展开态 |
|---|---|---|---|
| **Edit / MultiEdit** | `tool_edit` | `📝 Edit foo.ts (+12 -5)` | 文件名 + 字符级 inline diff（`old_string` vs `new_string`，`±2 行上下文` 显示行号） |
| **Write** | `tool_edit` | `📄 Write foo.ts (152 lines)` | 文件名 + 全文（语言根据扩展名给 hljs hint） |
| **Read** | `tool_read` | `👁 Read foo.ts:1-200` | 文件名 + offset/limit 元信息（**不**渲染 tool_result 实际内容，太长） |
| **TodoWrite** | `tool_todowrite` | `✅ TodoWrite (3/8 done · 1 in_progress)` | 复选框列表，✓/▶/☐ 三态 |
| **Bash** | `tool` | `$ npm test` (前 60 字符) | 命令完整 + 输出（暗色 pre 块） |
| **Glob** | `tool` | `🔎 Glob *.ts in src/ → 23 matches` | pattern + path + matches 文件列表 |
| **Grep** | `tool` | `🔎 Grep "pattern" → 12 matches` | pattern + path + match 列表（带行号） |
| **WebFetch** | `tool` | `🌐 WebFetch example.com/path` | URL + prompt + 摘要返回 |
| **WebSearch** | `tool` | `🔍 WebSearch "query" → 10 results` | query + 结果列表 |

dispatcher：在 `session.js` 的 `renderEvent` 中，对 tool_use 按 `name` 分发到对应 renderer；不识别的工具 → 通用 renderer (B.1)。

### B.3 Edit diff 算法

> **注意**：`Edit` / `MultiEdit` 的 `tool_use.input` 只给 `old_string` / `new_string`（无文件全文，无行号）。

折叠态行加减：`oldStr.split("\n").length - 1` vs `newStr.split("\n").length - 1`，差值即"行变更净值"，但 +/- 计数取**最大值**：`+max(addLines, 0)` / `-max(delLines, 0)`。

展开态 inline diff：用一个简化版 LCS（Longest Common Subsequence）按行对齐 `old_string` 和 `new_string`，未变化行用灰色，删除行红 `-`，新增行绿 `+`。前后各取最多 2 行作为 anchor 上下文（如果 old_string 包含若干"未变化"的行则它们就是上下文）。**不**还原文件级行号，行号列展示 `−` / `+` 符号即可。

实现库选择：用纯手写 ~50 行 JS，不引入 `diff` npm 包（YAGNI）。

## §C 详情页 UI v2（覆盖 #1 #2 #10）

### C.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│ ← 会话列表 · 1efa1b78… · 23 轮 · 583 事件 · in/out 41.2k/9.8k  │ Toolbar
├─────────────────────────────────────────────────────────────────┤
│ 显示： [user] [assistant] [thinking⊟] [tool⊟] [edit⊟] ...      │ Filter chips
├──────────┬──────────────────────────────────────────────────────┤
│ 14:08:10 │  user: 基于 @ai-native/AI-Native…                   │
│   ●      │                                                      │
│ 14:08:13 │  💭 thinking · 折叠                                  │
│   +3s ●  │                                                      │
│ 14:08:14 │  👁 Read AI-Native变革介绍-PPT大纲-v2.md             │
│   +1s ●  │                                                      │
│ 14:08:32 │  assistant: v3 大纲完成…                             │
│   +18s ● │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

CSS Grid `grid-template-columns: 100px 1fr`。

### C.2 Filter chips（#2）

- 顶部第二行专放 chips。每个 chip 文本 = 分类名（中文/英文混排）。
- **三态循环**点击切换：
  - 状态 1：**显示+展开**（蓝底，无 ⊟）
  - 状态 2：**显示+折叠**（蓝底，右下 ⊟）
  - 状态 3：**隐藏**（灰底，删除线）
- 状态保存到 `localStorage["da:filter:v2"]`：`{ user: "open" | "folded" | "hidden", ... }`
- 默认值见 §A 表格。
- chip 的 keyboard：聚焦后 `Space` 循环。
- 移除老版 4 个 toggle，被 chips 完全取代。

### C.3 时间线列（#10）

CSS Grid 第一列 `100px`，含两条信息：

```
14:08:13         <- 绝对本地时间（HH:MM:SS）
  +3s            <- 相对前一条事件的增量（小字、灰色）
  ●              <- 颜色按 kind 分（user 蓝、assistant 绿、tool 灰…）
```

实现要点：

- **本地时区**：`new Date(ev.timestamp).toLocaleTimeString(undefined, { hour12: false })` — 浏览器自动按本地时区
- **跨日切换**：当相邻两条时间戳落在不同日期时，时间线插入分隔行 `── 2026-05-08 ──`，使用整行宽度
- **hover ISO**：`<time title="2026-05-08T14:08:13.474Z UTC">14:08:13</time>`
- **首条**：`+前` 标记（无相对量）；其余统一 `+Xs / +Xm / +Xh`
- 没有 `timestamp` 字段的事件（理论上不应有，但如 queue-operation 偶尔无）→ 用 "—" 占位

### C.4 消息卡片精修

- `user` 卡：浅蓝底，右对齐，圆角 8px，max-width 80%
- `assistant`：白底，左对齐，max-width 88%
- `thinking`：浅黄底，使用 `<details>`，summary 显示 `💭 思考` + 字符数
- `tool` 系列：浅灰底，等宽字体
- `subagent`：浅紫底（与列表页一致的紫色调）
- `ask`：浅紫底加边框，问题 + 选项列表 + 用户答案
- `tool_rejection`：浅红底，显示拒绝原因 + 用户附加文字
- `system`：暗色 pre 块，monospace，11px

每条消息 `data-kind="<kind>"` 用于 filter 控制 display: none。

### C.5 调用 frontend-design 的位置

实施阶段会用 `superpowers:frontend-design` 子技能（任务要求 #1）来：
- 把 §C 的 mockup 落成完整 CSS（颜色、间距、字体调整）
- 检查响应式（窄屏时间线列折叠到顶部）
- 一致化与列表页的视觉语言

**不**重做列表页（用户未要求）。frontend-design 仅作用于 `session.html` + `styles.css` 的详情页相关部分。

## §D 实现拆分（指导 plan 阶段）

为方便后续 plan 阶段分解，约定本 spec 拆 4 大块、可逐块上线：

1. **D1 分类层**：`src/parser/events.js` + `src/parser/extract-text.js` 重写，加 `task-notification` / `tool_rejection` / `unknown` / 各 `tool_*` 子类型；增 unit 测试覆盖 12 类全部分支。
2. **D2 通用 tool + filter chips 骨架**：`src/public/js/fold-toggles.js` 改为 `filter-chips.js`（三态 chip）+ `localStorage["da:filter:v2"]`；通用 tool renderer 分 input/output。
3. **D3 工具特化渲染器**：9 个 `src/public/js/renderers/tool-<name>.js` 文件，加载映射表、回退到 B.1 通用渲染。
4. **D4 时间线列 + UI 重绘**：`session.html` 改 grid 布局；timeline-col 渲染；message-col 卡片样式精修；frontend-design 跑一遍。

每块独立：D1 无 UI 变化、D2 不依赖特化、D3 不依赖时间线、D4 是最后视觉收尾。任意一块出问题不阻塞其他。

## §E 错误处理 / 边界

| 场景 | 行为 |
|---|---|
| timestamp 缺失 | 时间线占位 "—"；不参与"+增量"计算 |
| timestamp 早于上一条 | 仍按事件顺序排列；增量显示 `−Xs`（标灰），不报错 |
| AskUserQuestion 之后没有 user 答复 | ask 卡片 footer 留 "等待回答" 占位 |
| Edit 的 old_string 在 new_string 中找不到对应（罕见） | 退化为"两块文本上下并排" |
| 未知工具（如用户的 MCP 工具）| 走通用 tool renderer，不抛错 |
| `<task-notification>` 内容损坏 | 仍按 `subagent` 分类，渲染成"⚠ 异步通知（损坏）"+ raw 折叠 |

## §F 测试

不增加新 e2e（已有 fold-flow 覆盖）。增量测试：

1. **Unit (events.test.js 扩展)**：每个新 kind 一组 fixture（task-notification、tool_rejection、ask、9 个 tool_* 各一）。
2. **Unit (renderers)**：每个 renderer 一个 fixture → snapshot 字符串包含关键标识（如 `📝 Edit`、`✅ TodoWrite (3/8`）。
3. **Integration**：现有 13 个测试不动；不需要新加。
4. **E2E (扩展 fold-flow.spec.js)**：增加 chip 三态切换测试 — 点 1 次显示+折叠 / 点 2 次隐藏 / 点 3 次回到显示+展开。

## §G 与现状的关系

涉及修改的文件：

```
src/parser/events.js              重写（新分类）
src/parser/extract-text.js        微调（task-notification 内容也要可搜索）
src/public/js/fold-toggles.js     重写为 filter-chips.js
src/public/js/session.js          renderEvent dispatcher 扩展
src/public/js/renderers/tool.js   通用渲染器分 input/output
src/public/js/renderers/tool-edit.js          新增
src/public/js/renderers/tool-write.js         新增
src/public/js/renderers/tool-read.js          新增
src/public/js/renderers/tool-todowrite.js     新增
src/public/js/renderers/tool-bash.js          新增
src/public/js/renderers/tool-glob.js          新增
src/public/js/renderers/tool-grep.js          新增
src/public/js/renderers/tool-web.js           新增（fetch + search）
src/public/js/renderers/ask.js                新增
src/public/js/renderers/tool-rejection.js     新增
src/public/js/timeline.js          新增
src/public/session.html            改 grid 布局 / 双行 toolbar
src/public/styles.css              chips / timeline / 卡片样式
test/unit/events.test.js           扩展 12 类分支
test/fixtures/basic.jsonl          扩展样本（subagent task-notification、ask、rejection）
test/e2e/fold-flow.spec.js         扩展 chip 三态测试
```

不再修改：列表页、所有后端文件、`vendor/`、`docs/debugging.md`（实施完毕后追加 chips 说明）。
