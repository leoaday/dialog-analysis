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
  assert.equal(body.events.length, 9);
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
