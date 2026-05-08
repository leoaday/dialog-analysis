import { test } from "node:test";
import { strict as assert } from "node:assert";
import { LRU } from "../../src/lru.js";

test("LRU stores and retrieves", () => {
  const c = new LRU(2);
  c.set("a", 1); c.set("b", 2);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("b"), 2);
});

test("LRU evicts least-recently-used past capacity", () => {
  const c = new LRU(2);
  c.set("a", 1); c.set("b", 2);
  c.get("a"); // a is now MRU
  c.set("c", 3); // evicts b
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});

test("LRU updates value and promotes", () => {
  const c = new LRU(2);
  c.set("a", 1); c.set("b", 2); c.set("a", 99);
  c.set("c", 3); // evicts b, not a
  assert.equal(c.get("a"), 99);
  assert.equal(c.get("b"), undefined);
});
