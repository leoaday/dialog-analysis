import { streamJsonl } from "./jsonl-stream.js";
import { extractText } from "./extract-text.js";
import { classifyEvent } from "./events.js";

const CTX = 60;

function buildMatcher(q, regex) {
  if (regex) {
    try { return new RegExp(q, "ig"); } catch { throw new Error("invalid regex: " + q); }
  }
  // escape and case-insensitive substring
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "ig");
}

function findRangesIn(haystack, re) {
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(haystack)) !== null) {
    out.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

function makeSnippet(haystack, range) {
  const [s, e] = range;
  const start = Math.max(0, s - CTX);
  const end = Math.min(haystack.length, e + CTX);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  const snip = prefix + haystack.slice(start, end) + suffix;
  const offset = (prefix ? 1 : 0) - start;
  return { snippet: snip, matchRanges: [[s + offset, e + offset]] };
}

function roleOf(ev) {
  if (ev?.type === "user") return "user";
  if (ev?.type === "assistant") return "assistant";
  return "system";
}

export async function searchFile(filePath, { q, regex = false, max = 50 }) {
  const matcher = buildMatcher(q, regex);
  const matches = [];
  let truncated = false;
  let idx = -1;
  for await (const ev of streamJsonl(filePath)) {
    idx++;
    const text = extractText(ev);
    if (!text) continue;
    const ranges = findRangesIn(text, matcher);
    for (const r of ranges) {
      const { snippet, matchRanges } = makeSnippet(text, r);
      matches.push({ eventIdx: idx, role: roleOf(ev), type: classifyEvent(ev), snippet, matchRanges });
      if (matches.length >= max) { truncated = true; break; }
    }
    if (truncated) break;
  }
  return { matches, truncated };
}
