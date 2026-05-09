function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

function rejectionText(toolResult) {
  const c = toolResult?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const first = c.find((p) => p?.type === "text");
    return first?.text || "";
  }
  return "";
}

export function renderToolRejection(toolResult) {
  const text = rejectionText(toolResult);
  return `<div class="tool tool-rejection" data-kind="tool_rejection">
  <div class="tool-head">
    <span class="tool-name">⛔ 拒绝</span>
    <span class="rejection-summary">用户拒绝了一个工具调用</span>
  </div>
  <pre class="rejection-body">${escapeHtml(text)}</pre>
</div>`;
}
