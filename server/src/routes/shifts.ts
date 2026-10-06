import { Router, type Response } from "express";
import { z } from "zod";
import { can, requireAuth, requirePermission } from "../middleware/auth.js";
import { BusinessError } from "../services/errors.js";
import {
  addCashMovement,
  closeShift,
  computeShiftTotals,
  getOpenShift,
  getShift,
  listCashMovements,
  listShifts,
  openShift,
} from "../services/shifts.js";

const router = Router();
router.use(requireAuth);

const usd = z.number().nonnegative().max(1_000_000);
const lbp = z.number().nonnegative().max(100_000_000_000);

const openSchema = z.object({ opening_usd: usd, opening_lbp: lbp, notes: z.string().max(500).nullish() });
const movementSchema = z.object({
  type: z.enum(["pay_in", "pay_out"]),
  amount_usd: usd.default(0),
  amount_lbp: lbp.default(0),
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(200),
});
const closeSchema = z.object({ counted_usd: usd, counted_lbp: lbp, notes: z.string().max(500).nullish() });

function fail(res: Response, error: unknown) {
  if (error instanceof BusinessError) return res.status(error.status).json({ error: error.message });
  throw error;
}

function shiftId(raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new BusinessError("Invalid shift id");
  return id;
}

router.get("/current", requirePermission("cash.drawer"), (req, res) => {
  const shift = getOpenShift();
  if (!shift) return res.json({ shift: null });
  const reconcile = can(req, "cash.reconcile");
  return res.json({
    shift,
    movements: listCashMovements(shift.id),
    totals: reconcile ? computeShiftTotals(shift) : null,
  });
});

router.post("/open", requirePermission("cash.drawer"), (req, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    return res.status(201).json({ shift: openShift(parsed.data, req.user!.userId) });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/:id/movements", requirePermission("cash.drawer"), (req, res) => {
  const parsed = movementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const id = addCashMovement(shiftId(req.params.id), parsed.data, req.user!.userId);
    return res.status(201).json({ id });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/:id/close", requirePermission("cash.drawer"), (req, res) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = closeShift(shiftId(req.params.id), parsed.data, req.user!.userId);
    if (can(req, "cash.reconcile")) return res.json(result);
    const { expected_usd: _u, expected_lbp: _l, ...shift } = result.shift;
    return res.json({ shift, totals: null, variance: null });
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/", requirePermission("cash.reconcile"), (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
  return res.json({ shifts: listShifts(limit) });
});

router.get("/:id", requirePermission("cash.reconcile"), (req, res) => {
  try {
    const shift = getShift(shiftId(req.params.id));
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    return res.json({ shift, totals: computeShiftTotals(shift), movements: listCashMovements(shift.id) });
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
