import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { BusinessError, roundMoney } from "../services/errors.js";
import { requireOpenShiftId } from "../services/shifts.js";
import { addToBatch } from "../services/stock.js";
import { getSaleDetail } from "../services/saleDetail.js";

const router = Router();

const returnSchema = z.object({
  sale_id: z.number().int().positive(),
  items: z
    .array(
      z.object({
        sale_line_id: z.number().int().positive(),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
  refund_usd: z.number().nonnegative(),
  refund_lbp: z.number().nonnegative(),
  notes: z.string().max(500).optional(),
});

router.post("/", requireAuth, requirePermission("returns.create"), (req, res) => {
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { sale_id, items, refund_usd, refund_lbp, notes } = parsed.data;
  const userId = req.user!.userId;

  const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(sale_id) as
    | {
        id: number;
        exchange_rate_used: number;
        total_usd: number;
      }
    | undefined;

  if (!sale) {
    return res.status(404).json({ error: "Sale not found" });
  }

  // Discounts are applied to the whole sale, so each line refunds its share of the discounted total.
  const { subtotal } = db
    .prepare("SELECT COALESCE(SUM(line_total_usd), 0) AS subtotal FROM sale_lines WHERE sale_id = ?")
    .get(sale_id) as { subtotal: number };
  const discountRatio = subtotal > 0 ? Math.min(1, sale.total_usd / subtotal) : 0;

  try {
    const returnId = db.transaction(() => {
      const shiftId = requireOpenShiftId();
      let refundTotalUsd = 0;

      const returnResult = db
        .prepare(`
          INSERT INTO returns (sale_id, user_id, refund_usd, refund_lbp, exchange_rate_used, notes, shift_id)
          VALUES (?, ?, 0, 0, ?, ?, ?)
        `)
        .run(sale_id, userId, sale.exchange_rate_used, notes ?? null, shiftId);

      const newReturnId = Number(returnResult.lastInsertRowid);

      for (const item of items) {
        const line = db
          .prepare(`
            SELECT sl.*, (sl.qty - sl.qty_returned) as returnable_qty
            FROM sale_lines sl
            WHERE sl.id = ? AND sl.sale_id = ?
          `)
          .get(item.sale_line_id, sale_id) as
          | {
              id: number;
              product_id: number;
              batch_id: number;
              qty: number;
              qty_returned: number;
              returnable_qty: number;
              unit_price_usd: number;
              line_total_usd: number;
            }
          | undefined;

        if (!line) {
          throw new Error(`Sale line #${item.sale_line_id} not found on this sale`);
        }

        if (item.qty > line.returnable_qty) {
          throw new Error(`Cannot return ${item.qty} units; only ${line.returnable_qty} returnable`);
        }

        const lineRefundUsd = roundMoney((line.line_total_usd / line.qty) * item.qty * discountRatio);
        refundTotalUsd += lineRefundUsd;

        db.prepare(`
          INSERT INTO return_items (return_id, sale_line_id, product_id, batch_id, qty, unit_price_usd, line_refund_usd)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          newReturnId,
          line.id,
          line.product_id,
          line.batch_id,
          item.qty,
          line.unit_price_usd,
          lineRefundUsd,
        );

        db.prepare("UPDATE sale_lines SET qty_returned = qty_returned + ? WHERE id = ?").run(item.qty, line.id);

        addToBatch(line.batch_id, item.qty);

        db.prepare(`
          INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, reference_id, user_id, notes)
          VALUES (?, ?, 'return', ?, ?, ?, ?)
        `).run(line.product_id, line.batch_id, item.qty, newReturnId, userId, `Return for sale #${sale_id}`);
      }

      const refundUsdEquivalent = refund_usd + refund_lbp / sale.exchange_rate_used;
      const tolerance = 0.02;
      if (Math.abs(refundUsdEquivalent - refundTotalUsd) > tolerance) {
        throw new Error(
          `Refund mismatch. Expected ${refundTotalUsd.toFixed(2)} USD, got ${refundUsdEquivalent.toFixed(2)} USD equivalent`,
        );
      }

      db.prepare("UPDATE returns SET refund_usd = ?, refund_lbp = ? WHERE id = ?").run(
        refund_usd,
        refund_lbp,
        newReturnId,
      );

      return newReturnId;
    })();

    logAudit({
      userId,
      action: "return.completed",
      entityType: "return",
      entityId: returnId,
      details: { sale_id, refund_usd, refund_lbp },
    });

    return res.status(201).json({
      return_id: returnId,
      sale: getSaleDetail(sale_id),
    });
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
});

export default router;
