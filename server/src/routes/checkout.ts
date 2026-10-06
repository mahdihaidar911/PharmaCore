import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { completeSale } from "../services/checkout.js";
import { BusinessError } from "../services/errors.js";
import { getSaleDetail } from "../services/saleDetail.js";

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().int().positive().max(10_000),
        unit_price_usd: z.number().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(200),
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

  try {
    const saleId = completeSale(parsed.data, { userId: req.user!.userId, role: req.user!.role });
    return res.status(201).json(getSaleDetail(saleId));
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
}

const router = Router();
router.post("/", requireAuth, requirePermission("pos.sell"), checkoutHandler);

export default router;
