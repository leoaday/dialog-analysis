import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";

export async function listDir(req, res, url) {
  const raw = url.searchParams.get("path");
  let p;
  try { p = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let entries;
  try { entries = await readdir(p); }
  catch { return send(res, 404, { error: "not found" }); }
  const out = [];
  let hasJsonl = false;
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    let s;
    try { s = await stat(join(p, name)); } catch { continue; }
    const isDir = s.isDirectory();
    if (!isDir && !name.endsWith(".jsonl")) continue;
    if (!isDir) hasJsonl = true;
    out.push({
      name,
      type: isDir ? "dir" : "file",
      size: s.size,
      mtime: s.mtime.toISOString(),
    });
  }
  // mark jsonl-dir
  if (hasJsonl) {
    // root dir itself contains jsonl files; clients infer from entries
  }
  send(res, 200, {
    path: p,
    parent: dirname(p) === p ? null : dirname(p),
    entries: out,
  });
}
