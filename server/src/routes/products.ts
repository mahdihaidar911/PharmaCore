import { Router } from "express";
import { z } from "zod";
import { db, type ProductRow } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePageQuery, paginatedResponse } from "../services/pagination.js";
import {
  countSearchProducts,
  normalizeSearchQuery,
  searchProductsPage,
} from "../services/productSearch.js";

const barcodePatchSchema = z.object({
  barcode: z.string().max(64),
});

const router = Router();

const productSchema = z.object({
  barcode: z.string().max(64).nullable().optional(),
  name: z.string().min(1).max(300),
  category: z.string().max(100).nullable().optional(),
  sale_price_usd: z.number().nonnegative(),
  is_active: z.boolean().optional(),
});

function withStock(product: ProductRow) {
  const stock = db
    .prepare("SELECT COALESCE(SUM(qty), 0) as total_qty FROM stock_batches WHERE product_id = ?")
    .get(product.id) as { total_qty: number };

  return {
    ...product,
    is_active: Boolean(product.is_active),
    total_qty: stock.total_qty,
  };
}

router.get("/", requireAuth, (req, res) => {
  const search = normalizeSearchQuery(typeof req.query.search === "string" ? req.query.search : "");
  const activeOnly = req.query.active !== "false";
  const { page, pageSize, offset } = parsePageQuery(req.query as Record<string, unknown>);

  if (search) {
    const total = countSearchProducts(search, activeOnly);
    const found = searchProductsPage(search, page, pageSize, activeOnly);
    return res.json(
      paginatedResponse(
        found.map((product) => ({
          ...product,
          is_active: Boolean(product.is_active),
          total_qty: Number(product.total_qty) || 0,
        })),
        total,
        page,
        pageSize,
      ),
    );
  }

  const where = activeOnly ? "WHERE is_active = 1" : "";
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM products ${where}`).get() as {
    total: number;
  };
  const products = db
    .prepare(`
      SELECT * FROM products
      ${where}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `)
    .all(pageSize, offset) as ProductRow[];

  return res.json(
    paginatedResponse(products.map(withStock), total, page, pageSize),
  );
});

router.patch("/:id/barcode", requireAuth, (req, res) => {
  const parsed = barcodePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Barcode is required" });
  }

  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  if (!existing) {
    return res.status(404).json({ error: "Product not found" });
  }

  const barcode = normalizeSearchQuery(parsed.data.barcode) || null;
  if (!barcode) {
    return res.status(400).json({ error: "Barcode is required" });
  }

  const clash = db
    .prepare("SELECT id, name FROM products WHERE barcode = ? AND id != ?")
    .get(barcode, id) as { id: number; name: string } | undefined;
  if (clash) {
    return res.status(409).json({
      error: `Barcode already used by "${clash.name}" (#${clash.id})`,
    });
  }

  try {
    db.prepare(
      `UPDATE products SET barcode = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(barcode, id);
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow;
    return res.json(withStock(product));
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: products.barcode")) {
      return res.status(409).json({ error: "A product with this barcode already exists" });
    }
    throw error;
  }
});

router.get("/:id", requireAuth, (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id)) as ProductRow | undefined;
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }
  return res.json(withStock(product));
});

router.post("/", requireAuth, (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { barcode = null, name, category = null, sale_price_usd, is_active = true } = parsed.data;

  try {
    const result = db
      .prepare(`
        INSERT INTO products (barcode, name, category, sale_price_usd, is_active)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(barcode, name, category, sale_price_usd, is_active ? 1 : 0);

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid) as ProductRow;
    return res.status(201).json(withStock(product));
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: products.barcode")) {
      return res.status(409).json({ error: "A product with this barcode already exists" });
    }
    throw error;
  }
});

router.put("/:id", requireAuth, (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(Number(req.params.id));
  if (!existing) {
    return res.status(404).json({ error: "Product not found" });
  }

  const { barcode = null, name, category = null, sale_price_usd, is_active = true } = parsed.data;

  try {
    db.prepare(`
      UPDATE products
      SET barcode = ?, name = ?, category = ?, sale_price_usd = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(barcode, name, category, sale_price_usd, is_active ? 1 : 0, Number(req.params.id));

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id)) as ProductRow;
    return res.json(withStock(product));
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: products.barcode")) {
      return res.status(409).json({ error: "A product with this barcode already exists" });
    }
    throw error;
  }
});

export default router;
