import { Router } from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { checkoutHandler } from "./checkout.js";
import { normalizeSearchQuery, searchProductsForPos, toPosProduct } from "../services/productSearch.js";

const router = Router();

router.get("/search", requireAuth, requirePermission("pos.sell"), (req, res) => {
  const raw = typeof req.query.q === "string" ? req.query.q : "";
  const q = normalizeSearchQuery(raw);

  const products = searchProductsForPos(q, 50).map(toPosProduct);
  return res.json(products);
});

router.post("/checkout", requireAuth, requirePermission("pos.sell"), checkoutHandler);

export default router;
