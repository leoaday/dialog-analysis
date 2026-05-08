function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

export function renderTool(toolUse, toolResult) {
  const name = toolUse.name || "tool";
  const isAgent = name === "Agent" || name === "Task";
  const inputJson = JSON.stringify(toolUse.input || {}, null, 2);
  let resultHtml = "";
  if (!toolResult) resultHtml = `<div class="no-result">尚无返回</div>`;
  else {
    const c = toolResult.content;
    if (typeof c === "string") resultHtml = `<pre class="result">${escapeHtml(c)}</pre>`;
    else if (Array.isArray(c)) {
      resultHtml = c.map((p) => p.type === "text" ? `<pre class="result">${escapeHtml(p.text || "")}</pre>` : "").join("");
    }
  }
  const kind = isAgent ? "subagent" : "tool";
  return `<div class="tool" data-kind="${kind}"><div class="tool-head"><span class="tool-name">🔧 ${escapeHtml(name)}</span><span class="tool-id">${toolUse.id || ""}</span></div><pre class="tool-input">${escapeHtml(inputJson)}</pre>${resultHtml}</div>`;
}
