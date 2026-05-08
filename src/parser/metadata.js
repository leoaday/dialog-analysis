import { streamJsonl } from "./jsonl-stream.js";
import { isHumanTurn } from "./events.js";

const SUMMARY_LIMIT = 120;

function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((p) => p.type === "text").map((p) => p.text || "").join("\n");
}

function squashWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s, n) {
  // unicode-aware truncate by code point
  const arr = Array.from(s);
  return arr.length <= n ? s : arr.slice(0, n).join("");
}

export async function computeMetadata(filePath) {
  let rounds = 0;
  let firstUserSummary = "";
  let firstSummarySet = false;
  let malformed = 0;
  const tokens = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
  for await (const ev of streamJsonl(filePath, { onMalformed: () => malformed++ })) {
    if (isHumanTurn(ev)) {
      rounds++;
      if (!firstSummarySet) {
        const t = squashWhitespace(extractTextFromContent(ev.message.content));
        firstUserSummary = truncate(t, SUMMARY_LIMIT);
        firstSummarySet = true;
      }
    }
    if (ev?.type === "assistant") {
      const u = ev.message?.usage || {};
      tokens.input += u.input_tokens || 0;
      tokens.output += u.output_tokens || 0;
      tokens.cacheCreate += u.cache_creation_input_tokens || 0;
      tokens.cacheRead += u.cache_read_input_tokens || 0;
    }
  }
  return { rounds, tokens, firstUserSummary, malformed };
}
