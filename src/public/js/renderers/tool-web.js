function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

function renderFetch(toolUse, toolResult) {
  const url = toolUse.input?.url || "";
  const prompt = toolUse.input?.prompt || "";
  const out = resultText(toolResult);
  const urlShort = url.length > 60 ? url.replace(/^https?:\/\//, "").slice(0, 50) + "…" : url.replace(/^https?:\/\//, "");
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-web" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🌐 WebFetch</span>
    <span class="web-url">${escapeHtml(urlShort)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>URL & Prompt</summary><div class="web-meta"><div><strong>URL</strong> ${escapeHtml(url)}</div><div><strong>Prompt</strong> ${escapeHtml(prompt)}</div></div></details>
  <details class="tool-section"><summary>Result</summary><pre class="web-out">${escapeHtml(out || "(尚无返回)")}</pre></details>
</div>`;
}

function renderSearch(toolUse, toolResult) {
  const query = toolUse.input?.query || "";
  const out = resultText(toolResult);
  const resultCount = (out.match(/^Title: /gm) || out.split(/\n\n+/).filter(Boolean)).length || 0;
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-web" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🔍 WebSearch</span>
    <span class="web-query">"${escapeHtml(query)}"</span>
    <span class="search-summary">→ ${resultCount} results</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Results</summary><pre class="web-out">${escapeHtml(out || "(尚无返回)")}</pre></details>
</div>`;
}

export function renderToolWeb(toolUse, toolResult) {
  if (toolUse.name === "WebFetch") return renderFetch(toolUse, toolResult);
  if (toolUse.name === "WebSearch") return renderSearch(toolUse, toolResult);
  return renderFetch(toolUse, toolResult);
}
