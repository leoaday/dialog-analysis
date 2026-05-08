#!/usr/bin/env node
import mri from "mri";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { startServer } from "../src/server.js";
import { probeFreePort, defaultRange } from "../src/port-probe.js";
import { openInBrowser } from "../src/browser-open.js";
import { log } from "../src/log.js";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const argv = mri(process.argv.slice(2), {
  alias: { d: "dir", p: "port", h: "help", v: "version" },
  boolean: ["help", "version", "no-open"],
  string: ["dir", "port"],
});

if (argv.version) { console.log(pkg.version); process.exit(0); }
if (argv.help) {
  console.log(`Usage: claude-dialog-analyzer [-d <dir>] [-p <port>] [--no-open]
  -d, --dir <abs>    starting directory (default: ~/.claude/projects)
  -p, --port <n>     port (default: probe 5173..5183, 0=random)
  --no-open          do not launch browser
  -h, --help         show help
  -v, --version      print version`);
  process.exit(0);
}

const requestedPort = argv.port !== undefined ? Number(argv.port) : null;
const dir = argv.dir || join(homedir(), ".claude", "projects");

let port;
try {
  if (requestedPort === 0) port = 0;
  else if (requestedPort !== null) port = requestedPort;
  else port = await probeFreePort(defaultRange());
} catch (e) {
  process.stderr.write(`failed to find port: ${e.message}\nUse -p <port> to specify an explicit port.\n`);
  process.exit(1);
}

const server = await startServer({ port });
const url = `http://127.0.0.1:${server.port}`;
const startUrl = `${url}/?dir=${encodeURIComponent(dir)}`;
process.stdout.write(`listening: ${url}\n`);
log.info("starting", { dir, port: server.port });
if (!argv["no-open"]) openInBrowser(startUrl);

const shutdown = async () => { log.info("shutdown signal"); await server.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
