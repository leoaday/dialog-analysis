import { test } from "node:test";
import { strict as assert } from "node:assert";
import { log } from "../../src/log.js";

test("log() respects DEBUG_DA env levels", () => {
  // capture stderr
  const original = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = (s) => { captured.push(String(s)); return true; };
  try {
    process.env.DEBUG_DA = "";
    log.info("ignored");
    assert.equal(captured.length, 0);

    process.env.DEBUG_DA = "1";
    log.info("seen");
    log.trace("not at info level");
    assert.equal(captured.length, 1);
    assert.match(captured[0], /seen/);

    process.env.DEBUG_DA = "trace";
    captured.length = 0;
    log.info("info-here");
    log.trace("trace-here");
    assert.equal(captured.length, 2);
  } finally {
    process.stderr.write = original;
    delete process.env.DEBUG_DA;
  }
});
