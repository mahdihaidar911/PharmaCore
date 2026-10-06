import { isoDaysFromToday, startServer, stockOf, type TestServer } from "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

let s: TestServer;
let cashier: { token: string };
let pharmacist: { token: string };
const RATE = 89500;

before(async () => {
  s = await startServer();
  cashier = await s.createUser("cashier");
  pharmacist = await s.createUser("pharmacist");
});
after(() => s.close());

const checkout = (token: string, body: Record<string, unknown>) =>
  s.call("POST", "/api/checkout", { token, body: { discount_usd: 0, paid_lbp: 0, payment_method: "cash", ...body } });

describe("checkout pricing and discounts", () => {
  test("ignores a client-supplied price for users without price override", async () => {
    const { product_id } = await s.receiveProduct({ price: 10, qty: 5, expiry: isoDaysFromToday(300) });
    const res = await checkout(cashier.token, { items: [{ product_id, qty: 2, unit_price_usd: 0 }], paid_usd: 20 });
    assert.equal(res.status, 201);
    assert.equal(res.body.sale.total_usd, 20);
    assert.equal(res.body.lines[0].unit_price_usd, 10);
  });

  test("owners may override the price, and the override is used", async () => {
    const { product_id } = await s.receiveProduct({ price: 10, qty: 5, expiry: isoDaysFromToday(300) });
    const res = await checkout(s.ownerToken, { items: [{ product_id, qty: 1, unit_price_usd: 7.5 }], paid_usd: 7.5 });
    assert.equal(res.status, 201);
    assert.equal(res.body.sale.total_usd, 7.5);
  });

  test("cashiers cannot apply discounts; pharmacists can", async () => {
    const { product_id } = await s.receiveProduct({ price: 10, qty: 5, expiry: isoDaysFromToday(300) });
    const denied = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], discount_usd: 1, paid_usd: 10 });
    assert.equal(denied.status, 403);
    assert.equal(await stockOf(s, product_id), 5, "stock untouched after rejected sale");

    const ok = await checkout(pharmacist.token, { items: [{ product_id, qty: 1 }], discount_usd: 1, paid_usd: 9 });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.sale.total_usd, 9);
  });

  test("rejects a discount larger than the subtotal", async () => {
    const { product_id } = await s.receiveProduct({ price: 5, qty: 5, expiry: isoDaysFromToday(300) });
    const res = await checkout(pharmacist.token, { items: [{ product_id, qty: 1 }], discount_usd: 6, paid_usd: 0 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /cannot exceed the subtotal/);
    assert.equal(await stockOf(s, product_id), 5);
  });
});

describe("checkout stock and payment", () => {
  test("deducts first-expiry-first-out across batches", async () => {
    const { product_id, batch_id: lateBatch } = await s.receiveProduct({ price: 1, qty: 5, expiry: isoDaysFromToday(400) });
    const earlyBatch = await s.receiveBatch(product_id, 3, isoDaysFromToday(60));

    const res = await checkout(cashier.token, { items: [{ product_id, qty: 4 }], paid_usd: 4 });
    assert.equal(res.status, 201);
    const byBatch = Object.fromEntries(res.body.lines.map((l: { batch_id: number; qty: number }) => [l.batch_id, l.qty]));
    assert.deepEqual(byBatch, { [earlyBatch]: 3, [lateBatch]: 1 });
    assert.equal(await stockOf(s, product_id), 4);
  });

  test("rejects overselling and rolls back every line", async () => {
    const a = await s.receiveProduct({ price: 1, qty: 5, expiry: isoDaysFromToday(300) });
    const b = await s.receiveProduct({ price: 1, qty: 1, expiry: isoDaysFromToday(300) });
    const res = await checkout(cashier.token, {
      items: [
        { product_id: a.product_id, qty: 2 },
        { product_id: b.product_id, qty: 2 },
      ],
      paid_usd: 10,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Not enough stock/);
    assert.equal(await stockOf(s, a.product_id), 5, "first line must be rolled back");
  });

  test("accepts LBP payment and computes LBP change", async () => {
    const { product_id } = await s.receiveProduct({ price: 2, qty: 5, expiry: isoDaysFromToday(300) });
    const res = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 0, paid_lbp: 200000 });
    assert.equal(res.status, 201);
    assert.equal(res.body.sale.total_lbp, 2 * RATE);
    assert.equal(res.body.sale.change_lbp, 200000 - 2 * RATE);
  });

  test("rejects insufficient payment", async () => {
    const { product_id } = await s.receiveProduct({ price: 2, qty: 5, expiry: isoDaysFromToday(300) });
    const res = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 1, paid_lbp: 50000 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Insufficient payment/);
  });
});

describe("returns", () => {
  test("restores stock and refunds the discounted share of the line", async () => {
    const { product_id } = await s.receiveProduct({ price: 10, qty: 10, expiry: isoDaysFromToday(300) });
    // Subtotal 40, discount 4 → customer paid 36, i.e. $9 per unit.
    const sale = await checkout(pharmacist.token, { items: [{ product_id, qty: 4 }], discount_usd: 4, paid_usd: 36 });
    const line = sale.body.lines[0];

    const wrong = await s.call("POST", "/api/returns", {
      token: pharmacist.token,
      body: { sale_id: sale.body.sale.id, items: [{ sale_line_id: line.id, qty: 1 }], refund_usd: 10, refund_lbp: 0 },
    });
    assert.equal(wrong.status, 400, "full list price must not be refunded on a discounted sale");

    const ok = await s.call("POST", "/api/returns", {
      token: pharmacist.token,
      body: { sale_id: sale.body.sale.id, items: [{ sale_line_id: line.id, qty: 1 }], refund_usd: 9, refund_lbp: 0 },
    });
    assert.equal(ok.status, 201);
    assert.equal(await stockOf(s, product_id), 7);
  });

  test("cannot return more than was sold", async () => {
    const { product_id } = await s.receiveProduct({ price: 3, qty: 5, expiry: isoDaysFromToday(300) });
    const sale = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 3 });
    const res = await s.call("POST", "/api/returns", {
      token: pharmacist.token,
      body: { sale_id: sale.body.sale.id, items: [{ sale_line_id: sale.body.lines[0].id, qty: 2 }], refund_usd: 6, refund_lbp: 0 },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /only 1 returnable/);
  });

  test("accepts a refund paid in LBP at the sale's exchange rate", async () => {
    const { product_id } = await s.receiveProduct({ price: 4, qty: 5, expiry: isoDaysFromToday(300) });
    const sale = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 4 });
    const res = await s.call("POST", "/api/returns", {
      token: pharmacist.token,
      body: { sale_id: sale.body.sale.id, items: [{ sale_line_id: sale.body.lines[0].id, qty: 1 }], refund_usd: 0, refund_lbp: 4 * RATE },
    });
    assert.equal(res.status, 201);
  });
});
