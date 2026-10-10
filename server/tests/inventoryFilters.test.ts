import { isoDaysFromToday, startServer, uniqueName, type TestServer } from "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

let s: TestServer;
let tag: string;
let expiredBatch: number;
let soonBatch: number;
let laterBatch: number;

before(async () => {
  s = await startServer();
  tag = uniqueName("Filt");
  const a = await s.receiveProduct({ name: `${tag} Alpha`, price: 1, qty: 4, expiry: isoDaysFromToday(30) });
  soonBatch = a.batch_id;
  const b = await s.receiveProduct({ name: `${tag} Beta`, price: 1, qty: 9, expiry: isoDaysFromToday(400) });
  laterBatch = b.batch_id;
  expiredBatch = await s.receiveBatch(b.product_id, 2, isoDaysFromToday(10));
  const { db } = await import("../src/db/index.js");
  db.prepare("UPDATE stock_batches SET expiry_date = ? WHERE id = ?").run(isoDaysFromToday(-3), expiredBatch);
});
after(() => s.close());

const list = (query: string) => s.call("GET", `/api/inventory/batches?search=${encodeURIComponent(tag)}&${query}`, { token: s.ownerToken });
const ids = (body: { items: { id: number }[] }) => body.items.map((b) => b.id);

describe("inventory batch filters", () => {
  test("expiry filter narrows the list; summary counts stay for the whole search", async () => {
    const all = await list("");
    assert.equal(all.status, 200);
    assert.deepEqual(ids(all.body), [expiredBatch, soonBatch, laterBatch]);
    assert.equal(all.body.summary.expired_batches, 1);
    assert.equal(all.body.summary.soon_batches, 1);

    const expired = await list("expiry=expired");
    assert.deepEqual(ids(expired.body), [expiredBatch]);
    assert.equal(expired.body.total, 1);
    assert.equal(expired.body.summary.batch_count, 3);

    const soon = await list("expiry=soon");
    assert.deepEqual(ids(soon.body), [soonBatch]);
  });

  test("sort options are applied", async () => {
    const byQty = await list("sort=qty");
    assert.deepEqual(ids(byQty.body), [laterBatch, soonBatch, expiredBatch]);
    const byName = await list("sort=name");
    assert.deepEqual(ids(byName.body).slice(0, 1), [soonBatch]);
  });

  test("unknown or prototype keys fall back to defaults instead of reaching SQL", async () => {
    for (const q of ["expiry=constructor", "sort=constructor", "sort=__proto__", "expiry=1%3D1", "sort=sb.qty%3B%20DROP%20TABLE%20products"]) {
      const res = await list(q);
      assert.equal(res.status, 200, q);
      assert.deepEqual(ids(res.body), [expiredBatch, soonBatch, laterBatch], q);
    }
  });
});
