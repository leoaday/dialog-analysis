import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";
import { searchFile } from "../parser/search.js";
import { listSubagents } from "../parser/subagent-index.js";
import { getCachedMetadata } from "../parser/metadata-cache.js";

const PER_FILE_MAX = 50;

export async function search(req, res, url) {
  const dirRaw = url.searchParams.get("dir");
  const q = url.searchParams.get("q") || "";
  const regex = url.searchParams.get("regex") === "1";
  if (q.length === 0) return send(res, 400, { error: "missing q" });
  let dir;
  try { dir = validateAbsolutePath(dirRaw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(dir); }
  catch { return send(res, 404, { error: "not found" }); }
  const jsonls = entries.filter((n) => n.endsWith(".jsonl"));
  const out = [];
  for (const name of jsonls) {
    const file = join(dir, name);
    const sessionId = name.slice(0, -".jsonl".length);
    let sessionRes;
    try { sessionRes = await searchFile(file, { q, regex, max: PER_FILE_MAX }); }
    catch (e) { return send(res, 400, { error: e.message }); }
    const subs = await listSubagents(dir, sessionId);
    const subagentMatches = [];
    for (const s of subs) {
      let r;
      try { r = await searchFile(s.file, { q, regex, max: PER_FILE_MAX }); }
      catch (e) { return send(res, 400, { error: e.message }); }
      if (r.matches.length) {
        subagentMatches.push({ agentId: s.agentId, file: s.file, count: r.matches.length, snippets: r.matches });
      }
    }
    if (sessionRes.matches.length === 0 && subagentMatches.length === 0) continue;
    let metaResult;
    try { metaResult = await getCachedMetadata(file); } catch { continue; }
    const { meta, stat: st } = metaResult;
    out.push({
      sessionId,
      file,
      mtime: st.mtime.toISOString(),
      size: st.size,
      hitInSession: sessionRes.matches.length > 0,
      hitInSubagent: subagentMatches.length > 0,
      sessionMatches: sessionRes.matches,
      subagentMatches,
      rounds: meta.rounds,
      tokens: meta.tokens,
      firstUserSummary: meta.firstUserSummary,
      subagentCount: subs.length,
      subagents: subs,
    });
  }
  out.sort((a, b) => {
    if (a.hitInSession !== b.hitInSession) return a.hitInSession ? -1 : 1;
    return a.mtime < b.mtime ? 1 : -1;
  });
  send(res, 200, { dir, q, regex, total: out.length, sessions: out });
}
