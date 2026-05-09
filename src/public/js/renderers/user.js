import { md } from "../markdown.js";

export function renderUser(ev) {
  const c = ev.message?.content;
  let html = "";
  if (typeof c === "string") html = md(c);
  else if (Array.isArray(c)) {
    html = c.map((p) => p.type === "text" ? md(p.text || "") : "").join("");
  }
  return `<details class="row user" data-kind="user" open><summary class="meta">user</summary><div class="bubble">${html}</div></details>`;
}
