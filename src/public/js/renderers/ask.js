function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

function resultText(toolResult) {
  if (!toolResult) return "";
  const c = toolResult.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
  return "";
}

export function renderAsk(toolUse, toolResult) {
  const questions = toolUse.input?.questions || [];
  const answer = resultText(toolResult);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  const qsHtml = questions.map((q, i) => {
    const opts = (q.options || []).map((o) => `<li>${escapeHtml(o.label || "")}${o.description ? ` — <span class="opt-desc">${escapeHtml(o.description)}</span>` : ""}</li>`).join("");
    return `<div class="ask-question">
      <div class="ask-q-text">Q${i + 1}. ${escapeHtml(q.question || "")}</div>
      <ul class="ask-options">${opts}</ul>
    </div>`;
  }).join("");

  return `<div class="tool tool-ask" data-kind="ask">
  <div class="tool-head">
    <span class="tool-name">❓ AskUserQuestion</span>
    <span class="ask-summary">${questions.length} 题</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <div class="ask-body">${qsHtml}</div>
  ${answer ? `<details class="tool-section ask-answer" open><summary>用户答复</summary><pre>${escapeHtml(answer)}</pre></details>` : `<div class="ask-pending">等待回答…</div>`}
</div>`;
}
