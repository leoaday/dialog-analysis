function pieces(content) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const p of content) {
    switch (p.type) {
      case "text": if (p.text) out.push(p.text); break;
      case "thinking": if (p.thinking) out.push(p.thinking); break;
      case "tool_use":
        if (p.name) out.push(p.name);
        if (p.input) { try { out.push(JSON.stringify(p.input)); } catch {} }
        break;
      case "tool_result":
        if (typeof p.content === "string") out.push(p.content);
        else if (Array.isArray(p.content)) {
          for (const inner of p.content) {
            if (inner?.type === "text" && inner.text) out.push(inner.text);
          }
        }
        break;
      // image/tool_reference: skip
    }
  }
  return out;
}

export function extractText(ev) {
  if (!ev || typeof ev !== "object") return "";
  if (ev.type === "system") {
    return ev.subtype === "compact_boundary" ? "" : "";
  }
  if (ev.type === "user" && ev.isCompactSummary) {
    const c = ev.message?.content;
    if (typeof c === "string") return c;
  }
  return pieces(ev.message?.content).join("\n");
}
