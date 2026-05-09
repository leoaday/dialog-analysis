import { api } from "./api.js";
import { renderUser } from "./renderers/user.js";
import { renderAssistantText } from "./renderers/assistant.js";
import { renderThinking } from "./renderers/thinking.js";
import { renderTool } from "./renderers/tool.js";
import { renderToolEdit } from "./renderers/tool-edit.js";
import { renderToolRead } from "./renderers/tool-read.js";
import { renderToolTodoWrite } from "./renderers/tool-todowrite.js";
import { renderToolBash } from "./renderers/tool-bash.js";
import { renderToolGlobGrep } from "./renderers/tool-glob-grep.js";
import { renderToolWeb } from "./renderers/tool-web.js";
import { renderAsk } from "./renderers/ask.js";
import { renderToolRejection } from "./renderers/tool-rejection.js";
import { renderCompact } from "./renderers/compact.js";
import { renderSystemNote } from "./renderers/system-note.js";
import { renderToolSkill } from "./renderers/tool-skill.js";
import { renderToolAgent } from "./renderers/tool-agent.js";
import { bindChips } from "./filter-chips.js";
import { bindSubToggles } from "./sub-toggles.js";
import { highlightAll } from "./highlight-q.js";

const REJECTION_PREFIXES = ["User rejected", "The user doesn't want to proceed with this tool use", "[Request interrupted by user"];
function isToolRejection(toolResult) {
  const c = toolResult?.content;
  let t = ""; if (typeof c === "string") t = c;
  else if (Array.isArray(c)) { const f = c.find((p) => p?.type === "text"); t = f?.text || ""; }
  return REJECTION_PREFIXES.some((p) => t.startsWith(p));
}

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
    if (typeof ev.message?.content === "string" && ev.message.content.startsWith("<task-notification>")) {
      return renderSubagentNotification(ev);
    }
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    if (arr.length && arr.every((p) => p.type === "tool_result")) {
      // tool_result: rejection cards still render, regular tool_results are paired into tool_use renderers above
      const rej = arr.find((p) => isToolRejection(p));
      if (rej) return renderToolRejection(rej);
      return "";
    }
    return renderUser(ev);
  }
  if (ev?.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const out = [];
    if (arr.some((p) => p.type === "thinking")) out.push(renderThinking(ev));
    if (arr.some((p) => p.type === "text")) out.push(renderAssistantText(ev));
    for (const p of arr) if (p.type === "tool_use") out.push(dispatchToolUse(p, toolResults.get(p.id)));
    return out.join("");
  }
  if (ev?.type === "queue-operation") return ""; // hide
  return renderSystemNote(ev);
}

function dispatchToolUse(toolUse, toolResult) {
  // Check rejection first — even Edit/Bash with rejected result render as rejection card
  if (isToolRejection(toolResult)) return renderToolRejection(toolResult);
  const name = toolUse.name || "";
  if (name === "Edit" || name === "MultiEdit" || name === "Write") return renderToolEdit(toolUse);
  if (name === "Read") return renderToolRead(toolUse);
  if (name === "TodoWrite") return renderToolTodoWrite(toolUse);
  if (name === "Bash") return renderToolBash(toolUse, toolResult);
  if (name === "Glob" || name === "Grep") return renderToolGlobGrep(toolUse, toolResult);
  if (name === "WebFetch" || name === "WebSearch") return renderToolWeb(toolUse, toolResult);
  if (name === "AskUserQuestion") return renderAsk(toolUse, toolResult);
  if (name === "Agent" || name === "Task") return renderToolAgent(toolUse, toolResult);
  if (name === "Skill") return renderToolSkill(toolUse, toolResult);
  return renderTool(toolUse, toolResult, "tool");
}

function pad2(n) { return String(n).padStart(2, "0"); }
function fmtTime(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtDelta(ms) {
  if (ms === null || ms === undefined) return "";
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "−" : "+";
  if (abs < 1000) return `${sign}0s`;
  if (abs < 60_000) return `${sign}${Math.floor(abs / 1000)}s`;
  if (abs < 3_600_000) return `${sign}${Math.floor(abs / 60_000)}m`;
  if (abs < 86_400_000) return `${sign}${Math.floor(abs / 3_600_000)}h`;
  return `${sign}${Math.floor(abs / 86_400_000)}d`;
}

function quickKind(ev) {
  // Lightweight kind tagging used for filter + dot color. Fully redundant with classifyEvent
  // but inlined to avoid re-importing the server module.
  if (!ev || typeof ev !== "object") return "unknown";
  if (ev.type === "system") return ev.subtype === "compact_boundary" ? "compact" : "system";
  if (ev.type === "queue-operation" || ev.type === "last-prompt") return "system";
  if (ev.type === "user") {
    if (typeof ev.message?.content === "string" && ev.message.content.startsWith("<task-notification>")) return "subagent";
    if (ev.isCompactSummary) return "compact";
    if (ev.isMeta) return "system";
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    if (arr.length && arr.every((p) => p.type === "tool_result")) return "tool_result";
    return "user";
  }
  if (ev.type === "assistant") {
    const arr = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const tu = arr.find((p) => p.type === "tool_use");
    if (tu) {
      const n = tu.name || "";
      if (n === "Edit" || n === "MultiEdit" || n === "Write") return "tool_edit";
      if (n === "Read") return "tool_read";
      if (n === "TodoWrite") return "tool_todowrite";
      if (n === "Agent" || n === "Task") return "subagent";
      if (n === "AskUserQuestion") return "ask";
      return "tool";
    }
    if (arr.some((p) => p.type === "thinking") && !arr.some((p) => p.type === "text")) return "thinking";
    if (arr.some((p) => p.type === "text")) return "assistant";
    if (arr.some((p) => p.type === "thinking")) return "thinking";
    return "unknown";
  }
  return "unknown";
}

function wrapMsgRow(ev, prev, innerHtml) {
  if (!innerHtml) return "";
  const kind = quickKind(ev);
  let tsHtml = "";
  let dayHtml = "";
  if (ev?.timestamp) {
    const d = new Date(ev.timestamp);
    const dateKey = fmtDate(d);
    const prevDateKey = prev?.timestamp ? fmtDate(new Date(prev.timestamp)) : "";
    if (dateKey !== prevDateKey) {
      dayHtml = `<div class="day-divider">── ${dateKey} ──</div>`;
    }
    const delta = prev?.timestamp ? fmtDelta(d.getTime() - new Date(prev.timestamp).getTime()) : "+前";
    tsHtml = `<time class="ts-time" title="${d.toISOString()}">${fmtTime(d)}</time><small>${delta}</small>`;
  }
  return `${dayHtml}<div class="msg-row" data-kind="${kind}"><div class="ts">${tsHtml}</div><div class="msg-cell">${innerHtml}</div></div>`;
}

function renderSubagentNotification(ev) {
  const body = ev.message?.content || "";
  const escape = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/);
  const summary = summaryMatch ? summaryMatch[1].trim() : "subagent 异步通知";
  return `<div class="tool subagent-notification" data-kind="subagent">
  <div class="tool-head">
    <span class="tool-name">🤖 subagent · 异步返回</span>
    <span class="subagent-summary">${escape(summary)}</span>
  </div>
  <details class="tool-section"><summary>原始 task-notification</summary><pre>${escape(body)}</pre></details>
</div>`;
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
  const html = body.events.map((ev, i) => wrapMsgRow(ev, body.events[i - 1], renderEvent(ev, toolResults))).join("");
  $conv.innerHTML = html;
  $stats.textContent = `${body.events.length} 条事件`;
  const $filterRow = document.getElementById("filter-row");
  bindChips($conv, $filterRow);
  const $subToggleRow = document.getElementById("sub-toggle-row");
  bindSubToggles($conv, $subToggleRow);
  if (q) highlightAll($conv, q);
}

main();
