import { db } from "../db/index.js";
import { BusinessError } from "./errors.js";

export type BatchAllocation = {
  batch_id: number;
  qty: number;
};

/** A batch can be sold through its expiry date (local time), never after. */
export const SELLABLE_BATCH_SQL = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `${p}qty > 0 AND ${p}expiry_date >= date('now', 'localtime')`;
};

/** Correlated subquery for the sellable quantity of product `p`. */
export const SELLABLE_QTY_SQL = `(SELECT COALESCE(SUM(sbq.qty), 0) FROM stock_batches sbq WHERE sbq.product_id = p.id AND ${SELLABLE_BATCH_SQL("sbq")})`;

export function allocateFefo(productId: number, qtyNeeded: number): BatchAllocation[] {
  const batches = db
    .prepare(`
      SELECT id, qty FROM stock_batches
      WHERE product_id = ? AND ${SELLABLE_BATCH_SQL()}
      ORDER BY expiry_date ASC, id ASC
    `)
    .all(productId) as { id: number; qty: number }[];

  const allocations: BatchAllocation[] = [];
  let remaining = qtyNeeded;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.qty, remaining);
    allocations.push({ batch_id: batch.id, qty: take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(`Insufficient stock for product #${productId}`);
  }

  return allocations;
}

export function deductFromBatches(allocations: BatchAllocation[]) {
  const update = db.prepare("UPDATE stock_batches SET qty = qty - ? WHERE id = ? AND qty >= ?");
  for (const { batch_id, qty } of allocations) {
    const result = update.run(qty, batch_id, qty);
    if (result.changes === 0) {
      throw new Error(`Failed to deduct from batch #${batch_id}`);
    }
  }
}

export function addToBatch(batchId: number, qty: number) {
  db.prepare("UPDATE stock_batches SET qty = qty + ? WHERE id = ?").run(qty, batchId);
}

export const ADJUSTMENT_REASONS = ["expired", "damaged", "lost", "count_correction", "other"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/** Manual correction of one batch. Negative qtyChange removes stock (write-off), positive adds. */
export function adjustBatch(params: {
  batchId: number;
  qtyChange: number;
  reason: AdjustmentReason;
  notes: string | null;
  userId: number;
}) {
  return db.transaction(() => {
    const batch = db
      .prepare("SELECT id, product_id, qty FROM stock_batches WHERE id = ?")
      .get(params.batchId) as { id: number; product_id: number; qty: number } | undefined;
    if (!batch) {
      throw new BusinessError("Batch not found", 404);
    }
    const newQty = batch.qty + params.qtyChange;
    if (newQty < 0) {
      throw new BusinessError(`Cannot remove ${-params.qtyChange} units; batch only has ${batch.qty}`);
    }

    db.prepare("UPDATE stock_batches SET qty = ? WHERE id = ?").run(newQty, batch.id);
    const movement = db
      .prepare(`
        INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, reference_id, user_id, reason, notes)
        VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?)
      `)
      .run(batch.product_id, batch.id, params.qtyChange, batch.id, params.userId, params.reason, params.notes);

    return { movement_id: Number(movement.lastInsertRowid), batch_id: batch.id, product_id: batch.product_id, qty: newQty };
  })();
}
