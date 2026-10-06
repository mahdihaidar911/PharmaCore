import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db, type ProductRow, type SettingsRow } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { getSaleDetail } from "../services/saleDetail.js";
import { computeChange } from "../services/payment.js";
import { allocateFefo, deductFromBatches } from "../services/stock.js";

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().int().positive(),
        unit_price_usd: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
  discount_usd: z.number().nonnegative().default(0),
  paid_usd: z.number().nonnegative(),
  paid_lbp: z.number().nonnegative(),
  payment_method: z.enum(["cash", "card", "mixed"]),
  notes: z.string().max(500).optional(),
});

export function checkoutHandler(req: Request, res: Response) {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { items, discount_usd, paid_usd, paid_lbp, payment_method, notes } = parsed.data;
  const settings = db.prepare("SELECT * FROM pharmacy_settings WHERE id = 1").get() as SettingsRow;
  const rate = settings.exchange_rate;
  const userId = req.user!.userId;

  try {
    const saleId = db.transaction(() => {
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
          throw new Error(`Product #${item.product_id} not found`);
        }

        const unitPrice = item.unit_price_usd ?? product.sale_price_usd;
        const allocations = allocateFefo(item.product_id, item.qty);
        deductFromBatches(allocations);

        for (const alloc of allocations) {
          const lineTotal = unitPrice * alloc.qty;
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

      const totalUsd = Math.max(0, subtotalUsd - discount_usd);
      const totalLbp = Math.round(totalUsd * rate);
      const paidUsdEquivalent = paid_usd + paid_lbp / rate;
      const tolerance = 0.02;

      if (paidUsdEquivalent + tolerance < totalUsd) {
        throw new Error(
          `Insufficient payment. Total ${totalUsd.toFixed(2)} USD, received ${paidUsdEquivalent.toFixed(2)} USD equivalent`,
        );
      }

      const { changeUsd, changeLbp } = computeChange(totalUsd, paid_usd, paid_lbp, rate);

      const saleResult = db
        .prepare(`
          INSERT INTO sales (
            total_usd, total_lbp, exchange_rate_used, paid_usd, paid_lbp,
            change_usd, change_lbp,
            user_id, discount_usd, payment_method, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          totalUsd,
          totalLbp,
          rate,
          paid_usd,
          paid_lbp,
          changeUsd,
          changeLbp,
          userId,
          discount_usd,
          payment_method,
          notes ?? null,
        );

      const newSaleId = Number(saleResult.lastInsertRowid);

      const insertLine = db.prepare(`
        INSERT INTO sale_lines (sale_id, product_id, batch_id, qty, unit_price_usd, line_total_usd)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const line of lineRecords) {
        insertLine.run(
          newSaleId,
          line.product_id,
          line.batch_id,
          line.qty,
          line.unit_price_usd,
          line.line_total_usd,
        );

        db.prepare(`
          INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, reference_id, user_id, notes)
          VALUES (?, ?, 'sale', ?, ?, ?, ?)
        `).run(
          line.product_id,
          line.batch_id,
          -line.qty,
          newSaleId,
          userId,
          `Sale #${newSaleId}`,
        );
      }

      return newSaleId;
    })();

    logAudit({
      userId,
      action: "sale.completed",
      entityType: "sale",
      entityId: saleId,
      details: { payment_method, paid_usd, paid_lbp },
    });

    return res.status(201).json(getSaleDetail(saleId));
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
}

const router = Router();
router.post("/", requireAuth, checkoutHandler);

export default router;
