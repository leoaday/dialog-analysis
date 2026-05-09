import { md } from "../markdown.js";

export function renderAssistantText(ev) {
  const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
  const text = arr.filter((p) => p.type === "text").map((p) => p.text || "").join("\n\n");
  if (!text) return "";
  return `<details class="row assistant" data-kind="assistant" open><summary class="meta">assistant</summary><div class="bubble">${md(text)}</div></details>`;
}
