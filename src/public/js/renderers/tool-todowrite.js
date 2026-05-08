function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function shortId(id) { return id ? id.slice(0, 10) + "…" : ""; }

const STATUS_BOX = { completed: "☑", in_progress: "▶", pending: "☐" };

export function renderToolTodoWrite(toolUse) {
  const todos = toolUse.input?.todos || [];
  const done = todos.filter((t) => t.status === "completed").length;
  const inProg = todos.filter((t) => t.status === "in_progress").length;
  const idAttr = toolUse.id ? ` title="${escapeHtml(toolUse.id)}"` : "";

  const items = todos.map((t) => {
    const box = STATUS_BOX[t.status] || "☐";
    const cls = t.status === "completed" ? "todo-item done" : t.status === "in_progress" ? "todo-item active" : "todo-item";
    const text = t.content || t.activeForm || "";
    return `<div class="${cls}"><span class="box">${box}</span><span class="text">${escapeHtml(text)}</span></div>`;
  }).join("");

  return `<div class="tool tool-todowrite" data-kind="tool_todowrite">
  <div class="tool-head">
    <span class="tool-name">✅ TodoWrite</span>
    <span class="todo-summary">${done}/${todos.length} done${inProg ? ` · ${inProg} in_progress` : ""}</span>
    <span class="tool-id"${idAttr}>${escapeHtml(shortId(toolUse.id || ""))}</span>
  </div>
  <details class="tool-section"><summary>List</summary><div class="todo-list">${items}</div></details>
</div>`;
}
