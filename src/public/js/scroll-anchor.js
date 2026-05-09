// scroll-anchor.js — preserve viewport position across DOM mutations.
// Usage:
//   const anchor = captureAnchor();
//   /* mutate DOM that changes msg-row visibility */
//   restoreAnchor(anchor);

export function captureAnchor() {
  const rows = document.querySelectorAll("#conversation .msg-row");
  for (const r of rows) {
    if (getComputedStyle(r).display === "none") continue;
    const rect = r.getBoundingClientRect();
    if (rect.top >= 0) {
      return { idx: r.dataset.idx, offsetTop: rect.top };
    }
  }
  return null;
}

export function restoreAnchor(anchor) {
  if (!anchor) return;
  // Try the same row first
  let row = document.querySelector(`#conversation .msg-row[data-idx="${anchor.idx}"]`);
  // Walk forward through hidden siblings until a visible row is found
  while (row && getComputedStyle(row).display === "none") row = row.nextElementSibling;
  if (!row) return;
  const newTop = row.getBoundingClientRect().top;
  const delta = newTop - anchor.offsetTop;
  if (Math.abs(delta) < 1) return;
  window.scrollBy({ top: delta, behavior: "instant" });
}
