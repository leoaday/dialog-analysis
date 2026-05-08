import { md } from "../markdown.js";

export function renderCompact(ev) {
  const meta = ev.compactMetadata || {};
  const summary = ev.summary || "";
  return `<div class="compact-block">
    <div class="compact"><span class="badge">上下文压缩 · pre ${meta.preTokens || 0} · ${meta.trigger || ""}</span></div>
    ${summary ? `<details class="compact-summary" data-kind="system" open><summary><span class="title">压缩摘要</span><span class="len">${summary.length} 字</span></summary><div class="body">${md(summary)}</div></details>` : ""}
  </div>`;
}
