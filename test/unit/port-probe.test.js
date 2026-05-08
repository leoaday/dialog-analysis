import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { probeFreePort } from "../../src/port-probe.js";

function holdPort(port) {
  return new Promise((resolve) => {
    const s = createServer().listen(port, "127.0.0.1", () => resolve(s));
  });
}

test("returns first port in range when free", async () => {
  const p = await probeFreePort([55301, 55302]);
  assert.equal(p, 55301);
});

test("skips occupied port", async () => {
  const held = await holdPort(55310);
  try {
    const p = await probeFreePort([55310, 55311]);
    assert.equal(p, 55311);
  } finally {
    held.close();
  }
});

test("throws if all ports occupied", async () => {
  const a = await holdPort(55320), b = await holdPort(55321);
  try {
    await assert.rejects(probeFreePort([55320, 55321]), /no free/i);
  } finally {
    a.close(); b.close();
  }
});
