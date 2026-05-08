import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function* streamJsonl(filePath, opts = {}) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    try {
      yield JSON.parse(line);
    } catch {
      if (opts.onMalformed) opts.onMalformed(line);
    }
  }
}
