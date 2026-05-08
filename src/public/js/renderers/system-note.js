function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

export function renderSystemNote(ev) {
  return `<div class="system-note" data-kind="system">${escapeHtml(JSON.stringify(ev))}</div>`;
}
