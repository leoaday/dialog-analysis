function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }
function lineCount(s) { return s ? s.split("\n").length : 0; }

function diffLines(oldS, newS) {
  // Simple line-level LCS for diff display.
  const a = (oldS || "").split("\n");
  const b = (newS || "").split("\n");
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { ops.unshift({ type: "ctx", text: a[i - 1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { ops.unshift({ type: "add", text: b[j - 1] }); j--; }
    else if (i > 0) { ops.unshift({ type: "del", text: a[i - 1] }); i--; }
  }
  return ops;
}

function renderDiff(ops) {
  return ops.map((op) => {
    const cls = op.type;
    const sym = op.type === "add" ? "+" : op.type === "del" ? "−" : " ";
    return `<div class="diff-line ${cls}"><span class="diff-sym">${sym}</span><span class="diff-text">${escapeHtml(op.text)}</span></div>`;
  }).join("");
}

function renderEdit(toolUse) {
  const { file_path = "", old_string = "", new_string = "" } = toolUse.input || {};
  const ops = diffLines(old_string, new_string);
  const adds = ops.filter((o) => o.type === "add").length;
  const dels = ops.filter((o) => o.type === "del").length;
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-edit" data-kind="tool_edit">
  <div class="tool-head">
    <span class="tool-name">📝 Edit</span>
    <span class="edit-path">${escapeHtml(file_path)}</span>
    <span class="diff-count"><span class="add">+${adds}</span> <span class="del">−${dels}</span></span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Diff</summary><div class="diff-body">${renderDiff(ops)}</div></details>
</div>`;
}

function renderMultiEdit(toolUse) {
  const { file_path = "", edits = [] } = toolUse.input || {};
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  let totalAdds = 0;
  let totalDels = 0;
  const sections = edits.map((e, i) => {
    const ops = diffLines(e.old_string, e.new_string);
    totalAdds += ops.filter((o) => o.type === "add").length;
    totalDels += ops.filter((o) => o.type === "del").length;
    return `<div class="multi-edit-item"><div class="multi-edit-head">编辑 ${i + 1}</div><div class="diff-body">${renderDiff(ops)}</div></div>`;
  }).join("");
  return `<div class="tool tool-edit" data-kind="tool_edit">
  <div class="tool-head">
    <span class="tool-name">📝 MultiEdit</span>
    <span class="edit-path">${escapeHtml(file_path)} (${edits.length} edits)</span>
    <span class="diff-count"><span class="add">+${totalAdds}</span> <span class="del">−${totalDels}</span></span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Diffs</summary>${sections}</details>
</div>`;
}

function renderWrite(toolUse) {
  const { file_path = "", content = "" } = toolUse.input || {};
  const lines = lineCount(content);
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";
  return `<div class="tool tool-edit" data-kind="tool_edit">
  <div class="tool-head">
    <span class="tool-name">📄 Write</span>
    <span class="edit-path">${escapeHtml(file_path)}</span>
    <span class="diff-count"><span class="add">+${lines}</span></span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>Content</summary><pre class="write-body">${escapeHtml(content)}</pre></details>
</div>`;
}

export function renderToolEdit(toolUse) {
  const name = toolUse.name;
  if (name === "Edit") return renderEdit(toolUse);
  if (name === "MultiEdit") return renderMultiEdit(toolUse);
  if (name === "Write") return renderWrite(toolUse);
  return renderEdit(toolUse); // safe fallback
}
