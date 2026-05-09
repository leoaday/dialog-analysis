function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

export function renderToolBash(toolUse, toolResult) {
  const cmd = toolUse.input?.command || "";
  const cmdShort = cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd;
  const out = resultText(toolResult);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  return `<div class="tool tool-bash" data-kind="tool">
  <div class="tool-head">
    <span class="tool-name">$</span>
    <span class="bash-cmd">${escapeHtml(cmdShort)}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section tool-input"><summary>Command</summary><pre class="bash-cmd-full">${escapeHtml(cmd)}</pre></details>
  <details class="tool-section tool-output"><summary>Output</summary><pre class="bash-out">${escapeHtml(out || "(尚无返回)")}</pre></details>
</div>`;
}
