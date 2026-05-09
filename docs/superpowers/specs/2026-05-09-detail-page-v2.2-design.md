# 详情页 v2.2 设计稿（dialog-analysis）

- 日期：2026-05-09
- 状态：与用户四节确认（§A 时间线连续 / §B 单层边框 / §C Chip 拆分控件 / §D 滚动锚定）
- 范围：详情页 v2.1 的视觉与交互打磨；列表页、后端 API 不动
- 触发：v2.1 上线后用户实际使用反馈的 4 项问题（时间线左侧不连续、双层边框割裂视觉流、chip 三态操作不便、显示/隐藏切换后视口跳动）

## 0. 目标与非目标

**目标**

1. 时间线左侧的颜色竖线与圆点贯穿整条 `.msg-row` 高度（不再止于 `.ts` 单元高度），长消息不再视觉断开。
2. 整个 `.convo-grid` 用一个统一的圆角矩形容器收口；移除每条卡片的独立外边框 / 圆角；卡片间用底部 1px 分隔线分隔；左侧用 3px 颜色竖线表示 kind。
3. Chip 从 3 态轮转改为 **"显示/隐藏" 主体 + 嵌入右侧 checkbox 控展开/折叠**。两者点击区域分离、互不影响。
4. 切换显示/隐藏时滚动锚定：保留切换前在视口顶部的"第一条完整可见消息"在切换后的相对位置不变。

**非目标**

- 列表页 UI、后端 API、解析层不动
- 不引入新依赖、不引入构建步骤
- 不改变现有 13 类分类法
- 不改变 `localStorage["da:filter:v2"]` 的 key（值结构升级，需 v2→v2.2 一次性迁移）
- **放弃 `display: contents` 回退**：只支持 CSS subgrid，覆盖率 ~95%（Chrome 117+/Firefox 71+/Safari 16+）。Edge/Chrome 116- 用户视觉降级（时间线列退化为分隔线但消息仍可读）

## §A 时间线连续（覆盖 #1）

**当前问题**：`.ts` 元素的 `border-left: 3px solid <color>` 限制在 `.ts` 自身高度（约 30-50px），长消息行 `.msg-cell` 高度可达 200-500px，左侧颜色竖线呈现"短一截"的断裂感。

**根因**：`.ts` 是 sticky 子元素，其高度 ≠ grid row 高度。grid row 高度由 `.msg-cell` 决定。

**修复**：

将颜色竖线从 `.ts` 移到 `.msg-row` 上：

```css
.msg-row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  border-left: 3px solid var(--ts-color);
  padding-left: 6px;
}
.msg-row[data-kind="user"] { --ts-color: #3b82f6; }
.msg-row[data-kind="assistant"] { --ts-color: #10b981; }
.msg-row[data-kind="subagent"] { --ts-color: #7c3aed; }
.msg-row[data-kind="tool"],
.msg-row[data-kind="tool_edit"],
.msg-row[data-kind="tool_read"],
.msg-row[data-kind="tool_todowrite"],
.msg-row[data-kind="ask"],
.msg-row[data-kind="tool_rejection"] { --ts-color: #94a3b8; }
.msg-row[data-kind="thinking"],
.msg-row[data-kind="compact"],
.msg-row[data-kind="system"],
.msg-row[data-kind="unknown"] { --ts-color: #cbd5e1; }
```

`.ts` 移除自身的 `border-left` / `padding-left`，仅负责显示时间数字 + delta。

**放弃 display: contents 回退**：v2.1 同时维护 subgrid 和 contents 两种布局策略，subgrid 时 `.msg-row` 是 grid container 可承载 border。`display: contents` 时 `.msg-row` 不参与布局，无法承载 border-left。v2.2 简化为只用 subgrid，删除 `@supports` 块。Chrome 116- / Firefox 70- / Safari 15- 用户在这种回退下时间线列消失但消息仍正常显示。

## §B 单层边框（覆盖 #2）

**当前问题**：每张消息卡（`details.row`、`.tool`、`.tool-skill`、`.tool-edit` 等）各有 `border + border-radius + background`，叠加 `.convo-grid` 内的 padding 形成"卡片堆积"视觉，对话流被切碎。

**修复**：

1. **整个 `.convo-grid` 加一层统一容器样式**：
   ```css
   .convo-grid {
     background: var(--panel);
     border: 1px solid var(--border);
     border-radius: 10px;
     overflow: hidden;
   }
   ```

2. **移除每张卡片的外部边框/圆角**，改用底部 1px 分隔线：
   ```css
   .msg-row { border-bottom: 1px solid var(--border); }
   .msg-row:last-of-type { border-bottom: none; }

   /* 卡片内层 */
   details.row, .tool { border: none; border-radius: 0; }
   ```

3. **保留 kind 语义色**作为左侧 3px 竖线（即 §A 的 `--ts-color`），不再用整块 background 填充。这意味着：
   - `details.row.user` 不再蓝底（v1 IM 风格的右贴蓝气泡放弃；改为左对齐普通行 + 左侧蓝色竖线表明 user）
   - `.tool-edit` / `.tool-rejection` / `.tool-ask` / `.tool-agent` 等不再有专属背景色，只保留竖线颜色或左侧小图标区分
   - 例外：`.diff-line.add/del/ctx` 内部仍用色块（diff 内容自身需要红绿配色，与卡片背景无关）

4. **卡片内 `.tool-section <details>`** 仍可独立背景（暗色 pre block 等，与外层无冲突）。

**视觉示意**：

```
┌────────── .convo-grid ──────────┐
│ 14:08:10  | [user content]       │
│           ├────────────────────  │   ← border-bottom 分隔
│ 14:08:13  | [assistant content]  │
│   +3s     ├────────────────────  │
│ 14:08:14  | [tool: Bash ...]     │
│   +1s     ├────────────────────  │
│ ...                              │
└──────────────────────────────────┘
```

左侧 timeline 列与 message 列共享外圆角容器；vertical 颜色竖线由 `.msg-row` 的 `border-left` 提供，跨整行高。

## §C Chip 拆分控件（覆盖 #3）

**当前问题**：v2.1 chip 三态轮转 (`open` → `folded` → `hidden` → `open`)。用户想"折叠 user"得连点 2 次；想从 `hidden` 切回 `open` 得点 2 次。语义不直观、操作链路长。

**新形态**（用户已选 "嵌入右侧 checkbox"）：

```
[ user        ☑ ]   显示 + 展开
[ user        ☐ ]   显示 + 折叠
[ user          ]   隐藏（chip 灰底删除线，checkbox 隐藏占位保留）
```

**结构与行为**：

```html
<div class="chip" data-kind="user" data-visible="true" data-expanded="true" role="button" tabindex="0">
  <span class="chip-label">user</span>
  <input type="checkbox" class="chip-fold" tabindex="0" />
</div>
```

(用 `<div role="button">` 而非嵌套 `<button>` + `<input>` — 后者是 HTML 语义无效。`role="button"` + `tabindex="0"` 保留键盘可达性。)

- chip 主体（除 checkbox 之外的点击区）→ 切换 `data-visible` 真假，更新 `body[data-show-user]` 属性，CSS 控 `display`
- `input.chip-fold` 点击 → 切换 `data-expanded`；JS `stopPropagation` 阻止冒泡到 chip 主体；批量写当前 kind 的所有 `<details>` `open = expanded`
- 隐藏态时 chip 整体灰、文字带删除线；checkbox `visibility: hidden` 占位保留以避免 chip 宽度跳动

**事件路由**：

```javascript
container.addEventListener("click", (e) => {
  const cb = e.target.closest(".chip-fold");
  const chip = e.target.closest(".chip[data-kind]");
  if (!chip) return;
  const kind = chip.dataset.kind;
  if (cb) {
    // checkbox click — toggle expanded only
    e.stopPropagation();
    state[kind].expanded = cb.checked;  // checkbox 自身已切换 .checked
  } else {
    // chip body click — toggle visible
    state[kind].visible = !state[kind].visible;
  }
  saveFilterState(state);
  applyChipState(chip, state[kind]);
  setBodyShow(kind, state[kind].visible);
  if (state[kind].visible) batchSetDetails(root, kind, state[kind].expanded);
});
```

**State 结构升级 + 迁移**：

```javascript
// v2.1 (旧)
{ user: "open", tool: "folded", system: "hidden", ... }

// v2.2 (新)
{
  user: { visible: true, expanded: true },
  tool: { visible: true, expanded: false },
  system: { visible: false, expanded: false },
  ...
}
```

`loadFilterState` 加迁移：

```javascript
function loadFilterState() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    const out = {};
    for (const k of KINDS) {
      const v = stored[k];
      if (v && typeof v === "object") out[k] = { ...DEFAULTS_RICH[k], ...v };
      else if (typeof v === "string") {
        // migrate v2.1 string state → object
        out[k] = { visible: v !== "hidden", expanded: v === "open" };
      } else {
        out[k] = { ...DEFAULTS_RICH[k] };
      }
    }
    return out;
  } catch { return Object.fromEntries(KINDS.map((k) => [k, { ...DEFAULTS_RICH[k] }])); }
}
```

`DEFAULTS_RICH` 把字符串 defaults 改为对象 defaults：

```javascript
const DEFAULTS_RICH = {
  user: { visible: true, expanded: true },
  assistant: { visible: true, expanded: true },
  thinking: { visible: true, expanded: true },
  tool: { visible: true, expanded: false },
  tool_edit: { visible: true, expanded: false },
  // ...
  system: { visible: false, expanded: false },
  unknown: { visible: false, expanded: false },
};
```

**视觉**：chip class 现在反映两个 boolean 而非单字符串：

```html
<!-- visible+expanded -->  <button class="chip chip-visible chip-expanded" ...>
<!-- visible+folded -->    <button class="chip chip-visible" ...>
<!-- hidden -->            <button class="chip chip-hidden" ...>
```

CSS 据此区分背景/边框/checkbox 显示：

```css
.chip { ... default visible+folded look ... }
.chip-hidden { background: #f3f4f6; color: #9ca3af; text-decoration: line-through; border-color: #e3e6eb; }
.chip-hidden .chip-fold { visibility: hidden; }
.chip-fold { margin-left: 6px; cursor: pointer; }
```

## §D 滚动锚定（覆盖 #4）

**目标**：用户切换 chip 显示/隐藏后，原本在视口顶部第一条完整可见的消息保持在屏幕中相同位置。

**算法**：

```javascript
function captureAnchor() {
  const rows = document.querySelectorAll("#conversation .msg-row");
  for (const r of rows) {
    const rect = r.getBoundingClientRect();
    if (rect.top >= 0) {
      return { idx: r.dataset.idx, offsetTop: rect.top };
    }
  }
  return null;
}

function restoreAnchor(anchor) {
  if (!anchor) return;
  // try the same row first
  let row = document.querySelector(`#conversation .msg-row[data-idx="${anchor.idx}"]`);
  // if it was hidden by the toggle, walk forward to find next visible
  while (row && getComputedStyle(row).display === "none") row = row.nextElementSibling;
  if (!row) return;
  const newTop = row.getBoundingClientRect().top;
  window.scrollBy({ top: newTop - anchor.offsetTop, behavior: "instant" });
}

// in setChipState():
const anchor = captureAnchor();
// ... existing toggle logic ...
restoreAnchor(anchor);
```

**集成点**：仅 chip 主体（visible 切换）需要 anchor。Checkbox（expand/fold）不调（消息位置不变化、只是细节展开/折叠，但展开/折叠也会改变高度——也需要锚定）。结论：**chip 主体 + checkbox 都加锚定**。

**消息 idx 标识**：渲染时 `wrapMsgRow` 已经按事件顺序生成；增加 `data-idx="<i>"` 属性即可。

**性能**：`captureAnchor` 遍历 N 个 `.msg-row` 找首个 `top >= 0`。对 583 行的会话，浏览器 `getBoundingClientRect()` ~0.01ms × N = ~6ms。可优化为二分（按 idx 顺序，top 单调递增），但 6ms 完全可接受，先不优化。

**`scrollBy({ behavior: "instant" })`**：跳过滚动动画（用户感知是瞬间切换，不应有动画）。

## §E 错误处理 / 边界

| 场景 | 行为 |
|---|---|
| 旧 v2.1 localStorage state 加载 | 自动迁移（字符串 → 对象），不抛错 |
| `captureAnchor` 找不到任何 `top >= 0` 的 row（视口在末尾以下） | 返回 null，restore 不动 |
| `restoreAnchor` 时 anchor row 已被隐藏 | 顺向查找下一条可见 row 作 anchor 替代 |
| 无可见 row（用户隐藏了全部 kind） | restore 静默不动 |
| subgrid 不支持的浏览器 | 退化：消息列正常显示，时间线左侧颜色竖线消失，时间数字仍显示。布局可用但视觉降级 |
| Chip checkbox 在 hidden 状态下被键盘聚焦 | tabindex 仍可访问，但 checked 无视觉效果（visibility:hidden）。低优先级，留 a11y follow-up |

## §F 测试

1. **e2e 扩展（filter-flow.spec.js）**：
   - 替换原 "filter chip three-state cycle" 测试为新行为：(a) chip 主体点击只切 visible，不影响 expanded；(b) checkbox 点击只切 expanded，不影响 visible；(c) reload 后保留两个独立状态
   - 新增 "v2.1 旧 localStorage state 自动迁移到 v2.2" 测试：手工 `localStorage.setItem("da:filter:v2", JSON.stringify({user:"folded"}))` 然后刷新，断言 `state.user.visible === true && state.user.expanded === false`
   - 新增 "scroll anchor preserves view" 测试：滚到中间，记录 viewport 第一条 row 的 top；点击隐藏靠前的某 chip；断言 anchor row 的 top 偏移 < 5px
2. **e2e 现有测试**：
   - "hidden chip removes msg-row" — 仍有效，但点击次数从 2 减到 1
   - "tool sub-toggle" — 不受影响
   - "per-card details click" — 不受影响（per-card details 仍存在）
3. **手动可视检查**：
   - 时间线左侧颜色竖线连续覆盖整行高度
   - 整个 convo-grid 一个统一外框
   - chip checkbox 点击区与 chip 主体可分别独立点击

## §G 与现状关系

涉及修改：

```
src/public/styles.css                       MODIFY
  - 移除 .msg-row .ts 的 border-left / padding-left
  - 给 .msg-row 加 border-left（subgrid 模式）
  - .convo-grid 加统一容器外框
  - 移除 details.row 和 .tool 的 border / border-radius
  - 加 .msg-row { border-bottom: 1px solid var(--border); }
  - 移除 .msg-row { display: contents } 回退分支
  - .chip 旧的 chip-open / chip-folded / chip-hidden 改为 chip-visible / chip-expanded / chip-hidden 双 boolean class
  - .chip-fold (checkbox) 样式

src/public/js/filter-chips.js               REWRITE chip rendering + state model
  - DEFAULTS_RICH 替换 DEFAULTS
  - loadFilterState 加 v2.1 string→object 迁移
  - renderChip 改输出：chip body + nested checkbox
  - bindChips 路由：chip body click vs checkbox click
  - setChipState 拆为 setVisible(kind) / setExpanded(kind)

src/public/js/scroll-anchor.js              CREATE
  - captureAnchor() / restoreAnchor()

src/public/js/session.js                    MODIFY
  - wrapMsgRow 加 data-idx 属性
  - 集成 captureAnchor / restoreAnchor 到 chip click 流程（实际接入点在 filter-chips.js）

test/e2e/filter-flow.spec.js                EXTEND
  - 替换三态测试为新双控件测试
  - 加迁移测试
  - 加滚动锚定测试

docs/debugging.md                           UPDATE
  - 第 7 节 Filter chips behavior 改写：新双控件 + 状态迁移说明
```

不动：列表页、所有后端、parser、其他 renderer 文件。
