import { test } from "node:test";
import { strict as assert } from "node:assert";
import { streamJsonl } from "../../src/parser/jsonl-stream.js";

test("yields parsed objects from basic.jsonl", async () => {
  const out = [];
  for await (const ev of streamJsonl("test/fixtures/basic.jsonl")) out.push(ev);
  assert.equal(out.length, 9);
  assert.equal(out[0].type, "queue-operation");
  assert.equal(out[1].type, "user");
});

test("counts malformed lines and skips them", async () => {
  const out = [];
  let malformed = 0;
  for await (const ev of streamJsonl("test/fixtures/malformed.jsonl", { onMalformed: () => malformed++ })) {
    out.push(ev);
  }
  assert.equal(out.length, 9);
  assert.equal(malformed, 2);
});

test("supports early break", async () => {
  let n = 0;
  for await (const _ of streamJsonl("test/fixtures/basic.jsonl")) {
    n++;
    if (n === 2) break;
  }
  assert.equal(n, 2);
});
