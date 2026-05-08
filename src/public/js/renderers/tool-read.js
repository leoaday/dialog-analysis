function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

export function renderToolRead(toolUse) {
  const { file_path = "", offset, limit } = toolUse.input || {};
  const range = (offset !== undefined || limit !== undefined) ? `:${offset || 1}-${(offset || 1) + (limit || 0)}` : "";
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-read" data-kind="tool_read">
  <div class="tool-head">
    <span class="tool-name">👁 Read</span>
    <span class="read-path">${escapeHtml(file_path)}${escapeHtml(range)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Args</summary><div class="read-meta">
    <div><span class="meta-key">file_path</span> ${escapeHtml(file_path)}</div>
    ${offset !== undefined ? `<div><span class="meta-key">offset</span> ${offset}</div>` : ""}
    ${limit !== undefined ? `<div><span class="meta-key">limit</span> ${limit}</div>` : ""}
    <div class="read-note">读取的文件内容不在此处展示（通常很长，且常与后续 Edit 的 old_string 重复）。</div>
  </div></details>
</div>`;
}
