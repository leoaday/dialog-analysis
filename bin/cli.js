#!/usr/bin/env node
import mri from "mri";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const argv = mri(process.argv.slice(2), {
  alias: { d: "dir", p: "port", h: "help", v: "version" },
  boolean: ["help", "version", "no-open"],
  string: ["dir", "port"]
});

if (argv.version) { console.log(pkg.version); process.exit(0); }
if (argv.help) {
  console.log(`Usage: claude-dialog-analyzer [-d <dir>] [-p <port>] [--no-open]
  -d, --dir <abs>    starting directory (default: ~/.claude/projects)
  -p, --port <n>     port (default: probe 5173..5183)
  --no-open          do not launch browser
  -h, --help         show help
  -v, --version      print version`);
  process.exit(0);
}
console.error("server bootstrap not yet implemented");
process.exit(1);
