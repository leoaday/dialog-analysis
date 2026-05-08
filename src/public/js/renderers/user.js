import { md } from "../markdown.js";

export function renderUser(ev) {
  const c = ev.message?.content;
  let html = "";
  if (typeof c === "string") html = md(c);
  else if (Array.isArray(c)) {
    html = c.map((p) => p.type === "text" ? md(p.text || "") : "").join("");
  }
  return `<div class="row user" data-kind="user_text"><div class="meta">user</div><div class="bubble">${html}</div></div>`;
}
