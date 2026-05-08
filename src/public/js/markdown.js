const MD_OPTS = { gfm: true, breaks: false };
let ready = false;
function init() {
  if (ready) return;
  if (window.marked && window.DOMPurify) {
    window.marked.setOptions(MD_OPTS);
    if (window.hljs) {
      window.marked.use({
        renderer: {
          code(code, lang) {
            const language = window.hljs.getLanguage(lang) ? lang : "plaintext";
            const highlighted = window.hljs.highlight(code, { language }).value;
            return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
          },
        },
      });
    }
    ready = true;
  }
}
export function md(text) {
  init();
  if (!ready) return escapeHtml(text);
  const html = window.marked.parse(text || "");
  return window.DOMPurify.sanitize(html);
}
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
