import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validateAbsolutePath } from "../../src/path-validate.js";

test("accepts absolute posix path", () => {
  assert.equal(validateAbsolutePath("/Users/x/.claude"), "/Users/x/.claude");
});

test("accepts absolute windows path", () => {
  assert.equal(validateAbsolutePath("C:\\Users\\x"), "C:\\Users\\x");
});

test("rejects relative path", () => {
  assert.throws(() => validateAbsolutePath("./foo"), /absolute/);
});

test("rejects NUL byte", () => {
  assert.throws(() => validateAbsolutePath("/a/b\0c"), /NUL/);
});

test("rejects empty", () => {
  assert.throws(() => validateAbsolutePath(""), /non-empty/);
});

test("normalizes doubled separators", () => {
  assert.equal(validateAbsolutePath("/a//b/../c"), "/a/c");
});
