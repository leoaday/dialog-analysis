const KEY = "da:filter:v2";  // localStorage key compatible with v2 (additive only)

const ORDER = ["open", "folded", "hidden"];

const KINDS = [
  "user", "assistant", "thinking", "tool", "tool_edit", "tool_read",
  "tool_todowrite", "subagent", "ask", "tool_rejection", "compact", "system", "unknown",
];

const DEFAULTS = {
  user: "open",
  assistant: "open",
  thinking: "open",
  tool: "folded",
  tool_edit: "folded",
  tool_read: "folded",
  tool_todowrite: "folded",
  subagent: "folded",
  ask: "open",
  tool_rejection: "open",
  compact: "folded",
  system: "hidden",
  unknown: "hidden",
};

function attrName(kind) { return kind.replace(/_/g, "-"); }
function nextState(s) { return ORDER[(ORDER.indexOf(s) + 1) % ORDER.length]; }

export function loadFilterState() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...stored };
  } catch { return { ...DEFAULTS }; }
}

export function saveFilterState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function injectFilterStyles() {
  if (document.getElementById("da-filter-styles")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "da-filter-styles";
  styleEl.textContent = KINDS.map((k) =>
    `body[data-show-${attrName(k)}="false"] #conversation [data-kind="${k}"] { display: none; }`
  ).join("\n");
  document.head.appendChild(styleEl);
}

function setBodyShow(kind, value) {
  document.body.setAttribute(`data-show-${attrName(kind)}`, value !== "hidden" ? "true" : "false");
}

function batchSetDetails(root, kind, open) {
  // Set every <details> within blocks of this kind, plus <details> blocks that ARE this kind.
  const sel = `[data-kind="${kind}"] details, details[data-kind="${kind}"]`;
  const els = root.querySelectorAll(sel);
  for (const d of els) d.open = open;
}

function renderChip(kind, value) {
  const cls = `chip chip-${value}`;
  const symbol = value === "folded" ? "⊟" : value === "hidden" ? "" : "";
  return `<button class="${cls}" data-kind="${kind}" data-value="${value}" title="${value}">${kind}${symbol ? ` <span class="chip-icon">${symbol}</span>` : ""}</button>`;
}

export function renderFilterRow(state) {
  return KINDS.map((k) => renderChip(k, state[k] || "open")).join("");
}

function updateChipDOM(container, kind, value) {
  const btn = container.querySelector(`.chip[data-kind="${kind}"]`);
  if (!btn) return;
  btn.className = `chip chip-${value}`;
  btn.dataset.value = value;
  btn.title = value;
  // re-render label so the ⊟ icon swap is correct without rebuilding the whole row
  const symbol = value === "folded" ? "⊟" : "";
  btn.innerHTML = `${kind}${symbol ? ` <span class="chip-icon">${symbol}</span>` : ""}`;
}

export function bindChips(root, container) {
  injectFilterStyles();
  const state = loadFilterState();
  container.innerHTML = renderFilterRow(state);
  // Initialize body data-show-* and details state once.
  for (const k of KINDS) {
    setBodyShow(k, state[k] || "open");
    if (state[k] !== "hidden") batchSetDetails(root, k, state[k] === "open");
  }

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip[data-kind]");
    if (!btn) return;
    const kind = btn.dataset.kind;
    const v = nextState(state[kind] || "open");
    state[kind] = v;
    saveFilterState(state);
    updateChipDOM(container, kind, v);
    setBodyShow(kind, v);
    if (v !== "hidden") batchSetDetails(root, kind, v === "open");
  });

  return state;
}

// Back-compat exports — kept for any external import (currently none).
export function applyFilter(_root, _state) { /* no-op: handled per-chip and via CSS */ }
