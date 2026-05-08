import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export async function startCli({ cwd = process.cwd(), args = [] } = {}) {
  const child = spawn("node", ["bin/cli.js", "--no-open", "-p", "0", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let url = "";
  let buf = "";
  child.stdout.on("data", (b) => { buf += b.toString(); });
  for (let i = 0; i < 50 && !url; i++) {
    await sleep(100);
    const m = buf.match(/listening:\s+(http:\/\/127\.0\.0\.1:\d+)/);
    if (m) url = m[1];
  }
  if (!url) { child.kill(); throw new Error("cli failed to start"); }
  return { url, kill: () => child.kill("SIGINT") };
}
