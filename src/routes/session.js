import { stat } from "node:fs/promises";
import { validateAbsolutePath } from "../path-validate.js";
import { send } from "../server.js";
import { streamJsonl } from "../parser/jsonl-stream.js";

function buildETag(st) { return `W/"${st.mtimeMs}-${st.size}"`; }

export async function session(req, res, url) {
  const raw = url.searchParams.get("file");
  let file;
  try { file = validateAbsolutePath(raw); }
  catch (e) { return send(res, 400, { error: e.message }); }
  let st;
  try { st = await stat(file); }
  catch { return send(res, 404, { error: "not found" }); }
  const etag = buildETag(st);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag });
    return res.end();
  }
  const events = [];
  let malformed = 0;
  for await (const ev of streamJsonl(file, { onMalformed: () => malformed++ })) events.push(ev);
  send(res, 200, { file, events, malformed }, { ETag: etag });
}
