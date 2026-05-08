import path from "node:path";

export function validateAbsolutePath(p) {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("path must be an absolute non-empty string");
  }
  if (p.includes("\0")) throw new Error("path contains NUL byte");

  // Check for absolute path using path.isAbsolute or Windows-style absolute path
  const isWindowsAbsolute = /^[a-zA-Z]:[/\\]/.test(p);
  if (!path.isAbsolute(p) && !isWindowsAbsolute) {
    throw new Error("path must be absolute");
  }

  return path.normalize(p);
}
