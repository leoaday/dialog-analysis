const KEY = "da:filter:v2";  // localStorage key carries from v2.1 with auto-migration

const KINDS = [
  "user", "assistant", "thinking", "tool", "tool_edit", "tool_read",
  "tool_todowrite", "subagent", "ask", "tool_rejection", "compact", "system", "unknown",
];

const DEFAULTS_RICH = {
  user: { visible: true, expanded: true },
  assistant: { visible: true, expanded: true },
  thinking: { visible: true, expanded: true },
  tool: { visible: true, expanded: false },
  tool_edit: { visible: true, expanded: false },
  tool_read: { visible: true, expanded: false },
  tool_todowrite: { visible: true, expanded: false },
  subagent: { visible: true, expanded: false },
  ask: { visible: true, expanded: true },
  tool_rejection: { visible: true, expanded: true },
  compact: { visible: true, expanded: false },
  system: { visible: false, expanded: false },
  unknown: { visible: false, expanded: false },
};

function attrName(kind) { return kind.replace(/_/g, "-"); }

export function loadFilterState() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    const out = {};
    for (const k of KINDS) {
      const v = stored[k];
      if (v && typeof v === "object" && "visible" in v) {
        out[k] = { ...DEFAULTS_RICH[k], ...v };
      } else if (typeof v === "string") {
        // migrate v2.1 string state ("open"/"folded"/"hidden") → v2.2 object
        out[k] = { visible: v !== "hidden", expanded: v === "open" };
      } else {
        out[k] = { ...DEFAULTS_RICH[k] };
      }
    }
    return out;
  } catch {
    return Object.fromEntries(KINDS.map((k) => [k, { ...DEFAULTS_RICH[k] }]));
  }
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

function setBodyShow(kind, visible) {
  document.body.setAttribute(`data-show-${attrName(kind)}`, visible ? "true" : "false");
}

function batchSetDetails(root, kind, open) {
  const sel = `[data-kind="${kind}"] details, details[data-kind="${kind}"]`;
  const els = root.querySelectorAll(sel);
  for (const d of els) d.open = open;
}

function renderChip(kind, st) {
  const cls = `chip ${st.visible ? "chip-visible" : "chip-hidden"}`;
  const checked = st.expanded ? "checked" : "";
  return `<div class="${cls}" data-kind="${kind}" role="button" tabindex="0" aria-pressed="${st.visible}">
    <span class="chip-label">${kind}</span>
    <input type="checkbox" class="chip-fold" tabindex="0" ${checked} aria-label="expand ${kind}" />
  </div>`;
}

export function renderFilterRow(state) {
  return KINDS.map((k) => renderChip(k, state[k])).join("");
}

function updateChipDOM(container, kind, st) {
  const chip = container.querySelector(`.chip[data-kind="${kind}"]`);
  if (!chip) return;
  chip.className = `chip ${st.visible ? "chip-visible" : "chip-hidden"}`;
  chip.setAttribute("aria-pressed", String(st.visible));
  const cb = chip.querySelector(".chip-fold");
  if (cb) cb.checked = st.expanded;
}

export function bindChips(root, container, hooks = {}) {
  injectFilterStyles();
  const state = loadFilterState();
  container.innerHTML = renderFilterRow(state);
  for (const k of KINDS) {
    setBodyShow(k, state[k].visible);
    if (state[k].visible) batchSetDetails(root, k, state[k].expanded);
  }

  container.addEventListener("click", (e) => {
    const cb = e.target.closest(".chip-fold");
    const chip = e.target.closest(".chip[data-kind]");
    if (!chip) return;
    const kind = chip.dataset.kind;
    const before = hooks.beforeMutate?.();
    if (cb) {
      // checkbox click — toggle expanded only; checkbox already toggled by browser
      e.stopPropagation();
      state[kind].expanded = cb.checked;
    } else {
      // chip body click — toggle visible
      state[kind].visible = !state[kind].visible;
    }
    saveFilterState(state);
    updateChipDOM(container, kind, state[kind]);
    setBodyShow(kind, state[kind].visible);
    if (state[kind].visible) batchSetDetails(root, kind, state[kind].expanded);
    hooks.afterMutate?.(before);
  });

  // keyboard: Space/Enter on chip body toggles visible
  container.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    const cb = e.target.closest(".chip-fold");
    const chip = e.target.closest(".chip[data-kind]");
    if (!chip || cb) return;  // checkbox keyboard handled natively
    e.preventDefault();
    chip.click();
  });

  return state;
}

// Back-compat exports
export function applyFilter(_root, _state) { /* no-op: handled per-chip and via CSS */ }
