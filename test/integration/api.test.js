import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { startServer } from "../../src/server.js";
import { resolve } from "node:path";

let server, base;
const FIXTURES = resolve("test/fixtures");

before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.port}`; });
after(() => server?.close());

test("GET /api/list-dir returns entries", async () => {
  const r = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.path, FIXTURES);
  assert.ok(Array.isArray(body.entries));
  assert.ok(body.entries.some((e) => e.name === "basic.jsonl"));
});

test("GET unknown path returns 404", async () => {
  const r = await fetch(`${base}/api/list-dir?path=${encodeURIComponent("/no/such/dir/xyz123")}`);
  assert.equal(r.status, 404);
});

test("rejects relative path", async () => {
  const r = await fetch(`${base}/api/list-dir?path=foo`);
  assert.equal(r.status, 400);
});

test("list-dir marks Claude project subdirs", async () => {
  const r = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`);
  const body = await r.json();
  const sub = body.entries.find((e) => e.name === "multi-session-dir");
  assert.equal(sub.type, "jsonl-dir");
  assert.equal(sub.isClaudeProject, true);
  assert.ok(typeof sub.sessionCount === "number" && sub.sessionCount >= 2);
});

const SESSIONS_DIR = resolve("test/fixtures/multi-session-dir");

test("GET /api/sessions returns metadata + subagents", async () => {
  const r = await fetch(`${base}/api/sessions?dir=${encodeURIComponent(SESSIONS_DIR)}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.dir, SESSIONS_DIR);
  assert.equal(body.sessions.length, 2);
  const s2 = body.sessions.find((s) => s.sessionId === "s2");
  assert.ok(s2.firstUserSummary.includes("second session start"));
  assert.equal(s2.subagentCount, 1);
  assert.equal(s2.subagents[0].agentId, "y");
  assert.equal(s2.subagents[0].agentType, "reviewer");
});

test("GET /api/session returns events array + ETag", async () => {
  const file = resolve("test/fixtures/basic.jsonl");
  const r = await fetch(`${base}/api/session?file=${encodeURIComponent(file)}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("ETag") || "", /W\/".+"/);
  const body = await r.json();
  assert.equal(body.events.length, 12);
});

test("GET /api/session honors If-None-Match -> 304", async () => {
  const file = resolve("test/fixtures/basic.jsonl");
  const r1 = await fetch(`${base}/api/session?file=${encodeURIComponent(file)}`);
  const etag = r1.headers.get("ETag");
  const r2 = await fetch(`${base}/api/session?file=${encodeURIComponent(file)}`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});

test("GET /api/subagent returns events", async () => {
  const file = resolve("test/fixtures/with-subagents/parent/subagents/agent-x.jsonl");
  const r = await fetch(`${base}/api/subagent?file=${encodeURIComponent(file)}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.events.length, 2);
});

test("search hits in session body", async () => {
  const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=second%20session%20start`);
  assert.equal(r.status, 200);
  const body = await r.json();
  const s = body.sessions.find((x) => x.sessionId === "s2");
  assert.ok(s.hitInSession);
  assert.ok(s.sessionMatches.length >= 1);
});

test("search hits in subagent surfaces parent session with subagent-only flag", async () => {
  const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=sidechain%20prompt%20for%20y`);
  const body = await r.json();
  const s = body.sessions.find((x) => x.sessionId === "s2");
  assert.equal(s.hitInSession, false);
  assert.equal(s.hitInSubagent, true);
  assert.equal(s.subagentMatches[0].agentId, "y");
});

test("invalid regex returns 400", async () => {
  const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=(&regex=1`);
  assert.equal(r.status, 400);
});

test("search reports per-file truncated flag when matches exceed cap", async () => {
  // synthesize a file with > 50 matches inline
  const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "da-trunc-"));
  const file = join(dir, "many.jsonl");
  // 60 user lines each containing the literal "needle"
  const lines = Array.from({ length: 60 }, (_, i) =>
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: `needle ${i}` }] }, uuid: `u${i}` })
  );
  writeFileSync(file, lines.join("\n") + "\n");
  try {
    const r = await fetch(`${base}/api/search?dir=${encodeURIComponent(dir)}&q=needle`);
    assert.equal(r.status, 200);
    const body = await r.json();
    const s = body.sessions[0];
    assert.equal(s.sessionMatches.length, 50);
    assert.equal(s.truncated, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("vendor static files are served", async () => {
  for (const f of ["marked.min.js", "purify.min.js", "highlight.min.js", "github.min.css"]) {
    const r = await fetch(`${base}/vendor/${f}`);
    assert.equal(r.status, 200, `vendor/${f} should serve`);
    const text = await r.text();
    assert.ok(text.length > 1000, `vendor/${f} should be non-trivial`);
  }
});

test("/api/list-dir returns ETag and honors If-None-Match", async () => {
  const r1 = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`);
  const etag = r1.headers.get("ETag");
  assert.match(etag || "", /W\/".+"/);
  const r2 = await fetch(`${base}/api/list-dir?path=${encodeURIComponent(FIXTURES)}`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});

test("/api/sessions returns ETag and honors If-None-Match", async () => {
  const r1 = await fetch(`${base}/api/sessions?dir=${encodeURIComponent(SESSIONS_DIR)}`);
  const etag = r1.headers.get("ETag");
  assert.match(etag || "", /W\/".+"/);
  const r2 = await fetch(`${base}/api/sessions?dir=${encodeURIComponent(SESSIONS_DIR)}`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});

test("/api/search returns ETag and honors If-None-Match", async () => {
  const r1 = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=second%20session%20start`);
  const etag = r1.headers.get("ETag");
  assert.match(etag || "", /W\/".+"/);
  const r2 = await fetch(`${base}/api/search?dir=${encodeURIComponent(SESSIONS_DIR)}&q=second%20session%20start`, { headers: { "If-None-Match": etag } });
  assert.equal(r2.status, 304);
});
