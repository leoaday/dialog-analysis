function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultBody(toolResult) {
  if (!toolResult) return `<div class="no-result">尚无返回</div>`;
  const c = toolResult.content;
  if (typeof c === "string") return `<pre class="result">${escapeHtml(c)}</pre>`;
  if (Array.isArray(c)) {
    return c.map((p) => p.type === "text" ? `<pre class="result">${escapeHtml(p.text || "")}</pre>` : "").join("");
  }
  return `<div class="no-result">无法识别的返回格式</div>`;
}

export function renderTool(toolUse, toolResult, kindOverride) {
  const name = toolUse.name || "tool";
  const kind = kindOverride || "tool";
  const inputJson = JSON.stringify(toolUse.input || {}, null, 2);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool" data-kind="${kind}">
  <div class="tool-head">
    <span class="tool-name">🔧 ${escapeHtml(name)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section tool-input"><summary>Input</summary><pre>${escapeHtml(inputJson)}</pre></details>
  <details class="tool-section tool-output"><summary>Output</summary>${resultBody(toolResult)}</details>
</div>`;
}
