import "./helpers.js";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hasPermission, permissionsForRole } from "../src/auth/permissions.js";
import { addDays, daysInclusive, resolveRange } from "../src/services/dates.js";
import { roundMoney } from "../src/services/errors.js";
import { computeChange } from "../src/services/payment.js";

describe("currency and change", () => {
  const rate = 89500;

  test("USD overpayment returns USD change", () => {
    assert.deepEqual(computeChange(7.5, 10, 0, rate), { changeUsd: 2.5, changeLbp: 0, changeEquivalent: 2.5 });
  });

  test("LBP overpayment returns LBP change", () => {
    const result = computeChange(2, 0, 200000, rate);
    assert.equal(result.changeUsd, 0);
    assert.equal(result.changeLbp, 200000 - 179000);
  });

  test("mixed payment: USD part then LBP remainder", () => {
    const result = computeChange(15, 10, 500000, rate);
    // Remainder 5 USD = 447,500 LBP; customer gave 500,000 LBP.
    assert.equal(result.changeLbp, 52500);
  });

  test("exact payment has no change", () => {
    assert.equal(computeChange(3, 3, 0, rate).changeEquivalent, 0);
  });

  test("roundMoney rounds half-cents correctly", () => {
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
  });
});

describe("date ranges", () => {
  test("defaults to the last 30 days ending today", () => {
    const range = resolveRange();
    assert.equal(daysInclusive(range.from, range.to), 30);
  });

  test("addDays crosses month boundaries", () => {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  test("rejects reversed and oversized ranges", () => {
    assert.throws(() => resolveRange("2026-05-02", "2026-05-01"), RangeError);
    assert.throws(() => resolveRange("2024-01-01", "2026-01-01"), RangeError);
  });
});

describe("permission matrix", () => {
  test("cashier cannot discount, see revenue or manage users", () => {
    for (const p of ["pos.discount", "reports.sales", "reports.profit", "users.manage", "backup.restore"] as const) {
      assert.equal(hasPermission("cashier", p), false, p);
    }
    assert.equal(hasPermission("cashier", "pos.sell"), true);
  });

  test("owner has every permission; unknown roles have none", () => {
    const owner = new Set(permissionsForRole("owner"));
    for (const p of [...permissionsForRole("pharmacist"), ...permissionsForRole("cashier")]) {
      assert.ok(owner.has(p), p);
    }
    assert.ok(owner.has("reports.profit"));
    assert.deepEqual(permissionsForRole("hacker"), []);
  });
});
