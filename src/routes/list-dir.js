import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";

async function classifyDir(absDir) {
  let entries;
  try { entries = await readdir(absDir); } catch { return { isClaudeProject: false, sessionCount: 0 }; }
  let count = 0;
  for (const n of entries) {
    if (n.endsWith(".jsonl")) count++;
  }
  return { isClaudeProject: count > 0, sessionCount: count };
}

export async function listDir(req, res, url) {
  const raw = url.searchParams.get("path");
  let p;
  try { p = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(p); }
  catch { return send(res, 404, { error: "not found" }); }
  const out = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    let s;
    try { s = await stat(join(p, name)); } catch { continue; }
    const isDir = s.isDirectory();
    if (!isDir && !name.endsWith(".jsonl")) continue;
    const entry = { name, type: isDir ? "dir" : "file", size: s.size, mtime: s.mtime.toISOString() };
    if (isDir) {
      const c = await classifyDir(join(p, name));
      if (c.isClaudeProject) entry.type = "jsonl-dir";
      entry.isClaudeProject = c.isClaudeProject;
      entry.sessionCount = c.sessionCount;
    }
    out.push(entry);
  }
  send(res, 200, { path: p, parent: dirname(p) === p ? null : dirname(p), entries: out });
}
