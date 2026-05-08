function level() {
  const v = (process.env.DEBUG_DA || "").toLowerCase();
  if (v === "trace") return 2;
  if (v === "1" || v === "true" || v === "info") return 1;
  return 0;
}

function emit(prefix, args) {
  const line = `[da:${prefix}] ${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`;
  process.stderr.write(line);
}

export const log = {
  info(...args) { if (level() >= 1) emit("info", args); },
  trace(...args) { if (level() >= 2) emit("trace", args); },
};
