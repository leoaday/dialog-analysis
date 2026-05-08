import { md } from "../markdown.js";

export function renderThinking(ev) {
  const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
  const ts = arr.filter((p) => p.type === "thinking").map((p) => p.thinking || "").join("\n\n");
  if (!ts) return "";
  return `<details class="thinking" data-kind="thinking" open><summary>💭 思考</summary><div class="thinking-body">${md(ts)}</div></details>`;
}
