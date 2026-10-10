import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { localDateString } from "../services/dates.js";
import { BusinessError } from "../services/errors.js";
import { parsePageQuery, paginatedResponse } from "../services/pagination.js";
import { ADJUSTMENT_REASONS, adjustBatch } from "../services/stock.js";

const router = Router();

const receiveSchema = z.object({
  product_id: z.number().int().positive().optional(),
  product: z
    .object({
      barcode: z.string().max(64).nullable().optional(),
      name: z.string().min(1).max(300),
      category: z.string().max(100).nullable().optional(),
      sale_price_usd: z.number().nonnegative(),
    })
    .optional(),
  qty: z.number().int().positive(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cost_usd: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

router.post("/receive", requireAuth, requirePermission("inventory.receive"), (req, res) => {
  const parsed = receiveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { product_id, product, qty, expiry_date, cost_usd = null, notes = null } = parsed.data;

  if (!product_id && !product) {
    return res.status(400).json({ error: "Provide product_id or product details for a new product" });
  }
  if (expiry_date < localDateString()) {
    return res.status(400).json({ error: `This batch expired on ${expiry_date}. Expired stock cannot be received.` });
  }

  const userId = req.user!.userId;

  const receive = db.transaction(() => {
    let resolvedProductId = product_id;

    if (!resolvedProductId && product) {
      const result = db
        .prepare(`
          INSERT INTO products (barcode, name, category, sale_price_usd, is_active)
          VALUES (?, ?, ?, ?, 1)
        `)
        .run(product.barcode ?? null, product.name, product.category ?? null, product.sale_price_usd);
      resolvedProductId = Number(result.lastInsertRowid);
    }

    if (!resolvedProductId) {
      throw new Error("Product could not be resolved");
    }

    const existingProduct = db.prepare("SELECT id FROM products WHERE id = ?").get(resolvedProductId);
    if (!existingProduct) {
      throw new Error("Product not found");
    }

    const batchResult = db
      .prepare(`
        INSERT INTO stock_batches (product_id, qty, expiry_date, cost_usd, notes)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(resolvedProductId, qty, expiry_date, cost_usd, notes);

    const batchId = Number(batchResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, reference_id, user_id, notes)
      VALUES (?, ?, 'receive', ?, ?, ?, ?)
    `).run(resolvedProductId, batchId, qty, batchId, userId, notes);

    return { product_id: resolvedProductId, batch_id: batchId };
  });

  try {
    const result = receive();
    logAudit({
      userId,
      action: "stock.received",
      entityType: "batch",
      entityId: result.batch_id,
      details: { product_id: result.product_id, qty },
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Product not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes("UNIQUE constraint failed: products.barcode")) {
        return res.status(409).json({ error: "A product with this barcode already exists" });
      }
    }
    throw error;
  }
});

const adjustSchema = z.object({
  batch_id: z.number().int().positive(),
  qty_change: z
    .number()
    .int()
    .refine((n) => n !== 0, "Quantity change cannot be zero"),
  reason: z.enum(ADJUSTMENT_REASONS),
  notes: z.string().trim().max(500).nullable().optional(),
});

router.post("/adjust", requireAuth, requirePermission("inventory.adjust"), (req, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  const { batch_id, qty_change, reason, notes } = parsed.data;
  if (reason === "other" && !notes) {
    return res.status(400).json({ error: "Please describe the reason in the notes" });
  }

  try {
    const result = adjustBatch({ batchId: batch_id, qtyChange: qty_change, reason, notes: notes || null, userId: req.user!.userId });
    logAudit({
      userId: req.user!.userId,
      action: "stock.adjusted",
      entityType: "batch",
      entityId: batch_id,
      details: { qty_change, reason, notes: notes || null, new_qty: result.qty },
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
});

/** Whitelisted SQL fragments for the batch list; never interpolate request values directly. */
const BATCH_EXPIRY_FILTERS = {
  all: "",
  expired: " AND sb.expiry_date < date('now', 'localtime')",
  soon: " AND sb.expiry_date >= date('now', 'localtime') AND sb.expiry_date <= date('now', 'localtime', '+90 days')",
} as const;

const BATCH_SORTS = {
  expiry: "sb.expiry_date ASC, p.name COLLATE NOCASE ASC",
  name: "p.name COLLATE NOCASE ASC, sb.expiry_date ASC",
  qty: "sb.qty DESC, sb.expiry_date ASC",
  received: "sb.received_at DESC, sb.id DESC",
} as const;

function pickKey<T extends object>(table: T, value: unknown, fallback: keyof T): keyof T {
  return typeof value === "string" && Object.hasOwn(table, value) ? (value as keyof T) : fallback;
}

router.get("/batches", requireAuth, requirePermission("inventory.view"), (req, res) => {
  const productId = req.query.product_id ? Number(req.query.product_id) : null;
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const { page, pageSize, offset } = parsePageQuery(req.query as Record<string, unknown>);

  if (productId) {
    const batches = db
      .prepare(`
        SELECT sb.*, p.name as product_name, p.barcode, p.sale_price_usd
        FROM stock_batches sb
        JOIN products p ON p.id = sb.product_id
        WHERE sb.product_id = ? AND sb.qty > 0
        ORDER BY sb.expiry_date ASC
      `)
      .all(productId);
    return res.json(
      paginatedResponse(batches, batches.length, 1, batches.length || 1),
    );
  }

  const searchClause = search
    ? ` AND (
        LOWER(p.name) LIKE '%' || ? || '%'
        OR LOWER(IFNULL(p.barcode, '')) LIKE '%' || ? || '%'
        OR LOWER(IFNULL(p.moph_code, '')) LIKE '%' || ? || '%'
      )`
    : "";
  const searchParams = search ? [search, search, search] : [];
  const expiry = pickKey(BATCH_EXPIRY_FILTERS, req.query.expiry, "all");
  const expiryClause = BATCH_EXPIRY_FILTERS[expiry];
  const orderBy = BATCH_SORTS[pickKey(BATCH_SORTS, req.query.sort, "expiry")];

  const summary = db
    .prepare(
      `
      SELECT
        COUNT(*) AS batch_count,
        COALESCE(SUM(sb.qty), 0) AS total_qty,
        COUNT(DISTINCT sb.product_id) AS product_count,
        COALESCE(SUM(CASE WHEN 1=1${BATCH_EXPIRY_FILTERS.expired} THEN 1 ELSE 0 END), 0) AS expired_batches,
        COALESCE(SUM(CASE WHEN 1=1${BATCH_EXPIRY_FILTERS.soon} THEN 1 ELSE 0 END), 0) AS soon_batches
      FROM stock_batches sb
      JOIN products p ON p.id = sb.product_id
      WHERE sb.qty > 0${searchClause}
    `,
    )
    .get(...searchParams) as { batch_count: number; total_qty: number; product_count: number; expired_batches: number; soon_batches: number };

  const { total } = db
    .prepare(
      `
      SELECT COUNT(*) AS total
      FROM stock_batches sb
      JOIN products p ON p.id = sb.product_id
      WHERE sb.qty > 0${searchClause}${expiryClause}
    `,
    )
    .get(...searchParams) as { total: number };

  const batches = db
    .prepare(
      `
      SELECT sb.*, p.name as product_name, p.barcode, p.sale_price_usd, p.moph_code
      FROM stock_batches sb
      JOIN products p ON p.id = sb.product_id
      WHERE sb.qty > 0${searchClause}${expiryClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `,
    )
    .all(...searchParams, pageSize, offset);

  return res.json({
    ...paginatedResponse(batches, total, page, pageSize),
    summary: {
      batch_count: summary.batch_count,
      total_qty: summary.total_qty,
      product_count: summary.product_count,
      expired_batches: summary.expired_batches,
      soon_batches: summary.soon_batches,
    },
  });
});

export default router;
