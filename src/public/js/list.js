import { api } from "./api.js";
import { showDirPicker } from "./dir-picker.js";

const params = new URL(location.href).searchParams;
let currentDir = params.get("dir") || "";

const $crumb = document.getElementById("breadcrumb");
const $banner = document.getElementById("banner");
const $container = document.getElementById("list-container");

function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

function renderBreadcrumb(p) {
  if (!p) { $crumb.innerHTML = `<span style="color:var(--muted);">未选择目录</span>`; return; }
  const parts = p.split("/").filter(Boolean);
  let acc = "";
  const links = [`<a data-p="/">/</a>`];
  for (const part of parts) { acc += `/${part}`; links.push(`<a data-p="${acc}">${escapeHtml(part)}</a>`); }
  $crumb.innerHTML = links.join("<span style='color:var(--muted);'>/</span>");
  $crumb.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => goto(a.dataset.p)));
}

function fmtTokens(t) { return `${t.input}/${t.output}/${t.cacheRead}`; }
function fmtMtime(s) { return new Date(s).toLocaleString(); }

function renderSessionsTable(sessions, opts = {}) {
  if (!sessions.length) { $container.innerHTML = `<div class="empty-state">无会话</div>`; return; }
  const rows = sessions.map((s) => sessionRow(s, opts)).join("");
  $container.innerHTML = `<table class="session-table">
    <thead><tr><th>ID</th><th>mtime</th><th>轮次</th><th>tokens (in/out/cacheRead)</th><th>首条摘要</th><th>subagent</th><th>详情</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  bindRowEvents();
}

function sessionRow(s, opts) {
  const subagentOnly = opts.search && !s.hitInSession && s.hitInSubagent;
  const klass = subagentOnly ? "subagent-only" : "";
  const idShort = s.sessionId.slice(0, 8);
  const subBtn = `<button class="expand" data-id="${s.sessionId}">▶ ${s.subagentCount}</button>`;
  const hits = opts.search && (s.hitInSession || s.hitInSubagent) ?
    `<span class="hits">${(s.sessionMatches?.length || 0) + (s.subagentMatches?.reduce((a,b)=>a+b.count,0)||0)} hits</span>` : "";
  const note = subagentOnly ? `<div style="color:var(--muted);font-size:11px;">会话本体未命中，子代理命中</div>` : "";
  const detailHref = `/session.html?file=${encodeURIComponent(s.file)}${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}`;
  return `<tr class="${klass}" data-id="${s.sessionId}">
    <td><span title="${escapeHtml(s.file)}">${idShort}</span>${hits}</td>
    <td>${fmtMtime(s.mtime)}</td>
    <td>${s.rounds}</td>
    <td>${fmtTokens(s.tokens)}</td>
    <td class="summary-cell">${escapeHtml(s.firstUserSummary)}${note}</td>
    <td>${subBtn}</td>
    <td><a href="${detailHref}">查看</a></td>
  </tr>${renderSubRow(s, opts)}`;
}

function renderSubRow(s, opts) {
  const subs = opts.search ? (s.subagentMatches || []).map((m) => s.subagents.find((x) => x.agentId === m.agentId)).filter(Boolean) : s.subagents;
  if (!subs.length) return "";
  const open = opts.search && s.hitInSubagent;
  const display = open ? "" : "display:none;";
  const items = subs.map((sa) => `<tr><td>${sa.agentId.slice(0,10)}</td><td>${escapeHtml(sa.agentType || "")}</td><td>${escapeHtml(sa.firstPromptSummary)}</td><td><a href="/session.html?file=${encodeURIComponent(sa.file)}&kind=subagent${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}">查看</a></td></tr>`).join("");
  return `<tr class="subagent-row" data-parent="${s.sessionId}" style="${display}"><td colspan="7"><table class="subagent-table"><tbody>${items}</tbody></table></td></tr>`;
}

function bindRowEvents() {
  document.querySelectorAll(".expand").forEach((btn) => btn.addEventListener("click", () => {
    const row = document.querySelector(`tr.subagent-row[data-parent="${btn.dataset.id}"]`);
    if (!row) return;
    row.style.display = row.style.display === "none" ? "" : "none";
  }));
}

async function loadList(dir) {
  if (!dir) { $container.innerHTML = `<div class="empty-state">请先选择分析目录</div>`; return; }
  sessionStorage.setItem("da:lastDir", dir);
  $container.innerHTML = `<div class="empty-state">加载中…</div>`;
  try {
    const body = await api("/api/sessions", { dir });
    renderSessionsTable(body.sessions, { search: false });
  } catch (e) {
    $banner.textContent = `加载失败：${e.message}`; $banner.style.display = "block";
  }
}

async function runSearch(q, regex) {
  const $btn = document.getElementById("search");
  $btn.disabled = true; $btn.textContent = "搜索中…";
  try {
    const body = await api("/api/search", { dir: currentDir, q, regex: regex ? "1" : "0" });
    renderSessionsTable(body.sessions, { search: true, q });
    document.getElementById("clear").hidden = false;
  } catch (e) {
    $banner.textContent = `搜索失败：${e.message}`; $banner.style.display = "block";
  } finally { $btn.disabled = false; $btn.textContent = "搜索"; }
}

function goto(dir) { currentDir = dir; renderBreadcrumb(dir); loadList(dir); }

document.getElementById("pick").addEventListener("click", async () => {
  const p = await showDirPicker(currentDir || "/Users");
  if (p) goto(p);
});

document.getElementById("pick-native").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) { alert("仅 Chrome/Edge 支持"); return; }
  try {
    const handle = await window.showDirectoryPicker();
    alert(`已选择目录: ${handle.name}\n请在弹层中输入完整绝对路径以继续。`);
  } catch {}
});

document.getElementById("refresh").addEventListener("click", () => loadList(currentDir));

document.getElementById("search").addEventListener("click", () => {
  const q = document.getElementById("q").value.trim();
  if (!q) return;
  runSearch(q, document.getElementById("regex").checked);
});

document.getElementById("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("search").click();
  if (e.key === "Escape") document.getElementById("clear").click();
});

document.getElementById("clear").addEventListener("click", () => {
  document.getElementById("q").value = "";
  document.getElementById("clear").hidden = true;
  loadList(currentDir);
});

renderBreadcrumb(currentDir);
loadList(currentDir);
