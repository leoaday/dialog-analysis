import { createServer } from "node:net";

function isFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

export async function probeFreePort(candidates) {
  for (const p of candidates) if (await isFree(p)) return p;
  throw new Error("no free port in range");
}

export function defaultRange(start = 5173, count = 11) {
  return Array.from({ length: count }, (_, i) => start + i);
}
