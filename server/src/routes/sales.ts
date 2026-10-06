import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getSaleDetail } from "../services/saleDetail.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : null;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const sales = date
    ? db
        .prepare(`
          SELECT s.id, s.total_usd, s.total_lbp, s.payment_method, s.created_at, u.username as cashier_name
          FROM sales s
          LEFT JOIN users u ON u.id = s.user_id
          WHERE date(s.created_at) = date(?)
          ORDER BY s.created_at DESC
          LIMIT ?
        `)
        .all(date, limit)
    : db
        .prepare(`
          SELECT s.id, s.total_usd, s.total_lbp, s.payment_method, s.created_at, u.username as cashier_name
          FROM sales s
          LEFT JOIN users u ON u.id = s.user_id
          ORDER BY s.created_at DESC
          LIMIT ?
        `)
        .all(limit);

  return res.json(sales);
});

router.get("/:id", requireAuth, (req, res) => {
  const saleId = Number(req.params.id);
  const sale = db.prepare("SELECT id FROM sales WHERE id = ?").get(saleId);
  if (!sale) {
    return res.status(404).json({ error: "Sale not found" });
  }
  return res.json(getSaleDetail(saleId));
});

export default router;
