const KEY = "da:filter:v2";

// Three-state chip values: "open" (show + expanded), "folded" (show + folded), "hidden"
const ORDER = ["open", "folded", "hidden"];

const KINDS = [
  "user", "assistant", "thinking", "tool", "tool_edit", "tool_read",
  "tool_todowrite", "subagent", "ask", "tool_rejection", "system", "unknown",
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
  system: "hidden",
  unknown: "hidden",
};

export function loadFilterState() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFilterState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function nextState(s) { return ORDER[(ORDER.indexOf(s) + 1) % ORDER.length]; }

export function applyFilter(root, state) {
  for (const kind of KINDS) {
    const v = state[kind] || "open";
    const targets = root.querySelectorAll(`[data-kind="${kind}"]`);
    for (const el of targets) {
      el.style.display = v === "hidden" ? "none" : "";
      // toggle inner <details> open/closed when not hidden
      if (v !== "hidden") {
        const details = el.querySelectorAll("details");
        for (const d of details) d.open = v === "open";
        if (el.tagName === "DETAILS") el.open = v === "open";
      }
    }
  }
}

function renderChip(kind, value) {
  const cls = `chip chip-${value}`;
  const symbol = value === "folded" ? "⊟" : value === "hidden" ? "" : "";
  return `<button class="${cls}" data-kind="${kind}" data-value="${value}" title="${value}">${kind}${symbol ? ` <span class="chip-icon">${symbol}</span>` : ""}</button>`;
}

export function renderFilterRow(state) {
  return KINDS.map((k) => renderChip(k, state[k] || "open")).join("");
}

export function bindChips(root, container) {
  const state = loadFilterState();
  container.innerHTML = renderFilterRow(state);

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip[data-kind]");
    if (!btn) return;
    const kind = btn.dataset.kind;
    state[kind] = nextState(state[kind] || "open");
    saveFilterState(state);
    container.innerHTML = renderFilterRow(state);
    applyFilter(root, state);
  });

  applyFilter(root, state);
  // per-block <details> override: clicking summary stays per-block
  return state;
}
