import { createServer } from "node:http";
import { URL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { listDir } from "./routes/list-dir.js";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");

const ROUTES = new Map([
  ["/api/list-dir", listDir],
]);

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

export function send(res, status, body, headers = {}) {
  const h = { "Content-Type": "application/json; charset=utf-8", ...headers };
  res.writeHead(status, h);
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveStatic(req, res) {
  const u = new URL(req.url, "http://x");
  let p = u.pathname === "/" ? "/index.html" : u.pathname;
  if (p.startsWith("/session.html")) p = "/session.html";
  const fpath = join(PUBLIC_DIR, p);
  if (!fpath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "forbidden" });
  try {
    const buf = await readFile(fpath);
    const ext = p.slice(p.lastIndexOf("."));
    send(res, 200, buf, { "Content-Type": STATIC_TYPES[ext] || "application/octet-stream" });
  } catch {
    send(res, 404, { error: "not found" });
  }
}

async function handle(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
  const u = new URL(req.url, "http://x");
  const handler = ROUTES.get(u.pathname);
  if (handler) {
    try { return await handler(req, res, u); }
    catch (e) { return send(res, 500, { error: e.message }); }
  }
  if (u.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
  return serveStatic(req, res);
}

export function startServer({ port = 0 } = {}) {
  return new Promise((resolve) => {
    const srv = createServer(handle);
    srv.listen(port, "127.0.0.1", () => {
      const addr = srv.address();
      resolve({ port: addr.port, close: () => new Promise((r) => srv.close(r)) });
    });
  });
}
