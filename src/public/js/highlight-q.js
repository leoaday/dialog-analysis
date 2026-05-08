export function highlightAll(root, q) {
  if (!q) return;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.match(re)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let n; while ((n = walker.nextNode())) nodes.push(n);
  for (const tn of nodes) {
    const html = (tn.nodeValue).replace(re, (m) => `<mark>${m}</mark>`);
    const span = document.createElement("span");
    span.innerHTML = html;
    tn.replaceWith(span);
  }
}
