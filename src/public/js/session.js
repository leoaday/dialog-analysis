import { api } from "./api.js";
import { renderUser } from "./renderers/user.js";
import { renderAssistantText } from "./renderers/assistant.js";
import { renderThinking } from "./renderers/thinking.js";
import { renderTool } from "./renderers/tool.js";
import { renderCompact } from "./renderers/compact.js";
import { renderSystemNote } from "./renderers/system-note.js";
import { bindFoldToggles } from "./fold-toggles.js";
import { highlightAll } from "./highlight-q.js";

const params = new URL(location.href).searchParams;
const file = params.get("file");
const kind = params.get("kind") || "session";
const q = params.get("q") || "";

const $title = document.getElementById("title");
const $stats = document.getElementById("stats");
const $banner = document.getElementById("banner");
const $conv = document.getElementById("conversation");
const $back = document.getElementById("back");
if (kind === "subagent") document.body.classList.add("kind-subagent");
const lastDir = sessionStorage.getItem("da:lastDir");
if (lastDir) $back.href = `/?dir=${encodeURIComponent(lastDir)}`;

function buildToolResultIndex(events) {
  const idx = new Map();
  for (const ev of events) {
    if (ev?.type === "user") {
      const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
      for (const p of arr) if (p.type === "tool_result") idx.set(p.tool_use_id, p);
    }
  }
  return idx;
}

function renderEvent(ev, toolResults) {
  if (ev?.type === "system") {
    if (ev.subtype === "compact_boundary") return renderCompact(ev);
    return renderSystemNote(ev);
  }
  if (ev?.type === "user") {
    if (ev.isCompactSummary) return ""; // attached to compact_boundary already
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    if (arr.length && arr.every((p) => p.type === "tool_result")) return ""; // pair shown via tool_use
    return renderUser(ev);
  }
  if (ev?.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const out = [];
    if (arr.some((p) => p.type === "thinking")) out.push(renderThinking(ev));
    if (arr.some((p) => p.type === "text")) out.push(renderAssistantText(ev));
    for (const p of arr) if (p.type === "tool_use") out.push(renderTool(p, toolResults.get(p.id)));
    return out.join("");
  }
  if (ev?.type === "queue-operation") return ""; // hide
  return renderSystemNote(ev);
}

function attachCompactSummaries(events) {
  // events of type=user isCompactSummary: attach summary to the previous compact_boundary
  let pendingCompact = null;
  for (const ev of events) {
    if (ev?.type === "system" && ev.subtype === "compact_boundary") pendingCompact = ev;
    else if (ev?.type === "user" && ev.isCompactSummary && pendingCompact) {
      const c = ev.message?.content;
      pendingCompact.summary = typeof c === "string" ? c : "";
      pendingCompact = null;
    }
  }
}

async function main() {
  if (!file) { $banner.textContent = "缺少 file 参数"; $banner.style.display = "block"; return; }
  $title.textContent = decodeURIComponent(file);
  const endpoint = kind === "subagent" ? "/api/subagent" : "/api/session";
  let body;
  try { body = await api(endpoint, { file }); }
  catch (e) { $banner.textContent = `加载失败：${e.message}`; $banner.style.display = "block"; return; }
  if (body.malformed) { $banner.textContent = `已忽略 ${body.malformed} 行无法解析的内容`; $banner.style.display = "block"; }
  attachCompactSummaries(body.events);
  const toolResults = buildToolResultIndex(body.events);
  const html = body.events.map((ev) => renderEvent(ev, toolResults)).join("");
  $conv.innerHTML = html;
  $stats.textContent = `${body.events.length} 条事件`;
  bindFoldToggles($conv);
  if (q) highlightAll($conv, q);
}

main();
