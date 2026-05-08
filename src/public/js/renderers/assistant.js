import { md } from "../markdown.js";

export function renderAssistantText(ev) {
  const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
  const text = arr.filter((p) => p.type === "text").map((p) => p.text || "").join("\n\n");
  if (!text) return "";
  return `<div class="row assistant" data-kind="assistant_text"><div class="meta">assistant</div><div class="bubble">${md(text)}</div></div>`;
}
