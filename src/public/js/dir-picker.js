import { api } from "./api.js";

function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

export function showDirPicker(initialPath) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `<div class="modal">
      <h3>选择目录</h3>
      <input id="m-path" type="text" value="${escapeHtml(initialPath || "")}" />
      <div class="picker-list" id="m-list"></div>
      <div class="actions">
        <button id="m-cancel">取消</button>
        <button id="m-ok">确定</button>
      </div>
    </div>`;
    document.body.appendChild(back);
    const $path = back.querySelector("#m-path");
    const $list = back.querySelector("#m-list");

    async function render(p) {
      $path.value = p;
      try {
        const body = await api("/api/list-dir", { path: p });
        $list.innerHTML = "";
        if (body.parent) {
          const up = mkItem("📁 .. (上一级)", "dir", body.parent);
          $list.appendChild(up);
        }
        for (const e of body.entries) {
          if (e.type === "dir" || e.type === "jsonl-dir") {
            const tag = e.type === "jsonl-dir" ? `<span class="badge">${e.sessionCount} 会话</span>` : "";
            const item = mkItem(`📁 ${escapeHtml(e.name)}`, "dir", `${p}/${e.name}`.replace(/\/+/g, "/"), tag);
            $list.appendChild(item);
          }
        }
      } catch (e) { $list.innerHTML = `<div style="color:#dc2626;padding:8px;">${e.message}</div>`; }
    }
    function mkItem(label, cls, target, badge = "") {
      const div = document.createElement("div");
      div.className = `item ${cls}`;
      div.innerHTML = `<span>${label}</span>${badge}`;
      div.addEventListener("dblclick", () => render(target));
      div.addEventListener("click", () => $path.value = target);
      return div;
    }

    back.querySelector("#m-cancel").onclick = () => { back.remove(); resolve(null); };
    back.querySelector("#m-ok").onclick = () => { const v = $path.value.trim(); back.remove(); resolve(v); };
    $path.addEventListener("keydown", (e) => { if (e.key === "Enter") render($path.value); });
    render(initialPath || "/");
  });
}
