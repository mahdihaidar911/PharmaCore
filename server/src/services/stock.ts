import { db } from "../db/index.js";

export type BatchAllocation = {
  batch_id: number;
  qty: number;
};

export function allocateFefo(productId: number, qtyNeeded: number): BatchAllocation[] {
  const batches = db
    .prepare(`
      SELECT id, qty FROM stock_batches
      WHERE product_id = ? AND qty > 0
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
