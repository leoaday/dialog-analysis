function contentArr(ev) {
  const c = ev?.message?.content;
  return Array.isArray(c) ? c : [];
}

export function isHumanTurn(ev) {
  if (ev?.type !== "user") return false;
  if (ev.isMeta || ev.isCompactSummary) return false;
  const c = ev.message?.content;
  if (typeof c === "string") return true;
  if (!Array.isArray(c) || c.length === 0) return false;
  return c.some((p) => p.type === "text" || p.type === "image");
}

export function classifyEvent(ev) {
  if (ev?.type === "system") {
    if (ev.subtype === "compact_boundary") return "compact_boundary";
    return "system_other";
  }
  if (ev?.type === "user") {
    if (ev.isCompactSummary) return "compact_summary";
    const arr = contentArr(ev);
    if (arr.length && arr.every((p) => p.type === "tool_result")) return "tool_result";
    return "user_text";
  }
  if (ev?.type === "assistant") {
    const arr = contentArr(ev);
    if (arr.some((p) => p.type === "tool_use")) return "tool_use";
    if (arr.some((p) => p.type === "thinking")) return "thinking";
    return "assistant_text";
  }
  return ev?.type || "unknown";
}
