import { db } from "../db/index.js";
import { logAudit } from "./audit.js";
import { BusinessError, roundMoney } from "./errors.js";

export type ShiftRow = {
  id: number;
  status: "open" | "closed";
  opened_by: number;
  opened_at: string;
  opening_usd: number;
  opening_lbp: number;
  closed_by: number | null;
  closed_at: string | null;
  expected_usd: number | null;
  expected_lbp: number | null;
  counted_usd: number | null;
  counted_lbp: number | null;
  notes: string | null;
};

export type ShiftTotals = {
  sale_count: number;
  card_sale_count: number;
  net_sales_usd: number;
  cash_sales_usd: number;
  cash_sales_lbp: number;
  refunds_usd: number;
  refunds_lbp: number;
  pay_in_usd: number;
  pay_in_lbp: number;
  pay_out_usd: number;
  pay_out_lbp: number;
  expected_usd: number;
  expected_lbp: number;
};

export type CashMovementRow = {
  id: number;
  shift_id: number;
  user_id: number;
  username: string | null;
  type: "pay_in" | "pay_out";
  amount_usd: number;
  amount_lbp: number;
  reason: string;
  created_at: string;
};

const SHIFT_SELECT = `
  SELECT cs.*, ou.username AS opened_by_name, cu.username AS closed_by_name
  FROM cash_shifts cs
  LEFT JOIN users ou ON ou.id = cs.opened_by
  LEFT JOIN users cu ON cu.id = cs.closed_by
`;

export type ShiftWithNames = ShiftRow & { opened_by_name: string | null; closed_by_name: string | null };

export function getOpenShift(): ShiftWithNames | undefined {
  return db.prepare(`${SHIFT_SELECT} WHERE cs.status = 'open'`).get() as ShiftWithNames | undefined;
}

export function getShift(id: number): ShiftWithNames | undefined {
  return db.prepare(`${SHIFT_SELECT} WHERE cs.id = ?`).get(id) as ShiftWithNames | undefined;
}

/** Sales and refunds must belong to an open shift so the drawer can be reconciled. */
export function requireOpenShiftId(): number {
  const shift = db.prepare("SELECT id FROM cash_shifts WHERE status = 'open'").get() as { id: number } | undefined;
  if (!shift) {
    throw new BusinessError("The cash drawer is closed. Open a shift (Cash drawer) before selling or refunding.", 409);
  }
  return shift.id;
}

/**
 * Expected drawer contents per currency. Card sales add nothing; cash and mixed sales add what was
 * received minus the change given back in each currency (change may be returned in the other currency).
 */
export function computeShiftTotals(shift: ShiftRow): ShiftTotals {
  const sales = db
    .prepare(`
      SELECT
        COUNT(*) AS sale_count,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN 1 ELSE 0 END), 0) AS card_sale_count,
        COALESCE(SUM(total_usd), 0) AS gross_usd,
        COALESCE(SUM(CASE WHEN payment_method != 'card' THEN paid_usd - change_usd ELSE 0 END), 0) AS cash_usd,
        COALESCE(SUM(CASE WHEN payment_method != 'card' THEN paid_lbp - change_lbp ELSE 0 END), 0) AS cash_lbp
      FROM sales WHERE shift_id = ?
    `)
    .get(shift.id) as { sale_count: number; card_sale_count: number; gross_usd: number; cash_usd: number; cash_lbp: number };

  const refunds = db
    .prepare(`
      SELECT COALESCE(SUM(refund_usd), 0) AS usd, COALESCE(SUM(refund_lbp), 0) AS lbp,
             COALESCE(SUM(refund_usd + refund_lbp / exchange_rate_used), 0) AS usd_equivalent
      FROM returns WHERE shift_id = ?
    `)
    .get(shift.id) as { usd: number; lbp: number; usd_equivalent: number };

  const moves = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'pay_in' THEN amount_usd ELSE 0 END), 0) AS in_usd,
        COALESCE(SUM(CASE WHEN type = 'pay_in' THEN amount_lbp ELSE 0 END), 0) AS in_lbp,
        COALESCE(SUM(CASE WHEN type = 'pay_out' THEN amount_usd ELSE 0 END), 0) AS out_usd,
        COALESCE(SUM(CASE WHEN type = 'pay_out' THEN amount_lbp ELSE 0 END), 0) AS out_lbp
      FROM cash_movements WHERE shift_id = ?
    `)
    .get(shift.id) as { in_usd: number; in_lbp: number; out_usd: number; out_lbp: number };

  return {
    sale_count: sales.sale_count,
    card_sale_count: sales.card_sale_count,
    net_sales_usd: roundMoney(sales.gross_usd - refunds.usd_equivalent),
    cash_sales_usd: roundMoney(sales.cash_usd),
    cash_sales_lbp: Math.round(sales.cash_lbp),
    refunds_usd: roundMoney(refunds.usd),
    refunds_lbp: Math.round(refunds.lbp),
    pay_in_usd: roundMoney(moves.in_usd),
    pay_in_lbp: Math.round(moves.in_lbp),
    pay_out_usd: roundMoney(moves.out_usd),
    pay_out_lbp: Math.round(moves.out_lbp),
    expected_usd: roundMoney(shift.opening_usd + sales.cash_usd - refunds.usd + moves.in_usd - moves.out_usd),
    expected_lbp: Math.round(shift.opening_lbp + sales.cash_lbp - refunds.lbp + moves.in_lbp - moves.out_lbp),
  };
}

export function listCashMovements(shiftId: number): CashMovementRow[] {
  return db
    .prepare(`
      SELECT cm.*, u.username FROM cash_movements cm LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.shift_id = ? ORDER BY cm.id
    `)
    .all(shiftId) as CashMovementRow[];
}

export function openShift(input: { opening_usd: number; opening_lbp: number; notes?: string | null }, userId: number) {
  if (getOpenShift()) {
    throw new BusinessError("A shift is already open. Close it before opening a new one.", 409);
  }
  const result = db
    .prepare("INSERT INTO cash_shifts (opened_by, opening_usd, opening_lbp, notes) VALUES (?, ?, ?, ?)")
    .run(userId, roundMoney(input.opening_usd), Math.round(input.opening_lbp), input.notes?.trim() || null);
  const id = Number(result.lastInsertRowid);
  logAudit({ userId, action: "shift.opened", entityType: "cash_shift", entityId: id, details: input });
  return getShift(id)!;
}

export function addCashMovement(
  shiftId: number,
  input: { type: "pay_in" | "pay_out"; amount_usd: number; amount_lbp: number; reason: string },
  userId: number,
) {
  const shift = getShift(shiftId);
  if (!shift) throw new BusinessError("Shift not found", 404);
  if (shift.status !== "open") throw new BusinessError("This shift is already closed.", 409);
  if (input.amount_usd <= 0 && input.amount_lbp <= 0) {
    throw new BusinessError("Enter an amount in USD and/or LBP.");
  }
  const result = db
    .prepare("INSERT INTO cash_movements (shift_id, user_id, type, amount_usd, amount_lbp, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .run(shiftId, userId, input.type, roundMoney(input.amount_usd), Math.round(input.amount_lbp), input.reason.trim());
  logAudit({
    userId,
    action: input.type === "pay_in" ? "shift.pay_in" : "shift.pay_out",
    entityType: "cash_shift",
    entityId: shiftId,
    details: input,
  });
  return Number(result.lastInsertRowid);
}

export function closeShift(
  shiftId: number,
  input: { counted_usd: number; counted_lbp: number; notes?: string | null },
  userId: number,
) {
  return db.transaction(() => {
    const shift = getShift(shiftId);
    if (!shift) throw new BusinessError("Shift not found", 404);
    if (shift.status !== "open") throw new BusinessError("This shift is already closed.", 409);

    const totals = computeShiftTotals(shift);
    const notes = [shift.notes, input.notes?.trim()].filter(Boolean).join("\n") || null;
    db.prepare(`
      UPDATE cash_shifts
      SET status = 'closed', closed_by = ?, closed_at = datetime('now'),
          expected_usd = ?, expected_lbp = ?, counted_usd = ?, counted_lbp = ?, notes = ?
      WHERE id = ?
    `).run(userId, totals.expected_usd, totals.expected_lbp, roundMoney(input.counted_usd), Math.round(input.counted_lbp), notes, shiftId);

    const variance = {
      usd: roundMoney(input.counted_usd - totals.expected_usd),
      lbp: Math.round(input.counted_lbp - totals.expected_lbp),
    };
    logAudit({
      userId,
      action: "shift.closed",
      entityType: "cash_shift",
      entityId: shiftId,
      details: { counted_usd: input.counted_usd, counted_lbp: input.counted_lbp, expected: totals, variance },
    });
    return { shift: getShift(shiftId)!, totals, variance };
  })();
}

export function listShifts(limit = 30) {
  const rows = db.prepare(`${SHIFT_SELECT} ORDER BY cs.id DESC LIMIT ?`).all(limit) as ShiftWithNames[];
  return rows.map((shift) => {
    const totals = computeShiftTotals(shift);
    const closed = shift.status === "closed";
    return {
      ...shift,
      totals,
      variance_usd: closed ? roundMoney((shift.counted_usd ?? 0) - (shift.expected_usd ?? 0)) : null,
      variance_lbp: closed ? Math.round((shift.counted_lbp ?? 0) - (shift.expected_lbp ?? 0)) : null,
    };
  });
}
