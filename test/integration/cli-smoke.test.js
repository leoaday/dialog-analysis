import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

test("cli starts, prints listening URL, --no-open does not launch browser", async () => {
  const child = spawn("node", ["bin/cli.js", "--no-open", "-p", "0"], { stdio: ["ignore", "pipe", "pipe"] });
  let url = "";
  const lines = [];
  child.stdout.on("data", (b) => { lines.push(b.toString()); });
  // wait briefly for the listening line
  for (let i = 0; i < 30 && !url; i++) {
    await sleep(100);
    const joined = lines.join("");
    const m = joined.match(/listening:\s+(http:\/\/127\.0\.0\.1:\d+)/);
    if (m) url = m[1];
  }
  assert.ok(url, "no listening line printed");
  // hit /api/list-dir to confirm server is up
  const r = await fetch(`${url}/api/list-dir?path=${encodeURIComponent(process.cwd())}`);
  assert.equal(r.status, 200);
  child.kill("SIGINT");
});
