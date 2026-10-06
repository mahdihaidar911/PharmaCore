import { isoDaysFromToday, startServer, stockOf, type TestServer } from "./helpers.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

async function currentShiftId(): Promise<number | null> {
  const res = await s.call("GET", "/api/shifts/current", { token: s.ownerToken });
  return res.body.shift?.id ?? null;
}

async function closeCurrentShift() {
  const id = await currentShiftId();
  if (id) await s.call("POST", `/api/shifts/${id}/close`, { token: s.ownerToken, body: { counted_usd: 0, counted_lbp: 0 } });
}

async function openShift(opening_usd = 0, opening_lbp = 0, token = s.ownerToken) {
  const res = await s.call("POST", "/api/shifts/open", { token, body: { opening_usd, opening_lbp } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.shift.id as number;
}

describe("cash drawer shifts", () => {
  test("only one shift can be open at a time", async () => {
    const res = await s.call("POST", "/api/shifts/open", { token: s.ownerToken, body: { opening_usd: 0, opening_lbp: 0 } });
    assert.equal(res.status, 409);
  });

  test("sales and refunds are refused while the drawer is closed", async () => {
    const { product_id } = await s.receiveProduct({ price: 5, qty: 5, expiry: isoDaysFromToday(200) });
    const sale = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 5 });
    assert.equal(sale.status, 201);

    await closeCurrentShift();
    const blocked = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 5 });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /drawer is closed/);
    assert.equal(await stockOf(s, product_id), 4, "no stock taken by the refused sale");

    const refund = await s.call("POST", "/api/returns", {
      token: pharmacist.token,
      body: { sale_id: sale.body.sale.id, items: [{ sale_line_id: sale.body.lines[0].id, qty: 1 }], refund_usd: 5, refund_lbp: 0 },
    });
    assert.equal(refund.status, 409);
    await openShift();
  });

  test("expected cash per currency covers change, card sales, refunds and pay-outs", async () => {
    await closeCurrentShift();
    const shiftId = await openShift(50, 1_000_000);
    const { product_id } = await s.receiveProduct({ price: 10, qty: 20, expiry: isoDaysFromToday(200) });

    // $20 note for a $10 sale → $10 change. Drawer +10 USD.
    await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 20 });
    // Paid fully in LBP with LBP change. Drawer + 10 * RATE LBP.
    await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 0, paid_lbp: 1_000_000 });
    // Card: nothing enters the drawer.
    await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 10, payment_method: "card" });
    // Refund one unit of a $10 sale in USD. Drawer −10 USD.
    const refunded = await checkout(cashier.token, { items: [{ product_id, qty: 1 }], paid_usd: 10 });
    await s.call("POST", "/api/returns", {
      token: pharmacist.token,
      body: { sale_id: refunded.body.sale.id, items: [{ sale_line_id: refunded.body.lines[0].id, qty: 1 }], refund_usd: 10, refund_lbp: 0 },
    });
    const payOut = await s.call("POST", `/api/shifts/${shiftId}/movements`, {
      token: cashier.token,
      body: { type: "pay_out", amount_usd: 0, amount_lbp: 200_000, reason: "Delivery boy" },
    });
    assert.equal(payOut.status, 201);

    const current = await s.call("GET", "/api/shifts/current", { token: pharmacist.token });
    const t = current.body.totals;
    assert.equal(t.sale_count, 4);
    assert.equal(t.card_sale_count, 1);
    assert.equal(t.expected_usd, 50 + 10 + 10 - 10);
    assert.equal(t.expected_lbp, 1_000_000 + 10 * RATE - 200_000);
    assert.equal(t.net_sales_usd, 30, "four $10 sales minus one $10 refund");

    const close = await s.call("POST", `/api/shifts/${shiftId}/close`, {
      token: pharmacist.token,
      body: { counted_usd: 55, counted_lbp: t.expected_lbp },
    });
    assert.equal(close.status, 200);
    assert.equal(close.body.variance.usd, -5);
    assert.equal(close.body.variance.lbp, 0);

    const history = await s.call("GET", "/api/shifts", { token: pharmacist.token });
    const closed = history.body.shifts.find((x: { id: number }) => x.id === shiftId);
    assert.equal(closed.status, "closed");
    assert.equal(closed.variance_usd, -5);
    await openShift();
  });

  test("cashiers count blind: no expected totals, no variance, no history", async () => {
    await closeCurrentShift();
    const shiftId = await openShift(20, 0, cashier.token);
    const current = await s.call("GET", "/api/shifts/current", { token: cashier.token });
    assert.equal(current.status, 200);
    assert.equal(current.body.shift.id, shiftId);
    assert.equal(current.body.totals, null);

    const close = await s.call("POST", `/api/shifts/${shiftId}/close`, { token: cashier.token, body: { counted_usd: 20, counted_lbp: 0 } });
    assert.equal(close.status, 200);
    assert.equal(close.body.variance, null);
    assert.equal(close.body.shift.expected_usd, undefined);
    assert.equal((await s.call("GET", "/api/shifts", { token: cashier.token })).status, 403);
    assert.equal((await s.call("GET", `/api/shifts/${shiftId}`, { token: cashier.token })).status, 403);
    await openShift();
  });

  test("the AI shift tool is offered to pharmacists, never to cashiers", async () => {
    const { toolSpecsForRole, executeTool } = await import("../src/ai/tools.js");
    const names = (role: "cashier" | "pharmacist") => toolSpecsForRole(role).map((t) => t.function.name);
    assert.ok(names("pharmacist").includes("get_cash_shifts"));
    assert.ok(!names("cashier").includes("get_cash_shifts"));
    const denied = await executeTool("get_cash_shifts", "{}", "cashier");
    assert.equal(denied.status, "permission_denied");
    const ok = await executeTool("get_cash_shifts", '{"limit":3}', "pharmacist");
    assert.equal(ok.status, "ok");
  });

  test("pay-outs need a reason and an amount; closed shifts reject movements", async () => {
    const shiftId = (await currentShiftId())!;
    const noReason = await s.call("POST", `/api/shifts/${shiftId}/movements`, {
      token: cashier.token,
      body: { type: "pay_out", amount_usd: 5, reason: "" },
    });
    assert.equal(noReason.status, 400);
    const noAmount = await s.call("POST", `/api/shifts/${shiftId}/movements`, {
      token: cashier.token,
      body: { type: "pay_in", reason: "Float top-up" },
    });
    assert.equal(noAmount.status, 400);

    await closeCurrentShift();
    const late = await s.call("POST", `/api/shifts/${shiftId}/movements`, {
      token: cashier.token,
      body: { type: "pay_in", amount_usd: 5, reason: "Float top-up" },
    });
    assert.equal(late.status, 409);
    await openShift();
  });
});

describe("held sales", () => {
  test("hold, list and resume once; resumed carts use current prices", async () => {
    const { product_id } = await s.receiveProduct({ price: 4, qty: 10, expiry: isoDaysFromToday(200) });
    const held = await s.call("POST", "/api/held-carts", {
      token: cashier.token,
      body: { label: "Lady in red", items: [{ product_id, qty: 2 }, { product_id, qty: 1 }], discount_usd: 2 },
    });
    assert.equal(held.status, 201);
    assert.equal(held.body.items.length, 1, "duplicate lines are merged");
    assert.equal(held.body.items[0].qty, 3);
    assert.equal(held.body.discount_usd, 0, "cashier discounts are not stored");

    await s.call("PUT", `/api/products/${product_id}`, { token: s.ownerToken, body: { name: held.body.items[0].name, sale_price_usd: 5 } });

    const list = await s.call("GET", "/api/held-carts", { token: pharmacist.token });
    assert.ok(list.body.some((c: { id: number }) => c.id === held.body.id), "visible to other users on the workstation");

    const resumed = await s.call("POST", `/api/held-carts/${held.body.id}/resume`, { token: cashier.token });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.items[0].sale_price_usd, 5);
    assert.equal(resumed.body.items[0].available, true);

    const again = await s.call("POST", `/api/held-carts/${held.body.id}/resume`, { token: pharmacist.token });
    assert.equal(again.status, 404);
  });

  test("discarding requires sell permission and removes the cart", async () => {
    const { product_id } = await s.receiveProduct({ price: 1, qty: 1, expiry: isoDaysFromToday(200) });
    const held = await s.call("POST", "/api/held-carts", { token: cashier.token, body: { items: [{ product_id, qty: 1 }] } });
    assert.equal((await s.call("DELETE", `/api/held-carts/${held.body.id}`)).status, 401);
    assert.equal((await s.call("DELETE", `/api/held-carts/${held.body.id}`, { token: cashier.token })).status, 204);
    assert.equal((await s.call("DELETE", `/api/held-carts/${held.body.id}`, { token: cashier.token })).status, 404);
  });
});

describe("expired stock", () => {
  async function expireBatch(batchId: number) {
    const { db } = await import("../src/db/index.js");
    db.prepare("UPDATE stock_batches SET expiry_date = ? WHERE id = ?").run(isoDaysFromToday(-1), batchId);
  }

  test("is never sold, even though FEFO would pick it first", async () => {
    const { product_id, batch_id: good } = await s.receiveProduct({ price: 2, qty: 3, expiry: isoDaysFromToday(200) });
    const old = await s.receiveBatch(product_id, 5, isoDaysFromToday(10));
    await expireBatch(old);

    const ok = await checkout(cashier.token, { items: [{ product_id, qty: 2 }], paid_usd: 4 });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.lines.map((l: { batch_id: number }) => l.batch_id), [good]);

    const tooMany = await checkout(cashier.token, { items: [{ product_id, qty: 2 }], paid_usd: 4 });
    assert.equal(tooMany.status, 400);
    assert.match(tooMany.body.error, /5 unit\(s\) are expired/);
  });

  test("POS stock excludes expired units; receiving expired stock is refused", async () => {
    const name = `ExpiredOnly_${Date.now()}`;
    const { batch_id } = await s.receiveProduct({ name, price: 1, qty: 4, expiry: isoDaysFromToday(5) });
    await expireBatch(batch_id);
    const pos = await s.call("GET", `/api/pos/search?q=${encodeURIComponent(name)}`, { token: cashier.token });
    assert.equal(pos.body[0].total_qty, 0);

    const receive = await s.call("POST", "/api/inventory/receive", {
      token: s.ownerToken,
      body: { product: { name: `${name}_2`, sale_price_usd: 1 }, qty: 1, expiry_date: isoDaysFromToday(-3) },
    });
    assert.equal(receive.status, 400);
    assert.match(receive.body.error, /expired/);
  });
});

describe("backups", () => {
  test("manual backup is listed and reflected in status; cashiers have no access", async () => {
    const before = await s.call("GET", "/api/backup/status", { token: pharmacist.token });
    assert.equal(before.status, 200);
    assert.equal(before.body.stale, true);
    assert.ok(before.body.warnings.some((w: string) => /No backup/.test(w)));

    const created = await s.call("POST", "/api/backup/create", { token: pharmacist.token });
    assert.equal(created.status, 201);
    assert.equal(created.body.copy_status, "skipped");

    const status = await s.call("GET", "/api/backup/status", { token: pharmacist.token });
    assert.equal(status.body.stale, false);
    assert.ok(status.body.warnings.some((w: string) => /only on this computer/.test(w)));

    const list = await s.call("GET", "/api/backup", { token: pharmacist.token });
    assert.equal(list.body[0].filename, created.body.filename);
    assert.equal(list.body[0].kind, "manual");
    assert.equal((await s.call("GET", "/api/backup/status", { token: cashier.token })).status, 403);
  });

  test("second-location copy: validated, owner only, and applied to new backups", async () => {
    const body = { auto_enabled: true, keep_auto: 3, copy_dir: "relative/folder" };
    assert.equal((await s.call("PUT", "/api/backup/settings", { token: pharmacist.token, body })).status, 403);
    assert.equal((await s.call("PUT", "/api/backup/settings", { token: s.ownerToken, body })).status, 400);

    const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), "pharmacore-copy-"));
    const saved = await s.call("PUT", "/api/backup/settings", { token: s.ownerToken, body: { ...body, copy_dir: copyDir } });
    assert.equal(saved.status, 200);

    const created = await s.call("POST", "/api/backup/create", { token: s.ownerToken });
    assert.equal(created.body.copy_status, "copied");
    assert.ok(fs.existsSync(path.join(copyDir, created.body.filename)));
  });

  test("scheduler backs up only when the last backup is a day old, and prunes old automatic backups", async () => {
    const { runScheduledBackupIfDue } = await import("../src/services/backup.js");
    assert.equal(await runScheduledBackupIfDue(new Date()), null, "recent manual backup → nothing to do");

    for (let day = 1; day <= 5; day++) {
      const result = await runScheduledBackupIfDue(new Date(Date.now() + day * 25 * 3_600_000));
      assert.ok(result, `day ${day} should create a backup`);
      await new Promise((r) => setTimeout(r, 5));
    }
    const list = await s.call("GET", "/api/backup", { token: s.ownerToken });
    const autos = list.body.filter((b: { kind: string }) => b.kind === "auto");
    assert.equal(autos.length, 3, "keep_auto = 3");
  });
});
