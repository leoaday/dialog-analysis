const KEY = "da:fold:v1";
const DEFAULT = { thinking: false, tool: true, system: false, subagent: true, askUserQuestion: true };

export function loadFoldState() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULT }; }
}

export function saveFoldState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

export function applyFold(root, state) {
  for (const [type, folded] of Object.entries(state)) {
    const targets = root.querySelectorAll(`[data-kind="${type}"]`);
    for (const el of targets) {
      if (el.tagName === "DETAILS") el.open = !folded;
      else el.classList.toggle("collapsed", folded);
    }
  }
}

export function bindFoldToggles(root) {
  const state = loadFoldState();
  const inputs = document.querySelectorAll("input[data-fold]");
  for (const inp of inputs) {
    inp.checked = !!state[inp.dataset.fold];
    inp.addEventListener("change", () => {
      state[inp.dataset.fold] = inp.checked;
      saveFoldState(state);
      applyFold(root, state);
    });
  }
  applyFold(root, state);
  root.addEventListener("click", (e) => {
    const target = e.target.closest("[data-kind].collapsed");
    if (target) target.classList.remove("collapsed");
  });
  return state;
}
