import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/dashboard", requireAuth, (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);

  const salesToday = db
    .prepare(`
      SELECT
        COUNT(*) as sale_count,
        COALESCE(SUM(total_usd), 0) as total_usd,
        COALESCE(SUM(total_lbp), 0) as total_lbp,
        COALESCE(SUM(paid_usd), 0) as paid_usd,
        COALESCE(SUM(paid_lbp), 0) as paid_lbp
      FROM sales
      WHERE date(created_at) = date(?)
        AND include_in_reports = 1
    `)
    .get(date) as {
    sale_count: number;
    total_usd: number;
    total_lbp: number;
    paid_usd: number;
    paid_lbp: number;
  };

  const salesByCashier = db
    .prepare(`
      SELECT u.username, COUNT(s.id) as sale_count, COALESCE(SUM(s.total_usd), 0) as total_usd
      FROM sales s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE date(s.created_at) = date(?)
        AND s.include_in_reports = 1
      GROUP BY s.user_id, u.username
    `)
    .all(date);

  const lowStock = db
    .prepare(`
      SELECT p.id, p.name, p.barcode, p.min_stock, COALESCE(SUM(sb.qty), 0) as total_qty
      FROM products p
      LEFT JOIN stock_batches sb ON sb.product_id = p.id
      WHERE p.is_active = 1
      GROUP BY p.id
      HAVING total_qty <= p.min_stock
      ORDER BY total_qty ASC
      LIMIT 50
    `)
    .all();

  const nearExpiry = db
    .prepare(`
      SELECT sb.id, sb.qty, sb.expiry_date, p.name as product_name, p.barcode
      FROM stock_batches sb
      JOIN products p ON p.id = sb.product_id
      WHERE sb.qty > 0
        AND date(sb.expiry_date) <= date('now', '+90 days')
        AND date(sb.expiry_date) > date('now')
      ORDER BY sb.expiry_date ASC
      LIMIT 50
    `)
    .all();

  const expired = db
    .prepare(`
      SELECT sb.id, sb.qty, sb.expiry_date, p.name as product_name, p.barcode
      FROM stock_batches sb
      JOIN products p ON p.id = sb.product_id
      WHERE sb.qty > 0 AND date(sb.expiry_date) <= date('now')
      ORDER BY sb.expiry_date ASC
      LIMIT 50
    `)
    .all();

  const topProducts = db
    .prepare(`
      SELECT p.name, SUM(sl.qty) as qty_sold, SUM(sl.line_total_usd) as revenue_usd
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      JOIN products p ON p.id = sl.product_id
      WHERE date(s.created_at) = date(?)
        AND s.include_in_reports = 1
      GROUP BY p.id
      ORDER BY qty_sold DESC
      LIMIT 10
    `)
    .all(date);

  return res.json({
    date,
    salesToday,
    salesByCashier,
    lowStock,
    nearExpiry,
    expired,
    topProducts,
  });
});

export default router;
