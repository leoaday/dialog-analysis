import { stat } from "node:fs/promises";
import { LRU } from "../lru.js";
import { computeMetadata } from "./metadata.js";

const cache = new LRU(50);

function key(file, mtimeMs, size) { return `${file}|${mtimeMs}|${size}`; }

export async function getCachedMetadata(file) {
  const st = await stat(file);
  const k = key(file, st.mtimeMs, st.size);
  let meta = cache.get(k);
  if (!meta) {
    meta = await computeMetadata(file);
    cache.set(k, meta);
  }
  return { meta, stat: st };
}
