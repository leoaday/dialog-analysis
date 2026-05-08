import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { streamJsonl } from "./jsonl-stream.js";
import { extractText } from "./extract-text.js";

const SUMMARY_LIMIT = 120;

function squashTruncate(s, n) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  const arr = Array.from(t);
  return arr.length <= n ? t : arr.slice(0, n).join("");
}

async function firstPromptSummary(file) {
  for await (const ev of streamJsonl(file)) {
    if (ev?.type === "user") {
      const txt = extractText(ev);
      if (txt) return squashTruncate(txt, SUMMARY_LIMIT);
    }
  }
  return "";
}

async function readMeta(metaFile) {
  try {
    const txt = await readFile(metaFile, "utf8");
    return JSON.parse(txt);
  } catch { return {}; }
}

export async function listSubagents(parentDir, sessionId) {
  const dir = join(parentDir, sessionId, "subagents");
  let entries;
  try { entries = await readdir(dir); } catch { return []; }
  const out = [];
  for (const name of entries) {
    if (!name.startsWith("agent-") || !name.endsWith(".jsonl")) continue;
    const id = name.slice("agent-".length, -".jsonl".length);
    const file = join(dir, name);
    const metaFile = join(dir, `agent-${id}.meta.json`);
    const meta = await readMeta(metaFile);
    out.push({
      agentId: id,
      file,
      firstPromptSummary: await firstPromptSummary(file),
      agentType: meta.type || meta.name || "",
    });
  }
  return out;
}
