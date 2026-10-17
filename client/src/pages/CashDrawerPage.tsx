import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { Alert, Badge, EmptyState, FigureRow, Field, Modal, Spinner, StatCard, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import {
  api,
  formatLbp,
  formatUsd,
  parseServerDate,
  type CashMovement,
  type CashShift,
  type CurrentShift,
  type ShiftCloseResult,
  type ShiftHistoryItem,
  type ShiftTotals,
} from "../lib/api";
import { notifyDrawerChanged } from "../lib/shellEvents";
import { printShiftReport } from "../lib/shiftReport";

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
const validAmount = (v: string) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0);
const fmtTime = (v: string | null) => (v ? parseServerDate(v).toLocaleString() : "—");

function varianceTone(usd: number | null, lbp: number | null) {
  if (usd === null || lbp === null) return "neutral" as const;
  return Math.abs(usd) < 0.01 && Math.abs(lbp) < 1000 ? ("success" as const) : ("warning" as const);
}

function signed(n: number, format: (x: number) => string) {
  if (n > 0) return `+${format(n)}`;
  if (n < 0) return `−${format(-n)}`;
  return format(0);
}

function AmountInputs({
  usd,
  lbp,
  onUsd,
  onLbp,
  usdLabel = "USD",
  lbpLabel = "LBP",
}: {
  usd: string;
  lbp: string;
  onUsd: (v: string) => void;
  onLbp: (v: string) => void;
  usdLabel?: string;
  lbpLabel?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={usdLabel} error={validAmount(usd) ? null : "Enter a positive amount"}>
        <input type="number" min={0} step="0.01" inputMode="decimal" className="input text-lg tabular-nums" value={usd} onChange={(e) => onUsd(e.target.value)} />
      </Field>
      <Field label={lbpLabel} error={validAmount(lbp) ? null : "Enter a positive amount"}>
        <input type="number" min={0} step="1000" inputMode="numeric" className="input text-lg tabular-nums" value={lbp} onChange={(e) => onLbp(e.target.value)} />
      </Field>
    </div>
  );
}

function Breakdown({ shift, totals }: { shift: CashShift; totals: ShiftTotals }) {
  const rows: [string, number, number, boolean?][] = [
    ["Opening float", shift.opening_usd, shift.opening_lbp],
    ["Cash sales (after change)", totals.cash_sales_usd, totals.cash_sales_lbp],
    ["Refunds", -totals.refunds_usd, -totals.refunds_lbp],
    ["Pay-ins", totals.pay_in_usd, totals.pay_in_lbp],
    ["Pay-outs", -totals.pay_out_usd, -totals.pay_out_lbp],
    ["Expected in drawer", totals.expected_usd, totals.expected_lbp, true],
  ];
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Drawer</th>
          <th className="text-right">USD</th>
          <th className="text-right">LBP</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, usd, lbp, strong]) => (
          <tr key={label} className={strong ? "font-semibold" : ""}>
            <td>{label}</td>
            <td className="text-right tabular-nums">{formatUsd(usd || 0)}</td>
            <td className="text-right tabular-nums">{formatLbp(lbp || 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MovementsList({ movements }: { movements: CashMovement[] }) {
  if (movements.length === 0) return <p className="text-sm text-fg-3">No pay-ins or pay-outs.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {movements.map((m) => (
        <li key={m.id} className="flex items-start justify-between gap-3 py-2">
          <div>
            <Badge tone={m.type === "pay_in" ? "success" : "warning"}>{m.type === "pay_in" ? "Pay-in" : "Pay-out"}</Badge>{" "}
            <span className="text-fg">{m.reason}</span>
            <p className="text-xs text-fg-3">
              {fmtTime(m.created_at)} · {m.username}
            </p>
          </div>
          <div className="text-right tabular-nums">
            {m.amount_usd ? <p>{formatUsd(m.amount_usd)}</p> : null}
            {m.amount_lbp ? <p>{formatLbp(m.amount_lbp)}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function CashDrawerPage() {
  const { can } = useAuth();
  const { settings } = useSettings();
  const canReconcile = can("cash.reconcile");
  const pharmacyName = settings?.name?.trim() || "PharmaCore Pharmacy";

  const [current, setCurrent] = useState<CurrentShift | null>(null);
  const [history, setHistory] = useState<ShiftHistoryItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [openUsd, setOpenUsd] = useState("");
  const [openLbp, setOpenLbp] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveType, setMoveType] = useState<"pay_in" | "pay_out">("pay_out");
  const [moveUsd, setMoveUsd] = useState("");
  const [moveLbp, setMoveLbp] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveError, setMoveError] = useState("");

  const [closeOpen, setCloseOpen] = useState(false);
  const [countUsd, setCountUsd] = useState("");
  const [countLbp, setCountLbp] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeError, setCloseError] = useState("");
  const [closeResult, setCloseResult] = useState<(ShiftCloseResult & { movements: CashMovement[] }) | null>(null);

  const [detail, setDetail] = useState<{ shift: CashShift; totals: ShiftTotals; movements: CashMovement[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const [cur, hist] = await Promise.all([
        api.getCurrentShift(),
        canReconcile ? api.listShifts(30) : Promise.resolve({ shifts: [] as ShiftHistoryItem[] }),
      ]);
      setCurrent(cur);
      setHistory(hist.shifts);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the cash drawer");
    }
  }, [canReconcile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleOpen(event: FormEvent) {
    event.preventDefault();
    if (!validAmount(openUsd) || !validAmount(openLbp)) return;
    setBusy(true);
    try {
      await api.openShift({ opening_usd: num(openUsd), opening_lbp: num(openLbp) });
      setOpenUsd("");
      setOpenLbp("");
      notifyDrawerChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the shift");
    } finally {
      setBusy(false);
    }
  }

  async function handleMovement(event: FormEvent) {
    event.preventDefault();
    if (!current?.shift) return;
    if (!validAmount(moveUsd) || !validAmount(moveLbp)) return;
    if (num(moveUsd) <= 0 && num(moveLbp) <= 0) {
      setMoveError("Enter an amount in USD and/or LBP.");
      return;
    }
    if (moveReason.trim().length < 3) {
      setMoveError("Give a reason, e.g. “Supplier delivery” or “Float top-up”.");
      return;
    }
    setBusy(true);
    try {
      await api.addCashMovement(current.shift.id, { type: moveType, amount_usd: num(moveUsd), amount_lbp: num(moveLbp), reason: moveReason.trim() });
      setMoveOpen(false);
      setMoveUsd("");
      setMoveLbp("");
      setMoveReason("");
      await load();
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Could not record the movement");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(event: FormEvent) {
    event.preventDefault();
    if (!current?.shift) return;
    if (countUsd.trim() === "" || countLbp.trim() === "" || !validAmount(countUsd) || !validAmount(countLbp)) {
      setCloseError("Count both currencies and enter the totals (0 if none).");
      return;
    }
    setBusy(true);
    try {
      const result = await api.closeShift(current.shift.id, { counted_usd: num(countUsd), counted_lbp: num(countLbp), notes: closeNotes.trim() || undefined });
      setCloseOpen(false);
      setCountUsd("");
      setCountLbp("");
      setCloseNotes("");
      setCloseResult({ ...result, movements });
      notifyDrawerChanged();
      await load();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "Could not close the shift");
    } finally {
      setBusy(false);
    }
  }

  async function showDetail(id: number) {
    try {
      setDetail(await api.getShiftDetail(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the shift");
    }
  }

  const shift = current?.shift ?? null;
  const totals = current && current.shift ? current.totals : null;
  const movements = current && current.shift ? current.movements : [];

  return (
    <PageShell
      title="Cash drawer"
      description="Open the drawer with the starting float, record cash taken out or added, and count the drawer at the end of the shift."
    >
      <ScrollBox className="min-h-0 flex-1">
        <div className="flex max-w-5xl flex-col gap-5 pb-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {current === null ? <Spinner /> : null}

          {current && !shift ? (
            <form onSubmit={handleOpen} className="sheet max-w-2xl space-y-4 px-4 pt-3 pb-4">
              <SectionHead title="Open the drawer" action={<Status tone="caution" icon="alert">Drawer closed</Status>} />
              <p className="text-dense text-fg-2">Count the starting float in the drawer and open a shift. Sales and refunds are blocked until a shift is open.</p>
              <AmountInputs usd={openUsd} lbp={openLbp} onUsd={setOpenUsd} onLbp={setOpenLbp} usdLabel="Opening float (USD)" lbpLabel="Opening float (LBP)" />
              <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !validAmount(openUsd) || !validAmount(openLbp)}>
                {busy ? "Opening…" : "Open shift"}
              </button>
            </form>
          ) : null}

          {shift ? (
            <>
              <div className="flex flex-col gap-3 border-t border-line-strong pt-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-lg font-semibold tracking-[-0.01em] text-fg">
                      Shift <span className="font-mono text-lg">#{shift.id}</span>
                    </h2>
                    <Status tone="ok">Open</Status>
                  </div>
                  <p className="mt-1 text-dense text-fg-3">
                    Opened {fmtTime(shift.opened_at)} by {shift.opened_by_name} · Float {formatUsd(shift.opening_usd)} + {formatLbp(shift.opening_lbp)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setMoveError("");
                      setMoveOpen(true);
                    }}
                  >
                    Pay in / pay out
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setCloseError("");
                      setCloseOpen(true);
                    }}
                  >
                    Count &amp; close shift
                  </button>
                </div>
              </div>

              {totals ? (
                <FigureRow>
                  <StatCard label="Expected USD in drawer" value={formatUsd(totals.expected_usd)} />
                  <StatCard label="Expected LBP in drawer" value={formatLbp(totals.expected_lbp)} />
                  <StatCard label="Sales this shift" value={totals.sale_count} hint={`${totals.card_sale_count} by card`} />
                  <StatCard label="Net sales" value={formatUsd(totals.net_sales_usd)} hint="After refunds, all payment types" />
                </FigureRow>
              ) : (
                <Alert tone="info">At closing you will count the drawer without seeing the expected amount. A pharmacist or the owner reviews any difference.</Alert>
              )}

              <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
                {totals ? (
                  <section className="sheet px-4 pt-3 pb-2">
                    <SectionHead title="Where the cash came from" />
                    <Breakdown shift={shift} totals={totals} />
                  </section>
                ) : null}
                <section className="sheet px-4 pt-3 pb-2">
                  <SectionHead title="Pay-ins and pay-outs" count={movements.length} />
                  <MovementsList movements={movements} />
                </section>
              </div>
            </>
          ) : null}

          {canReconcile ? (
            <section className="sheet px-4 pt-3 pb-2">
              <SectionHead title="Recent shifts" count={history.length} />
              {history.length === 0 ? (
                <EmptyState title="No shifts yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Shift</th>
                        <th>Opened</th>
                        <th>Closed</th>
                        <th className="text-right">Sales</th>
                        <th className="text-right">Expected</th>
                        <th className="text-right">Counted</th>
                        <th className="text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="cursor-pointer hover:bg-canvas" onClick={() => showDetail(h.id)}>
                          <td>
                            <button
                              type="button"
                              className="font-mono font-medium text-accent-text underline-offset-2 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void showDetail(h.id);
                              }}
                            >
                              #{h.id}
                            </button>
                          </td>
                          <td>
                            {fmtTime(h.opened_at)}
                            <p className="text-xs text-fg-3">{h.opened_by_name}</p>
                          </td>
                          <td>
                            {h.status === "open" ? <Status tone="ok">Open</Status> : fmtTime(h.closed_at)}
                            {h.closed_by_name ? <p className="text-xs text-fg-3">{h.closed_by_name}</p> : null}
                          </td>
                          <td className="text-right tabular-nums">{h.totals.sale_count}</td>
                          <td className="text-right tabular-nums">
                            {formatUsd(h.totals.expected_usd)}
                            <p className="text-xs text-fg-3">{formatLbp(h.totals.expected_lbp)}</p>
                          </td>
                          <td className="text-right tabular-nums">
                            {h.counted_usd === null ? "—" : formatUsd(h.counted_usd)}
                            {h.counted_lbp === null ? null : <p className="text-xs text-fg-3">{formatLbp(h.counted_lbp)}</p>}
                          </td>
                          <td className="text-right">
                            {h.variance_usd === null || h.variance_lbp === null ? (
                              "—"
                            ) : (
                              varianceTone(h.variance_usd, h.variance_lbp) === "success" ? (
                                <Status tone="ok">Balanced</Status>
                              ) : (
                                <span className="inline-flex flex-col items-end">
                                  <Status tone="caution" icon="alert">
                                    {signed(h.variance_usd, formatUsd)}
                                  </Status>
                                  <span className="text-xs text-fg-3">{signed(h.variance_lbp, formatLbp)}</span>
                                </span>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </ScrollBox>

      <Modal
        open={moveOpen}
        title="Pay in / pay out"
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setMoveOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="cash-move-form" className="btn btn-primary" disabled={busy}>
              Record
            </button>
          </>
        }
      >
        <form id="cash-move-form" onSubmit={handleMovement} className="space-y-4">
          <div className="segmented">
            <button type="button" aria-pressed={moveType === "pay_out"} className={`tab ${moveType === "pay_out" ? "tab-active" : ""}`} onClick={() => setMoveType("pay_out")}>
              Pay-out (cash taken)
            </button>
            <button type="button" aria-pressed={moveType === "pay_in"} className={`tab ${moveType === "pay_in" ? "tab-active" : ""}`} onClick={() => setMoveType("pay_in")}>
              Pay-in (cash added)
            </button>
          </div>
          <AmountInputs usd={moveUsd} lbp={moveLbp} onUsd={setMoveUsd} onLbp={setMoveLbp} />
          <Field label="Reason" hint="Recorded in the audit log and on the shift report.">
            <input className="input" maxLength={200} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder="e.g. Supplier delivery, change from bank" />
          </Field>
          {moveError ? <Alert tone="error">{moveError}</Alert> : null}
        </form>
      </Modal>

      <Modal
        open={closeOpen}
        title="Count & close shift"
        onClose={() => setCloseOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCloseOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="close-shift-form" className="btn btn-primary" disabled={busy}>
              {busy ? "Closing…" : "Close shift"}
            </button>
          </>
        }
      >
        <form id="close-shift-form" onSubmit={handleClose} className="space-y-4">
          <p className="text-sm text-fg-2">Count all cash in the drawer, including the float, and enter the totals per currency.</p>
          <AmountInputs usd={countUsd} lbp={countLbp} onUsd={setCountUsd} onLbp={setCountLbp} usdLabel="Counted USD" lbpLabel="Counted LBP" />
          <Field label="Notes (optional)">
            <input className="input" maxLength={500} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
          </Field>
          {closeError ? <Alert tone="error">{closeError}</Alert> : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(closeResult)}
        title={closeResult ? `Shift #${closeResult.shift.id} closed` : ""}
        onClose={() => setCloseResult(null)}
        footer={
          <>
            {closeResult?.totals ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => closeResult.totals && printShiftReport(pharmacyName, closeResult.shift, closeResult.totals, closeResult.movements)}
              >
                Print report
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => setCloseResult(null)}>
              Done
            </button>
          </>
        }
      >
        {closeResult?.variance && closeResult.totals ? (
          <div className="space-y-3">
            <Alert tone={varianceTone(closeResult.variance.usd, closeResult.variance.lbp) === "success" ? "success" : "warning"} title="Difference (counted − expected)">
              {signed(closeResult.variance.usd, formatUsd)} and {signed(closeResult.variance.lbp, formatLbp)}
            </Alert>
            <Breakdown shift={closeResult.shift} totals={closeResult.totals} />
          </div>
        ) : (
          <p className="text-sm text-fg-2">Your count was recorded. A pharmacist or the owner will review the shift.</p>
        )}
      </Modal>

      <Modal
        open={Boolean(detail)}
        size="lg"
        title={detail ? `Shift #${detail.shift.id}` : ""}
        onClose={() => setDetail(null)}
        footer={
          detail ? (
            <button type="button" className="btn btn-secondary" onClick={() => printShiftReport(pharmacyName, detail.shift, detail.totals, detail.movements)}>
              Print report
            </button>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-2">
              {fmtTime(detail.shift.opened_at)} ({detail.shift.opened_by_name}) → {detail.shift.status === "open" ? "still open" : `${fmtTime(detail.shift.closed_at)} (${detail.shift.closed_by_name})`}
              <br />
              {detail.totals.sale_count} sales ({detail.totals.card_sale_count} by card) · net {formatUsd(detail.totals.net_sales_usd)}
            </p>
            <Breakdown shift={detail.shift} totals={detail.totals} />
            {detail.shift.counted_usd !== null && detail.shift.counted_lbp !== null ? (
              <p className="text-sm">
                Counted {formatUsd(detail.shift.counted_usd)} + {formatLbp(detail.shift.counted_lbp)} · difference{" "}
                <strong>
                  {signed(detail.shift.counted_usd - detail.totals.expected_usd, formatUsd)} / {signed(detail.shift.counted_lbp - detail.totals.expected_lbp, formatLbp)}
                </strong>
              </p>
            ) : null}
            <div>
              <h4 className="mb-1 font-medium text-fg">Pay-ins and pay-outs</h4>
              <MovementsList movements={detail.movements} />
            </div>
            {detail.shift.notes ? <p className="text-sm text-fg-2">Notes: {detail.shift.notes}</p> : null}
          </div>
        ) : null}
      </Modal>
    </PageShell>
  );
}
