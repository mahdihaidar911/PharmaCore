import { isoDaysFromToday, startServer, uniqueName, type TestServer } from "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

let s: TestServer;
let cashier: { id: number; token: string };
let pharmacist: { id: number; token: string };

before(async () => {
  s = await startServer();
  cashier = await s.createUser("cashier");
  pharmacist = await s.createUser("pharmacist");
});
after(() => s.close());

describe("cashier restrictions (enforced by the API, not just the UI)", () => {
  test("cannot create or edit products, receive or adjust stock", async () => {
    const product = await s.call("POST", "/api/products", { token: cashier.token, body: { name: uniqueName("P"), sale_price_usd: 1 } });
    assert.equal(product.status, 403);

    const receive = await s.call("POST", "/api/inventory/receive", {
      token: cashier.token,
      body: { product: { name: uniqueName("P"), sale_price_usd: 1 }, qty: 5, expiry_date: isoDaysFromToday(100) },
    });
    assert.equal(receive.status, 403);

    const { batch_id } = await s.receiveProduct({ price: 1, qty: 5, expiry: isoDaysFromToday(100) });
    const adjust = await s.call("POST", "/api/inventory/adjust", {
      token: cashier.token,
      body: { batch_id, qty_change: -1, reason: "damaged" },
    });
    assert.equal(adjust.status, 403);
  });

  test("cannot change settings, restore backups, import MoPH data or process returns", async () => {
    const settings = await s.call("GET", "/api/settings", { token: cashier.token });
    assert.equal(settings.status, 200);
    const put = await s.call("PUT", "/api/settings", {
      token: cashier.token,
      body: { address: settings.body.address, receipt_footer: settings.body.receipt_footer, exchange_rate: 1 },
    });
    assert.equal(put.status, 403);
    assert.equal((await s.call("POST", "/api/backup/restore", { token: cashier.token, body: { filename: "x.db" } })).status, 403);
    assert.equal((await s.call("GET", "/api/moph/status", { token: cashier.token })).status, 403);
    assert.equal(
      (await s.call("POST", "/api/returns", { token: cashier.token, body: { sale_id: 1, items: [{ sale_line_id: 1, qty: 1 }], refund_usd: 0, refund_lbp: 0 } }))
        .status,
      403,
    );
  });

  test("cannot see revenue reports; dashboard omits sales figures", async () => {
    assert.equal((await s.call("GET", "/api/reports/sales-summary", { token: cashier.token })).status, 403);
    assert.equal((await s.call("GET", "/api/reports/profit", { token: cashier.token })).status, 403);
    const dash = await s.call("GET", "/api/reports/dashboard", { token: cashier.token });
    assert.equal(dash.status, 200);
    assert.equal(dash.body.salesToday, null);
    assert.equal(dash.body.topProducts, null);
    assert.ok(Array.isArray(dash.body.lowStock));
  });

  test("can sell, search, view stock, and link barcodes", async () => {
    const { product_id } = await s.receiveProduct({ price: 2, qty: 3, expiry: isoDaysFromToday(200) });
    assert.equal((await s.call("GET", "/api/inventory/batches", { token: cashier.token })).status, 200);
    const link = await s.call("PATCH", `/api/products/${product_id}/barcode`, { token: cashier.token, body: { barcode: uniqueName("BC") } });
    assert.equal(link.status, 200);
    const sale = await s.call("POST", "/api/checkout", {
      token: cashier.token,
      body: { items: [{ product_id, qty: 1 }], paid_usd: 2, paid_lbp: 0, payment_method: "cash" },
    });
    assert.equal(sale.status, 201);
  });
});

describe("pharmacist permissions", () => {
  test("can update the exchange rate but not the receipt footer", async () => {
    const current = (await s.call("GET", "/api/settings", { token: pharmacist.token })).body;
    const rate = await s.call("PUT", "/api/settings", {
      token: pharmacist.token,
      body: { address: current.address, receipt_footer: current.receipt_footer, exchange_rate: 90000 },
    });
    assert.equal(rate.status, 200);
    assert.equal(rate.body.exchange_rate, 90000);

    const footer = await s.call("PUT", "/api/settings", {
      token: pharmacist.token,
      body: { address: current.address, receipt_footer: "changed", exchange_rate: 90000 },
    });
    assert.equal(footer.status, 403);
  });

  test("can see sales reports but not profit or users", async () => {
    assert.equal((await s.call("GET", "/api/reports/sales-summary", { token: pharmacist.token })).status, 200);
    assert.equal((await s.call("GET", "/api/reports/profit", { token: pharmacist.token })).status, 403);
    assert.equal((await s.call("GET", "/api/users", { token: pharmacist.token })).status, 403);
  });

  test("structured sales query is forbidden for cashiers, allowed for pharmacists", async () => {
    const body = { entity: "sales", filters: {} };
    assert.equal((await s.call("POST", "/api/reports/query", { token: cashier.token, body })).status, 403);
    assert.equal((await s.call("POST", "/api/reports/query", { token: pharmacist.token, body })).status, 200);
  });
});
