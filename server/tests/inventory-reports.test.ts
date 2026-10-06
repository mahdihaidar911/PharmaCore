import { isoDaysFromToday, startServer, stockOf, uniqueName, type TestServer } from "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

let s: TestServer;
before(async () => {
  s = await startServer();
});
after(() => s.close());

const sell = (product_id: number, qty: number, paid_usd: number, discount_usd = 0) =>
  s.call("POST", "/api/checkout", {
    token: s.ownerToken,
    body: { items: [{ product_id, qty }], discount_usd, paid_usd, paid_lbp: 0, payment_method: "cash" },
  });

describe("stock adjustments", () => {
  test("writes off stock and records a movement with the reason", async () => {
    const { product_id, batch_id } = await s.receiveProduct({ price: 1, qty: 10, expiry: isoDaysFromToday(100) });
    const res = await s.call("POST", "/api/inventory/adjust", {
      token: s.ownerToken,
      body: { batch_id, qty_change: -3, reason: "damaged", notes: "Dropped box" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.qty, 7);
    assert.equal(await stockOf(s, product_id), 7);

    const today = isoDaysFromToday(0);
    const movements = await s.call("GET", `/api/reports/movements?from=${today}&to=${today}&type=adjustment&product_id=${product_id}`, {
      token: s.ownerToken,
    });
    assert.equal(movements.body.movements.length, 1);
    assert.equal(movements.body.movements[0].reason, "damaged");
    assert.equal(movements.body.movements[0].qty_change, -3);
  });

  test("cannot reduce a batch below zero", async () => {
    const { batch_id } = await s.receiveProduct({ price: 1, qty: 2, expiry: isoDaysFromToday(100) });
    const res = await s.call("POST", "/api/inventory/adjust", { token: s.ownerToken, body: { batch_id, qty_change: -5, reason: "lost" } });
    assert.equal(res.status, 400);
  });

  test("requires notes when the reason is 'other', and rejects zero changes", async () => {
    const { batch_id } = await s.receiveProduct({ price: 1, qty: 2, expiry: isoDaysFromToday(100) });
    assert.equal((await s.call("POST", "/api/inventory/adjust", { token: s.ownerToken, body: { batch_id, qty_change: 1, reason: "other" } })).status, 400);
    assert.equal((await s.call("POST", "/api/inventory/adjust", { token: s.ownerToken, body: { batch_id, qty_change: 0, reason: "count_correction" } })).status, 400);
  });
});

describe("reports", () => {
  test("low stock ignores catalog products that were never stocked", async () => {
    const neverStocked = await s.call("POST", "/api/products", { token: s.ownerToken, body: { name: uniqueName("Catalog"), sale_price_usd: 1 } });
    const low = await s.receiveProduct({ name: uniqueName("LowItem"), price: 1, qty: 2, expiry: isoDaysFromToday(300) });

    const res = await s.call("GET", "/api/reports/low-stock?limit=500", { token: s.ownerToken });
    const ids = res.body.products.map((p: { product_id: number }) => p.product_id);
    assert.ok(ids.includes(low.product_id), "stocked product below min_stock (5) is listed");
    assert.ok(!ids.includes(neverStocked.body.id), "never-received catalog product is not listed");
  });

  test("expiring batches respect the window and minimum quantity", async () => {
    const soon = await s.receiveProduct({ price: 1, qty: 20, expiry: isoDaysFromToday(10) });
    const soonSmall = await s.receiveProduct({ price: 1, qty: 2, expiry: isoDaysFromToday(10) });
    const far = await s.receiveProduct({ price: 1, qty: 20, expiry: isoDaysFromToday(200) });

    const res = await s.call("GET", "/api/reports/expiring?days=30&min_qty=10", { token: s.ownerToken });
    const ids = res.body.batches.map((b: { batch_id: number }) => b.batch_id);
    assert.ok(ids.includes(soon.batch_id));
    assert.ok(!ids.includes(soonSmall.batch_id));
    assert.ok(!ids.includes(far.batch_id));
  });

  test("sales summary reports net revenue after discounts and refunds", async () => {
    const today = isoDaysFromToday(0);
    const before = (await s.call("GET", `/api/reports/sales-summary?from=${today}&to=${today}`, { token: s.ownerToken })).body;

    const { product_id } = await s.receiveProduct({ price: 10, qty: 10, expiry: isoDaysFromToday(300), cost: 6 });
    await sell(product_id, 3, 25, 5); // 30 - 5 discount = 25
    const after = (await s.call("GET", `/api/reports/sales-summary?from=${today}&to=${today}`, { token: s.ownerToken })).body;

    assert.equal(after.sale_count - before.sale_count, 1);
    assert.equal(Math.round((after.net_revenue_usd - before.net_revenue_usd) * 100) / 100, 25);
    assert.equal(Math.round((after.discounts_usd - before.discounts_usd) * 100) / 100, 5);
    assert.equal(after.units_sold - before.units_sold, 3);
  });

  test("top products use net (discounted) revenue", async () => {
    const today = isoDaysFromToday(0);
    const { product_id } = await s.receiveProduct({ name: uniqueName("Top"), price: 10, qty: 10, expiry: isoDaysFromToday(300) });
    await sell(product_id, 2, 18, 2);
    const res = await s.call("GET", `/api/reports/top-products?from=${today}&to=${today}&limit=100&sort=revenue`, { token: s.ownerToken });
    const row = res.body.products.find((p: { product_id: number }) => p.product_id === product_id);
    assert.equal(row.units_sold, 2);
    assert.equal(row.net_revenue_usd, 18);
  });

  test("profit uses batch cost and reports coverage", async () => {
    const tomorrow = isoDaysFromToday(1);
    const today = isoDaysFromToday(0);
    const res = await s.call("GET", `/api/reports/profit?from=${today}&to=${tomorrow}`, { token: s.ownerToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.cost_coverage_percent !== null);
    assert.ok(res.body.gross_profit_usd <= res.body.net_revenue_usd);
  });

  test("rejects invalid or oversized date ranges", async () => {
    assert.equal((await s.call("GET", "/api/reports/sales-summary?from=2026-13-40", { token: s.ownerToken })).status, 400);
    assert.equal((await s.call("GET", "/api/reports/sales-summary?from=2026-05-10&to=2026-05-01", { token: s.ownerToken })).status, 400);
    assert.equal((await s.call("GET", "/api/reports/sales-summary?from=2020-01-01&to=2026-01-01", { token: s.ownerToken })).status, 400);
  });

  test("daily revenue fills days without sales with zero", async () => {
    const res = await s.call("GET", `/api/reports/daily-revenue?from=${isoDaysFromToday(-6)}&to=${isoDaysFromToday(0)}`, { token: s.ownerToken });
    assert.equal(res.body.days.length, 7);
  });
});

describe("structured queries", () => {
  test("batches: expiring within 60 days with more than 10 units", async () => {
    const match = await s.receiveProduct({ name: uniqueName("SQ"), price: 1, qty: 15, expiry: isoDaysFromToday(40) });
    const tooFew = await s.receiveProduct({ name: uniqueName("SQ"), price: 1, qty: 5, expiry: isoDaysFromToday(40) });
    const res = await s.call("POST", "/api/reports/query", {
      token: s.ownerToken,
      body: { entity: "batches", filters: { expires_within_days: 60, min_qty: 11 } },
    });
    assert.equal(res.status, 200);
    const ids = res.body.rows.map((r: { batch_id: number }) => r.batch_id);
    assert.ok(ids.includes(match.batch_id));
    assert.ok(!ids.includes(tooFew.batch_id));
    assert.deepEqual(res.body.applied_filters, ["Expires within 60 days", "Quantity ≥ 11"]);
  });

  test("rejects unknown filters instead of ignoring them", async () => {
    const res = await s.call("POST", "/api/reports/query", {
      token: s.ownerToken,
      body: { entity: "products", filters: { drop_table: "products" } },
    });
    assert.equal(res.status, 400);
  });

  test("sales: minimum total filter", async () => {
    const { product_id } = await s.receiveProduct({ price: 600, qty: 2, expiry: isoDaysFromToday(300) });
    const big = await sell(product_id, 1, 600);
    const res = await s.call("POST", "/api/reports/query", {
      token: s.ownerToken,
      body: { entity: "sales", filters: { min_total_usd: 500 } },
    });
    assert.ok(res.body.rows.some((r: { id: number }) => r.id === big.body.sale.id));
    assert.ok(res.body.rows.every((r: { total_usd: number }) => r.total_usd >= 500));
  });
});
