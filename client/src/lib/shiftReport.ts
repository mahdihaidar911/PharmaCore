import { formatLbp, formatUsd, parseServerDate, type CashMovement, type CashShift, type ShiftTotals } from "./api";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const row = (label: string, usd: string, lbp: string, strong = false) =>
  `<tr${strong ? ' class="strong"' : ""}><td>${escapeHtml(label)}</td><td>${usd}</td><td>${lbp}</td></tr>`;

/** End-of-shift (Z) report for an 80 mm receipt printer or A4. */
export function buildShiftReportHtml(pharmacyName: string, shift: CashShift, totals: ShiftTotals, movements: CashMovement[]) {
  const fmtDate = (v: string | null) => (v ? parseServerDate(v).toLocaleString() : "—");
  const counted = shift.counted_usd !== null && shift.counted_lbp !== null;
  const varUsd = counted ? (shift.counted_usd ?? 0) - totals.expected_usd : 0;
  const varLbp = counted ? (shift.counted_lbp ?? 0) - totals.expected_lbp : 0;
  const signed = (n: number, f: (x: number) => string) => (n > 0 ? `+${f(n)}` : n < 0 ? `−${f(-n)}` : f(0));
  const minus = (n: number, f: (x: number) => string) => (n ? `−${f(n)}` : f(0));

  return `<!doctype html><html><head><meta charset="utf-8"><title>Shift #${shift.id}</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 12px; max-width: 80mm; margin: 0 auto; padding: 8px; color: #000; }
  h1 { font-size: 15px; margin: 0 0 2px; text-align: center; }
  p { margin: 2px 0; }
  .center { text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 2px 0; vertical-align: top; }
  td:nth-child(2), td:nth-child(3) { text-align: right; white-space: nowrap; padding-left: 6px; }
  tr.strong td { font-weight: 700; border-top: 1px solid #000; }
  th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; }
  th:nth-child(2), th:nth-child(3) { text-align: right; }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
  @media print { @page { margin: 4mm; } }
</style></head><body>
  <h1>${escapeHtml(pharmacyName)}</h1>
  <p class="center"><strong>Shift report #${shift.id}</strong></p>
  <hr>
  <p>Opened: ${fmtDate(shift.opened_at)} — ${escapeHtml(shift.opened_by_name ?? "")}</p>
  <p>Closed: ${fmtDate(shift.closed_at)}${shift.closed_by_name ? ` — ${escapeHtml(shift.closed_by_name)}` : ""}</p>
  <p>Sales: ${totals.sale_count} (card: ${totals.card_sale_count}) · Net sales ${formatUsd(totals.net_sales_usd)}</p>
  <table>
    <tr><th>Drawer</th><th>USD</th><th>LBP</th></tr>
    ${row("Opening float", formatUsd(shift.opening_usd), formatLbp(shift.opening_lbp))}
    ${row("Cash sales (after change)", formatUsd(totals.cash_sales_usd), formatLbp(totals.cash_sales_lbp))}
    ${row("Refunds", minus(totals.refunds_usd, formatUsd), minus(totals.refunds_lbp, formatLbp))}
    ${row("Pay-ins", formatUsd(totals.pay_in_usd), formatLbp(totals.pay_in_lbp))}
    ${row("Pay-outs", minus(totals.pay_out_usd, formatUsd), minus(totals.pay_out_lbp, formatLbp))}
    ${row("Expected in drawer", formatUsd(totals.expected_usd), formatLbp(totals.expected_lbp), true)}
    ${counted ? row("Counted", formatUsd(shift.counted_usd ?? 0), formatLbp(shift.counted_lbp ?? 0)) : ""}
    ${counted ? row("Difference", signed(varUsd, formatUsd), signed(varLbp, formatLbp), true) : ""}
  </table>
  ${
    movements.length
      ? `<hr><p><strong>Pay-ins / pay-outs</strong></p><table>${movements
          .map((m) =>
            row(
              `${m.type === "pay_in" ? "In" : "Out"}: ${m.reason}`,
              m.amount_usd ? formatUsd(m.amount_usd) : "",
              m.amount_lbp ? formatLbp(m.amount_lbp) : "",
            ),
          )
          .join("")}</table>`
      : ""
  }
  ${shift.notes ? `<hr><p>Notes: ${escapeHtml(shift.notes)}</p>` : ""}
  <hr><p class="center">Printed ${new Date().toLocaleString()}</p>
</body></html>`;
}

export function printShiftReport(...args: Parameters<typeof buildShiftReportHtml>) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildShiftReportHtml(...args));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}
