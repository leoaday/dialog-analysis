const TOOL_EDIT_NAMES = new Set(["Edit", "MultiEdit", "Write"]);
const TOOL_READ_NAMES = new Set(["Read"]);
const TOOL_TODOWRITE_NAMES = new Set(["TodoWrite"]);
const TOOL_AGENT_NAMES = new Set(["Agent", "Task"]);
const TOOL_ASK_NAMES = new Set(["AskUserQuestion"]);

const REJECTION_PREFIXES = [
  "User rejected",
  "The user doesn't want to proceed with this tool use",
  "[Request interrupted by user",
];

function contentArr(ev) {
  const c = ev?.message?.content;
  return Array.isArray(c) ? c : [];
}

function findToolUse(ev) {
  return contentArr(ev).find((p) => p.type === "tool_use");
}

export function isTaskNotification(ev) {
  if (ev?.type !== "user") return false;
  const c = ev.message?.content;
  if (typeof c !== "string") return false;
  return c.startsWith("<task-notification>");
}

export function isToolRejection(toolResult) {
  if (!toolResult) return false;
  const c = toolResult.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    const first = c.find((p) => p?.type === "text");
    text = first?.text || "";
  }
  return REJECTION_PREFIXES.some((p) => text.startsWith(p));
}

export function isHumanTurn(ev) {
  if (ev?.type !== "user") return false;
  if (ev.isMeta || ev.isCompactSummary) return false;
  if (isTaskNotification(ev)) return false;
  const c = ev.message?.content;
  if (typeof c === "string") return true;
  if (!Array.isArray(c) || c.length === 0) return false;
  return c.some((p) => p.type === "text" || p.type === "image");
}

function classifyToolUse(toolUse) {
  const name = toolUse.name || "";
  if (TOOL_EDIT_NAMES.has(name)) return "tool_edit";
  if (TOOL_READ_NAMES.has(name)) return "tool_read";
  if (TOOL_TODOWRITE_NAMES.has(name)) return "tool_todowrite";
  if (TOOL_AGENT_NAMES.has(name)) return "subagent";
  if (TOOL_ASK_NAMES.has(name)) return "ask";
  return "tool";
}

export function classifyEvent(ev) {
  if (!ev || typeof ev !== "object") return "unknown";

  if (ev.type === "system") {
    if (ev.subtype === "compact_boundary") return "compact";
    return "system";
  }
  if (ev.type === "queue-operation") return "system";
  if (ev.type === "last-prompt") return "system";

  if (ev.type === "user") {
    if (isTaskNotification(ev)) return "subagent";
    if (ev.isCompactSummary) return "compact";
    if (ev.isMeta) return "system";
    const arr = contentArr(ev);
    if (arr.length && arr.every((p) => p.type === "tool_result")) return "tool_result";
    if (arr.length && arr.some((p) => p.type === "text" || p.type === "image")) return "user";
    if (typeof ev.message?.content === "string") return "user";
    return "unknown";
  }

  if (ev.type === "assistant") {
    const tu = findToolUse(ev);
    if (tu) return classifyToolUse(tu);
    const arr = contentArr(ev);
    if (arr.some((p) => p.type === "thinking") && !arr.some((p) => p.type === "text")) return "thinking";
    if (arr.some((p) => p.type === "text")) return "assistant";
    if (arr.some((p) => p.type === "thinking")) return "thinking";
    return "unknown";
  }

  return "unknown";
}
