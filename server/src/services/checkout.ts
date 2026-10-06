import { hasPermission, type Role } from "../auth/permissions.js";
import { db, type ProductRow, type SettingsRow } from "../db/index.js";
import { logAudit } from "./audit.js";
import { BusinessError, roundMoney } from "./errors.js";
import { computeChange } from "./payment.js";
import { requireOpenShiftId } from "./shifts.js";
import { allocateFefo, deductFromBatches } from "./stock.js";

export type CheckoutInput = {
  items: { product_id: number; qty: number; unit_price_usd?: number }[];
  discount_usd: number;
  paid_usd: number;
  paid_lbp: number;
  payment_method: "cash" | "card" | "mixed";
  notes?: string;
};

export type Actor = { userId: number; role: Role };

const PAYMENT_TOLERANCE_USD = 0.02;

/**
 * Creates a sale atomically: prices come from the catalog (client prices are ignored unless the
 * user may override prices), stock is deducted FEFO, and payment must cover the total.
 */
export function completeSale(input: CheckoutInput, actor: Actor): number {
  const { items, discount_usd, paid_usd, paid_lbp, payment_method, notes } = input;

  if (discount_usd > 0 && !hasPermission(actor.role, "pos.discount")) {
    throw new BusinessError("You are not allowed to apply discounts. Ask a pharmacist.", 403);
  }

  const settings = db.prepare("SELECT * FROM pharmacy_settings WHERE id = 1").get() as SettingsRow;
  const rate = settings.exchange_rate;
  const canOverridePrice = hasPermission(actor.role, "pos.price_override");
  const priceOverrides: { product_id: number; catalog: number; charged: number }[] = [];

  const saleId = db.transaction(() => {
    const shiftId = requireOpenShiftId();
    let subtotalUsd = 0;
    const lineRecords: {
      product_id: number;
      batch_id: number;
      qty: number;
      unit_price_usd: number;
      line_total_usd: number;
    }[] = [];

    for (const item of items) {
      const product = db.prepare("SELECT * FROM products WHERE id = ? AND is_active = 1").get(item.product_id) as
        | ProductRow
        | undefined;
      if (!product) {
        throw new BusinessError(`Product #${item.product_id} not found or inactive`);
      }

      let unitPrice = product.sale_price_usd;
      if (canOverridePrice && item.unit_price_usd !== undefined && item.unit_price_usd !== product.sale_price_usd) {
        unitPrice = item.unit_price_usd;
        priceOverrides.push({ product_id: product.id, catalog: product.sale_price_usd, charged: unitPrice });
      }

      let allocations;
      try {
        allocations = allocateFefo(item.product_id, item.qty);
      } catch {
        const { expired } = db
          .prepare(
            "SELECT COALESCE(SUM(qty), 0) AS expired FROM stock_batches WHERE product_id = ? AND qty > 0 AND expiry_date < date('now', 'localtime')",
          )
          .get(item.product_id) as { expired: number };
        throw new BusinessError(
          expired > 0
            ? `Not enough unexpired stock for ${product.name}. ${expired} unit(s) are expired and cannot be sold — write them off in Inventory.`
            : `Not enough stock for ${product.name}`,
        );
      }
      deductFromBatches(allocations);

      for (const alloc of allocations) {
        const lineTotal = roundMoney(unitPrice * alloc.qty);
        subtotalUsd += lineTotal;
        lineRecords.push({
          product_id: item.product_id,
          batch_id: alloc.batch_id,
          qty: alloc.qty,
          unit_price_usd: unitPrice,
          line_total_usd: lineTotal,
        });
      }
    }

    subtotalUsd = roundMoney(subtotalUsd);
    if (discount_usd > subtotalUsd) {
      throw new BusinessError(
        `Discount (${discount_usd.toFixed(2)} USD) cannot exceed the subtotal (${subtotalUsd.toFixed(2)} USD)`,
      );
    }

    const totalUsd = roundMoney(subtotalUsd - discount_usd);
    const totalLbp = Math.round(totalUsd * rate);
    const paidUsdEquivalent = paid_usd + paid_lbp / rate;

    if (paidUsdEquivalent + PAYMENT_TOLERANCE_USD < totalUsd) {
      throw new BusinessError(
        `Insufficient payment. Total ${totalUsd.toFixed(2)} USD, received ${paidUsdEquivalent.toFixed(2)} USD equivalent`,
      );
    }

    const { changeUsd, changeLbp } = computeChange(totalUsd, paid_usd, paid_lbp, rate);

    const saleResult = db
      .prepare(`
        INSERT INTO sales (
          total_usd, total_lbp, exchange_rate_used, paid_usd, paid_lbp,
          change_usd, change_lbp, user_id, discount_usd, payment_method, notes, shift_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        totalUsd,
        totalLbp,
        rate,
        paid_usd,
        paid_lbp,
        changeUsd,
        changeLbp,
        actor.userId,
        discount_usd,
        payment_method,
        notes ?? null,
        shiftId,
      );

    const newSaleId = Number(saleResult.lastInsertRowid);
    const insertLine = db.prepare(`
      INSERT INTO sale_lines (sale_id, product_id, batch_id, qty, unit_price_usd, line_total_usd)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, reference_id, user_id, notes)
      VALUES (?, ?, 'sale', ?, ?, ?, ?)
    `);

    for (const line of lineRecords) {
      insertLine.run(newSaleId, line.product_id, line.batch_id, line.qty, line.unit_price_usd, line.line_total_usd);
      insertMovement.run(line.product_id, line.batch_id, -line.qty, newSaleId, actor.userId, `Sale #${newSaleId}`);
    }

    return newSaleId;
  })();

  logAudit({
    userId: actor.userId,
    action: "sale.completed",
    entityType: "sale",
    entityId: saleId,
    details: {
      payment_method,
      paid_usd,
      paid_lbp,
      discount_usd,
      ...(priceOverrides.length ? { price_overrides: priceOverrides } : {}),
    },
  });

  return saleId;
}
