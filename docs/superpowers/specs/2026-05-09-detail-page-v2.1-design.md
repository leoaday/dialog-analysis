# 详情页 v2.1 设计稿（dialog-analysis）

- 日期：2026-05-09
- 状态：与用户四节确认（§A 分类 / §B 折叠交互 / §C 渲染增强 / §D 时间线 + 性能）
- 范围：基于 v2 已上线的详情页做迭代修复 + 增强；列表页、后端 API 不动
- 触发：用户实际使用 v2 后反馈的 8 项问题（perf 卡顿、时间线对齐错位、单卡折叠丢失、缺图例、Agent/Skill 摘要不到位、compact 应独立分类等）

## 0. 目标与非目标

**目标**

1. 修详情页性能：chip 切换由 ~200ms（JS 循环 + querySelectorAll × N）降到 < 5ms（CSS 属性驱动）。
2. 时间线从独立列重构为每张消息卡片的内嵌左侧 timestamp 单元，hidden 时与卡片同进退；长消息 timestamp 用 `position: sticky` 留在卡片顶部；缺 timestamp 的事件不显示时间。
3. 单卡片可独立点击展开/折叠，与 chip 全局批量操作并存（chip 切换无条件覆盖）。
4. 新增 tool input / output 全局子开关（独立于 chip）。
5. 新增 `compact` kind（含压缩摘要），从 `system` 独立。`last-prompt` 经验证是每提交 checkpoint 噪声，仍归 `system` 默认隐藏。
6. 新增 `Skill` 工具渲染器，折叠态显示 skill 名。
7. 新增 `Agent` 工具特化渲染器，折叠态显示 `subagent_type · "description"`。
8. 时间线圆点配 toolbar 微缩 legend；颜色收敛到 4 种语义大类。

**非目标**

- 列表页 UI 不动
- 后端 API 不动
- 不引入构建步骤
- 不引入新运行时依赖
- 不修改 `last-prompt` 处理（仍归 system 默认隐藏）
- 不合并 task-notification 与 Agent 卡（保持各自独立卡片，都标 `data-kind="subagent"`）

## §A 分类调整（覆盖 #5）

`system` kind 太杂，把 `compact` 拆出来独立。

新分类 13 类（v2 是 12，新增 `compact`）：

| kind | 来源判定 | 默认显示 | 默认折叠 |
|---|---|---|---|
| `user` | 真人输入 | 显示 | 展开 |
| `assistant` | assistant text | 显示 | 展开 |
| `thinking` | assistant thinking-only | 显示 | 展开 |
| `tool` | 通用 tool_use（不在以下任一名单） | 显示 | 折叠 |
| `tool_edit` | name ∈ {Edit, MultiEdit, Write} | 显示 | 折叠 |
| `tool_read` | name == "Read" | 显示 | 折叠 |
| `tool_todowrite` | name == "TodoWrite" | 显示 | 折叠 |
| `subagent` | name ∈ {Agent, Task} **及** task-notification 合成 user | 显示 | 折叠 |
| `ask` | name == "AskUserQuestion" | 显示 | 展开 |
| `tool_rejection` | tool_result content 命中拒绝前缀 | 显示 | 展开 |
| `compact` | `type=system & subtype=compact_boundary` + 紧随 isCompactSummary user | 显示 | 折叠 |
| `system` | 其他 system / queue-operation / stop_hook_summary / **last-prompt** / isMeta user | **隐藏** | 折叠 |
| `unknown` | 兜底 | **隐藏** | 折叠 |

### A.1 关键判定细化

**`compact` 检测**：

```javascript
// in classifyEvent
if (ev.type === "system" && ev.subtype === "compact_boundary") return "compact";
if (ev.type === "user" && ev.isCompactSummary) return "compact";
```

注意 `compact` 也吃了原本 `system` 分支里的 isCompactSummary。`isHumanTurn` 不变（仍排除 isCompactSummary）。

**`last-prompt` 处理**：

```javascript
if (ev.type === "last-prompt") return "system";
```

不单独成 kind。验证数据：21k 行的会话有 862 次 last-prompt，是 Claude Code 每次 prompt 提交时的快照 checkpoint，与紧邻的 user 消息内容重复。归 system 默认隐藏即可。

### A.2 fixture 扩展

`test/fixtures/basic.jsonl` 现有 12 行（v2 加过 ask/rejection/task-notification）。本次再加 2 行：

```
{"type":"system","subtype":"compact_boundary","compactMetadata":{"preTokens":50000,"trigger":"auto"},"timestamp":"2026-04-29T10:01:03.000Z","uuid":"sys2"}
{"type":"last-prompt","lastPrompt":"快照测试","sessionId":"basic-test","timestamp":"2026-04-29T10:01:04.000Z"}
```

变 14 行。compact_boundary 已在 fixture 里有过（line 6），新加一条让 compact kind 测试有专门样本，旧的 line 6 仍是 compact kind 的另一覆盖。

## §B 折叠交互（覆盖 #1 + tool input/output 子控制）

### B.1 单卡片独立折叠

每张消息卡片加 click handler：点击卡片头（`tool-head` / `meta` / `summary` 已有）切换该卡 `<details>` open。

设计语义：**chip 切换无条件覆盖**单卡状态。chip 全局把对应 kind 全部卡片重置到当前 chip 态；用户后续可点单卡再调整。

实现：原生 `<details>` 已经支持点 summary 切换。难点是非 details 卡（如 user/assistant 气泡）也要可折叠 — 改为用 `<details>` 包裹整个气泡（summary 即原 meta 行），保持 v2 视觉。

```html
<!-- v2.1 user/assistant 卡 -->
<details class="row user" data-kind="user" open>
  <summary class="meta">user · 14:08:10</summary>
  <div class="bubble">…内容…</div>
</details>
```

折叠态 summary 仅显示 meta 信息（kind + 时间）。用户点 summary 展开看完整气泡。

### B.2 tool 全局 input / output 子控制

新增 2 个**独立全局开关**（不是 chip）放在 chip 行右端，用 `margin-left: auto` 推到右边：

```
显示： [user] [assistant] [thinking⊟] [tool⊟] ... [system✕]    Tool: [Input ▾] [Output ▸]
```

- 默认：Input ▾（展开）/ Output ▸（折叠）
- 切换：点击翻转 ▾/▸
- 实现：写到 `<body>` 的 `data-fold-tool-input` / `data-fold-tool-output` 属性，CSS rule 控制：

```css
body[data-fold-tool-input] .tool-section.tool-input[open] { /* close */ }
/* 用 JS 一次性遍历 .tool-section.tool-input 写 d.open = false */
```

CSS 不能直接控制 `<details open>`，所以最终落实是：切换时 JS 用 `document.querySelectorAll(".tool-section.tool-input")` 一次性 batch 写 `open = state`。但触发点是 sub-toggle，频次低，可接受 N 次写入。

与 chip 关系：**正交**。chip 控制 kind 的显示/折叠；sub-toggle 只控制 tool 类卡片**展开后**里面 input/output 这两个 details 的初始态。如果 chip 把 `tool` 整体折叠了，sub-toggle 不影响（外层都没展开）。

### B.3 chip 切换语义

点击 chip 切换：
- chip class 切换：`chip-open` ↔ `chip-folded` ↔ `chip-hidden`
- body 上对应 kind 属性更新：`data-show-<kind>` (true/false) + `data-fold-<kind>` (true/false)
- 同 kind 全部卡片对应受 CSS 影响，无 JS 循环

CSS：

```css
body[data-show-user="false"] [data-kind="user"] { display: none; }
body[data-fold-user="true"] [data-kind="user"][open] { /* JS sync */ }
```

`<details open>` 是属性而非 CSS state，所以 fold 仍需 JS 一次性 sync 到 details.open。但只针对当前 chip 的 kind，不再循环 12 次。

## §C 渲染器增强（覆盖 #4 #6 #7）

### C.1 时间线圆点 legend（#4）

在 chip 行之前加一条小 legend，永远可见：

```html
<div class="dot-legend">
  <span class="legend-item"><span class="dot dot-user"></span> user</span>
  <span class="legend-item"><span class="dot dot-assistant"></span> assistant</span>
  <span class="legend-item"><span class="dot dot-tool"></span> tool</span>
  <span class="legend-item"><span class="dot dot-subagent"></span> subagent</span>
</div>
```

收敛颜色到 4 种语义大类：
- `user` 蓝 (#3b82f6)
- `assistant` 绿 (#10b981)
- `tool` 灰 (#94a3b8) — 含所有 tool / tool_edit / tool_read / tool_todowrite / ask / rejection
- `subagent` 紫 (#7c3aed)

其他 kind（thinking / system / compact / unknown）共用 `--muted` 灰，不在 legend 里。

### C.2 Skill 渲染器（#6）

新增 `src/public/js/renderers/tool-skill.js`：

```javascript
export function renderToolSkill(toolUse, toolResult) {
  const skillName = toolUse.input?.skill || "(unknown skill)";
  // 折叠态摘要：🧩 Skill · superpowers:writing-plans
  // 展开态：args + result（用通用 tool-section）
}
```

数据来源：`tool_use.input.skill`（Claude Code 的 Skill 工具规范）。

dispatcher 增加：
```javascript
if (name === "Skill") return renderToolSkill(toolUse, toolResult);
```

归到现有 `tool` 通用 kind（chip 用 `tool` 控制）。

### C.3 Agent 渲染器（#7）

新增 `src/public/js/renderers/tool-agent.js`，把 Agent / Task 从通用 tool 渲染升格：

```javascript
export function renderToolAgent(toolUse, toolResult) {
  const subType = toolUse.input?.subagent_type || "general-purpose";
  const desc = toolUse.input?.description || "";
  const prompt = toolUse.input?.prompt || "";
  // 折叠态摘要：🤖 Agent · researcher · "CLI AI 工具 hook 能力调研"
  // 展开态：subagent_type / description / prompt（独立 details） + result（独立 details）
}
```

dispatcher 把 `Agent` / `Task` 路由到这里（替换原 `renderTool(p, r, "subagent")` 调用）。`data-kind="subagent"`。

异步 task-notification 仍由 `renderSubagentNotification` 单独成卡（如 §0 非目标确认）。

## §D 时间线重构 + 性能（覆盖 #2 #3 #8）

### D.1 时间线从独立列改为消息卡片左缘（#8）

**v2 结构（错位）**：

```html
<div class="convo-layout">
  <div id="timeline" class="timeline-col">独立列 N ticks</div>
  <div id="conversation" class="msg-col">N 条消息</div>
</div>
```

**v2.1 结构（绑定）**：

```html
<div id="conversation" class="convo-grid">
  <div class="msg-row" data-kind="user">
    <div class="ts">14:08:10<small>+前</small></div>
    <details class="msg user" open><summary>…</summary>…</details>
  </div>
  <div class="msg-row" data-kind="assistant">
    <div class="ts">14:08:13<small>+3s</small></div>
    <details class="msg assistant" open>…</details>
  </div>
  <div class="day-divider">── 2026-05-09 ──</div>
  ...
</div>
```

CSS：

```css
.convo-grid { display: grid; grid-template-columns: 100px 1fr; gap: 4px 14px; max-width: 1100px; margin: 0 auto; }
.msg-row { display: contents; }   /* let children participate in grid */
.ts { font: 11px ui-monospace, Menlo, monospace; color: var(--muted); position: sticky; top: 14px; align-self: start; padding-top: 10px; }
.ts small { display: block; font-size: 10px; color: #9ca3af; }
.day-divider { grid-column: 1 / -1; text-align: center; color: #6b7280; font-size: 11px; padding: 10px 0; letter-spacing: .05em; }
```

`.msg-row` 用 `display: contents` 让子元素参与外层 grid，时间戳和卡片成为同一 grid row 的两列。

**关键：`data-kind` 移到 `.msg-row` 上**，chip filter 隐藏 `.msg-row` 时它的 `.ts` 和 `.msg` 一起隐藏，时间线天然对齐。

但 `display: contents` + `display: none` 在某些浏览器有怪异行为。**回退方案**：`.msg-row` 用 `display: grid; grid-template-columns: subgrid;`（CSS subgrid，浏览器支持 Chrome 117+/Firefox 71+/Safari 16+，覆盖率 ~95%）。

最终方案：用 subgrid，回退到 `display: contents`。两者都满足"hidden 时整行不渲染"。

### D.2 时间线条件渲染（#3）

按 D.1，自动满足：

- **长消息**：timestamp 在 `.ts` 顶部，sticky；卡片滚动时 timestamp 贴着卡片顶部不动 → 永远只显示一次（"第一行")
- **缺 timestamp**：`.ts` 内 innerHTML 为空，圆点也不渲染
- **跨日**：插入 `.day-divider` row（`grid-column: 1 / -1` 占满）

### D.3 性能（#2）— CSS 属性驱动 filter

**v2 实现（慢）**：

```javascript
function applyFilter(root, state) {
  for (const kind of KINDS) {                                     // 12 次
    const targets = root.querySelectorAll(`[data-kind="${kind}"]`); // 全树查询
    for (const el of targets) {
      el.style.display = v === "hidden" ? "none" : "";
      if (v !== "hidden") {
        const details = el.querySelectorAll("details");             // 又一次全树
        for (const d of details) d.open = v === "open";
      }
    }
  }
}
container.innerHTML = renderFilterRow(state);                       // 整行重渲
```

**v2.1 实现（快）**：

只用 `data-show-<kind>` 一个 body 属性 + CSS 控制 `display`。fold 状态不通过 CSS（CSS 无法控制 `<details open>`），改为 JS 批量写但仅限当前 kind。

```javascript
// chip 点击只更新单 kind
function setChipState(kind, value) {
  // 更新该 chip 的 className（视觉反馈）
  document.querySelector(`.chip[data-kind="${kind}"]`).dataset.value = value;
  // 更新 body 属性，CSS 接管 display:none
  document.body.setAttribute(`data-show-${kind.replace(/_/g, "-")}`, value !== "hidden" ? "true" : "false");
  // details.open 用 JS 一次性 batch（仅当前 kind）
  if (value !== "hidden") {
    const sel = `[data-kind="${kind}"] details, details[data-kind="${kind}"]`;
    document.querySelectorAll(sel).forEach((d) => { d.open = value === "open"; });
  }
  saveFilterState(currentState);
}
```

CSS rules（只针对 show，13 条；用 JS 一次性生成塞进 `<style>`）：

```javascript
// in filter-chips.js init
const styleEl = document.createElement("style");
styleEl.textContent = KINDS.map((k) =>
  `body[data-show-${k.replace(/_/g, "-")}="false"] [data-kind="${k}"] { display: none; }`
).join("\n");
document.head.appendChild(styleEl);
```

注意 kind 名含 `_` 时（如 `tool_edit`、`tool_rejection`、`tool_todowrite`、`tool_read`），属性名需转 `-`（如 `data-show-tool-edit`），但 `[data-kind]` 选择器值仍是原 `_` 形式（与 events.js 输出一致）。

预期：单 chip 切换 → 1 次 dataset 写 + ≤ N 次 details.open 写（N = 该 kind 卡片数，通常 < 100），从 ~200ms 降到 < 5ms。

### D.4 quickClassify 精度提升

v2 的 `quickClassify`（用于 timeline 着色）只回 4 种粗类。v2.1 因为 `data-kind` 已经准确写在 `.msg-row` 上，timeline 着色不再用 quickClassify，**改用同一 `data-kind`**：

```css
.msg-row[data-kind="user"] .ts::before { /* 圆点用蓝色 */ }
.msg-row[data-kind="assistant"] .ts::before { /* 绿 */ }
.msg-row[data-kind="subagent"] .ts::before { /* 紫 */ }
.msg-row[data-kind="tool"] .ts::before,
.msg-row[data-kind="tool_edit"] .ts::before,
.msg-row[data-kind="tool_read"] .ts::before,
.msg-row[data-kind="tool_todowrite"] .ts::before,
.msg-row[data-kind="ask"] .ts::before { /* 灰 */ }
/* 其他 kind 圆点用 --muted */
```

`quickClassify` 整个移除。少一份漂移源（v2 final review 提到的双轨问题）。

## §E 错误处理 / 边界

| 场景 | 行为 |
|---|---|
| `compact_boundary` 无 isCompactSummary 跟随 | compact kind 卡片显示"压缩摘要缺失"占位 |
| timestamp 缺失 | `.ts` 留空（无圆点、无文字、无 hover） |
| Skill `tool_use.input.skill` 缺失 | 折叠态显示 `🧩 Skill · (unknown)` |
| Agent `subagent_type` 缺失 | fallback `"general-purpose"`；description 缺失则显示 `"(no description)"` |
| `display: contents` 浏览器不兼容 | CSS feature query `@supports (grid-template-columns: subgrid)` 优先 subgrid，否则 contents |
| chip click 期间 details.open 写入慢 | 限定 batch 范围到当前 kind（不再全量），最差情况下 N < 200 仍亚 5ms |

## §F 测试

1. **events 单测扩展**：3 个新分支（compact_boundary → compact、isCompactSummary → compact、last-prompt → system）。
2. **Renderer 单测（补 v2 遗漏）**：tool-skill / tool-agent 各一组 fixture。
3. **e2e 扩展 filter-flow**：增加 (a) tool input/output sub-toggle 切换、(b) 单卡片点击展开（与 chip 状态正交）、(c) 跨 chip 切换不影响其他 chip 状态、(d) 性能基线 — 切换 100 次 chip 用时 < 1s（绝对阈值，留余量）。
4. **legend 显示**：e2e 检查 chip 行前一段有 4 个 `.legend-item`。

## §G 拆分（指导 plan 阶段）

为方便 plan 拆解，约定 v2.1 拆 4 块：

1. **G1 分类** — events.js 加 compact + last-prompt 路由；fixture 扩展；events.test.js 扩。
2. **G2 性能 + filter-chips 重构** — `filter-chips.js` 重写为 CSS-attribute-driven；body dataset；动态生成 CSS rules；保留 chip 三态但内部不再 querySelectorAll 循环。
3. **G3 渲染增强 + 单卡折叠** — 用 `<details>` 包裹 user/assistant/thinking 卡片；新增 tool-skill.js / tool-agent.js；移除 renderSubagentNotification（被 Agent renderer 替代）的内嵌依赖（仍保留独立卡）；dot legend；tool input/output sub-toggle UI + 行为。
4. **G4 时间线重构** — 移除 timeline.js + timeline-col；改 conversation 为 grid（subgrid + contents 回退）；timestamp 内嵌 `.msg-row`；移除 quickClassify；CSS 圆点改用 data-kind 选择器。

每块独立可上线。G2 和 G4 独立性最强；G1 是 G2 prereq；G3 不依赖 G2/G4。

## §H 与现状的关系

涉及修改的文件：

```
src/parser/events.js                              MODIFY (compact + last-prompt routing)
test/fixtures/basic.jsonl                         MODIFY (extend 14 lines)
test/unit/events.test.js                          MODIFY (extend cases)
test/unit/jsonl-stream.test.js                    MODIFY (line count 12 → 14)
test/unit/metadata.test.js                        MODIFY (token sums if any new assistant)
test/integration/api.test.js                      MODIFY (events length 12 → 14)

src/public/js/filter-chips.js                     REWRITE (CSS-attr-driven, no loop)
src/public/session.html                           MODIFY (toolbar adds dot-legend + sub-toggle)
src/public/styles.css                             MODIFY (subgrid msg-row, dot-legend, sub-toggle, generated chip rules)

src/public/js/renderers/user.js                   MODIFY (wrap in <details>)
src/public/js/renderers/assistant.js              MODIFY (wrap in <details>)
src/public/js/renderers/thinking.js               (already <details> — no change)
src/public/js/renderers/tool-skill.js             CREATE
src/public/js/renderers/tool-agent.js             CREATE
src/public/js/session.js                          MODIFY (dispatcher + msg-row wrap + remove quickClassify + remove timeline.js call)
src/public/js/timeline.js                         DELETE (replaced by inline ts in msg-row)

test/e2e/filter-flow.spec.js                      EXTEND (sub-toggle + per-card + perf basic)
docs/debugging.md                                 UPDATE (新分类 + sub-toggle + 性能模型说明)
```

不再修改：列表页、所有后端文件（含 routes/parser 之外）、`vendor/`。
