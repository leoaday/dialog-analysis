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
