import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";
import { computeMetadata } from "../parser/metadata.js";
import { listSubagents } from "../parser/subagent-index.js";
import { LRU } from "../lru.js";

const cache = new LRU(50);

function cacheKey(file, mtime, size) { return `${file}|${mtime}|${size}`; }

async function summarize(dir, name) {
  const file = join(dir, name);
  const st = await stat(file);
  const key = cacheKey(file, st.mtimeMs, st.size);
  let meta = cache.get(key);
  if (!meta) {
    meta = await computeMetadata(file);
    cache.set(key, meta);
  }
  const sessionId = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : name;
  const subagents = await listSubagents(dir, sessionId);
  return {
    sessionId,
    file,
    mtime: st.mtime.toISOString(),
    size: st.size,
    rounds: meta.rounds,
    tokens: meta.tokens,
    firstUserSummary: meta.firstUserSummary,
    subagentCount: subagents.length,
    subagents,
  };
}

export async function sessions(req, res, url) {
  const raw = url.searchParams.get("dir");
  let dir;
  try { dir = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(dir); }
  catch { return send(res, 404, { error: "not found" }); }
  const jsonls = entries.filter((n) => n.endsWith(".jsonl"));
  const out = [];
  for (const n of jsonls) {
    try { out.push(await summarize(dir, n)); }
    catch (e) { /* skip unreadable */ }
  }
  out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  send(res, 200, { dir, sessions: out });
}
