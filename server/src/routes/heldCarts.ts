import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { can, requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { SELLABLE_QTY_SQL } from "../services/stock.js";

const MAX_HELD = 30;

const router = Router();
router.use(requireAuth, requirePermission("pos.sell"));

const holdSchema = z.object({
  label: z.string().trim().max(60).nullish(),
  items: z
    .array(z.object({ product_id: z.number().int().positive(), qty: z.number().int().positive().max(10_000) }))
    .min(1)
    .max(200),
  discount_usd: z.number().nonnegative().default(0),
});

type HeldRow = {
  id: number;
  user_id: number;
  username: string | null;
  label: string | null;
  items: string;
  discount_usd: number;
  created_at: string;
};

type StoredItem = { product_id: number; qty: number };

/** Re-reads name, price and stock so a resumed cart reflects the catalog now, not when it was held. */
function hydrate(row: HeldRow) {
  const stored = JSON.parse(row.items) as StoredItem[];
  const lookup = db.prepare(`
    SELECT p.id, p.name, p.barcode, p.sale_price_usd, p.is_active,
           ${SELLABLE_QTY_SQL} AS total_qty
    FROM products p WHERE p.id = ?
  `);
  const items = stored.map((item) => {
    const product = lookup.get(item.product_id) as
      | { id: number; name: string; barcode: string | null; sale_price_usd: number; is_active: number; total_qty: number }
      | undefined;
    return {
      product_id: item.product_id,
      qty: item.qty,
      name: product?.name ?? `Product #${item.product_id}`,
      barcode: product?.barcode ?? null,
      sale_price_usd: product?.sale_price_usd ?? 0,
      total_qty: product?.total_qty ?? 0,
      available: Boolean(product?.is_active) && (product?.total_qty ?? 0) >= item.qty,
    };
  });
  return {
    id: row.id,
    label: row.label,
    held_by: row.username,
    discount_usd: row.discount_usd,
    created_at: row.created_at,
    items,
    subtotal_usd: items.reduce((sum, i) => sum + i.sale_price_usd * i.qty, 0),
  };
}

const SELECT_HELD = `SELECT h.*, u.username FROM held_carts h LEFT JOIN users u ON u.id = h.user_id`;

router.get("/", (_req, res) => {
  const rows = db.prepare(`${SELECT_HELD} ORDER BY h.id`).all() as HeldRow[];
  return res.json(rows.map(hydrate));
});

router.post("/", (req, res) => {
  const parsed = holdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { count } = db.prepare("SELECT COUNT(*) AS count FROM held_carts").get() as { count: number };
  if (count >= MAX_HELD) {
    return res.status(409).json({ error: `Too many held sales (${MAX_HELD}). Resume or discard some first.` });
  }

  const merged = new Map<number, number>();
  for (const item of parsed.data.items) merged.set(item.product_id, (merged.get(item.product_id) ?? 0) + item.qty);
  const ids = [...merged.keys()];
  const found = db
    .prepare(`SELECT COUNT(*) AS n FROM products WHERE id IN (${ids.map(() => "?").join(",")})`)
    .get(...ids) as { n: number };
  if (found.n !== ids.length) return res.status(400).json({ error: "One or more products no longer exist" });

  const discount = can(req, "pos.discount") ? parsed.data.discount_usd : 0;
  const items = [...merged].map(([product_id, qty]) => ({ product_id, qty }));
  const result = db
    .prepare("INSERT INTO held_carts (user_id, label, items, discount_usd) VALUES (?, ?, ?, ?)")
    .run(req.user!.userId, parsed.data.label || null, JSON.stringify(items), discount);

  const row = db.prepare(`${SELECT_HELD} WHERE h.id = ?`).get(result.lastInsertRowid) as HeldRow;
  return res.status(201).json(hydrate(row));
});

/** Returns the cart and removes it in one step so two people cannot resume the same sale. */
router.post("/:id/resume", (req, res) => {
  const id = Number(req.params.id);
  const cart = db.transaction(() => {
    const row = db.prepare(`${SELECT_HELD} WHERE h.id = ?`).get(id) as HeldRow | undefined;
    if (!row) return null;
    db.prepare("DELETE FROM held_carts WHERE id = ?").run(id);
    return hydrate(row);
  })();
  if (!cart) return res.status(404).json({ error: "Held sale not found (it may have been resumed already)" });
  return res.json(cart);
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM held_carts WHERE id = ?").get(id) as HeldRow | undefined;
  if (!row) return res.status(404).json({ error: "Held sale not found" });
  db.prepare("DELETE FROM held_carts WHERE id = ?").run(id);
  logAudit({ userId: req.user!.userId, action: "held_cart.discarded", entityType: "held_cart", entityId: id, details: { label: row.label, items: JSON.parse(row.items) } });
  return res.status(204).end();
});

export default router;
