function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

function countLines(s) { return s ? s.split("\n").filter((l) => l.length).length : 0; }

export function renderToolGlobGrep(toolUse, toolResult) {
  const name = toolUse.name; // "Glob" or "Grep"
  const isGlob = name === "Glob";
  const pattern = toolUse.input?.pattern || "";
  const pathArg = toolUse.input?.path || "";
  const out = resultText(toolResult);
  const matchCount = countLines(out);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  const patternDisplay = isGlob ? pattern : `"${pattern}"`;
  const pathDisplay = pathArg ? ` in ${pathArg}` : "";

  return `<div class="tool tool-glob-grep" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">🔎 ${escapeHtml(name)}</span>
    <span class="search-summary">${escapeHtml(patternDisplay)}${escapeHtml(pathDisplay)} → ${matchCount} matches</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Matches</summary><pre class="search-out">${escapeHtml(out || "(no matches)")}</pre></details>
</div>`;
}
