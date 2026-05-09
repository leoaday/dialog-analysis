const KEY = "da:sub-toggles:v1";
const DEFAULTS = { input: "open", output: "folded" };  // values: "open" | "folded"

export function loadSubState() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}

export function saveSubState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function applySub(root, target, value) {
  // target: "input" | "output"
  const sel = target === "input" ? ".tool-section.tool-input" : ".tool-section.tool-output";
  const els = root.querySelectorAll(sel);
  for (const d of els) d.open = value === "open";
}

function renderToggle(target, value) {
  const arrow = value === "open" ? "▾" : "▸";
  return `<button class="sub-toggle" data-target="${target}" data-value="${value}">${target === "input" ? "Input" : "Output"} <span class="sub-arrow">${arrow}</span></button>`;
}

export function renderSubRow(state) {
  return `<span class="sub-label">Tool:</span> ${renderToggle("input", state.input)} ${renderToggle("output", state.output)}`;
}

function updateToggleDOM(container, target, value) {
  const btn = container.querySelector(`.sub-toggle[data-target="${target}"]`);
  if (!btn) return;
  btn.dataset.value = value;
  const arrow = value === "open" ? "▾" : "▸";
  btn.innerHTML = `${target === "input" ? "Input" : "Output"} <span class="sub-arrow">${arrow}</span>`;
}

export function bindSubToggles(root, container) {
  const state = loadSubState();
  container.innerHTML = renderSubRow(state);
  applySub(root, "input", state.input);
  applySub(root, "output", state.output);

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".sub-toggle[data-target]");
    if (!btn) return;
    const target = btn.dataset.target;
    state[target] = state[target] === "open" ? "folded" : "open";
    saveSubState(state);
    updateToggleDOM(container, target, state[target]);
    applySub(root, target, state[target]);
  });

  return state;
}
