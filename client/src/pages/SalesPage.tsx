import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox } from "../components/PageShell";
import { ProductName } from "../components/ProductName";
import { printReceipt } from "../components/Receipt";
import { Alert, EmptyState, Spinner, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, formatLbp, formatUsd, localToday, parseServerDate, type SaleDetail, type SaleSummary } from "../lib/api";

const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", mixed: "Mixed" };
const time = (iso: string) => parseServerDate(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

function Line({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-0.5 ${strong ? "font-semibold text-ink" : "text-ink-2"}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function SalesPage() {
  const canReturn = useAuth().can("returns.create");
  const [date, setDate] = useState(localToday());
  const [sales, setSales] = useState<SaleSummary[] | null>(null);
  const [selected, setSelected] = useState<SaleDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSales(null);
    setSelected(null);
    api
      .getSales(date)
      .then(setSales)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sales"));
  }, [date]);

  async function viewSale(id: number) {
    try {
      setSelected(await api.getSale(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sale");
    }
  }

  const dayTotal = (sales ?? []).reduce((s, x) => s + x.total_usd, 0);
  const isToday = date === localToday();

  return (
    <PageShell
      title="Sales history"
      description="Every invoice for a day. Open one to reprint the receipt or start a return."
      actions={
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
            <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
          </button>
          <input type="date" aria-label="Date" className="input w-auto" value={date} max={localToday()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Next day" disabled={isToday} onClick={() => setDate(shiftDate(date, 1))}>
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
          {!isToday ? (
            <button type="button" className="btn btn-ghost" onClick={() => setDate(localToday())}>
              Today
            </button>
          ) : null}
        </div>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
        <div className="sheet flex min-h-64 flex-col overflow-hidden">
          <div className="flex shrink-0 items-baseline justify-between border-b border-rule px-4 py-2 text-dense">
            <span className="kicker">Invoices</span>
            {sales ? (
              <span className="text-ink-2">
                {sales.length} · <span className="font-medium text-ink">{formatUsd(dayTotal)}</span>
              </span>
            ) : null}
          </div>
          <ScrollBox className="min-h-0 flex-1">
            {!sales ? <Spinner className="p-4" /> : null}
            {sales && sales.length === 0 ? <EmptyState title="No sales on this day." /> : null}
            {sales && sales.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Time</th>
                    <th className="hidden sm:table-cell">Cashier</th>
                    <th>Paid by</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const active = selected?.sale.id === sale.id;
                    return (
                      <tr
                        key={sale.id}
                        className={`cursor-pointer ${active ? "[&>td]:bg-lime-200/70" : ""}`}
                        onClick={() => viewSale(sale.id)}
                      >
                        <td>
                          <button type="button" className="code font-medium text-ink hover:underline" onClick={(e) => (e.stopPropagation(), viewSale(sale.id))} aria-pressed={active}>
                            #{sale.id}
                          </button>
                        </td>
                        <td className="code text-ink-2">{time(sale.created_at)}</td>
                        <td className="hidden text-ink-2 sm:table-cell">{sale.cashier_name ?? "—"}</td>
                        <td className="text-ink-2">{METHOD_LABEL[sale.payment_method] ?? sale.payment_method}</td>
                        <td className="num font-medium">{formatUsd(sale.total_usd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </ScrollBox>
        </div>

        <div className="sheet flex min-h-64 flex-col overflow-hidden">
          {selected ? (
            <>
              <ScrollBox className="min-h-0 flex-1 px-5 pt-4">
                <p className="meta">
                  {parseServerDate(selected.sale.created_at).toLocaleString()} · {selected.sale.cashier_name ?? "—"}
                </p>
                <h2 className="font-serif text-title font-semibold">
                  Invoice <span className="font-mono text-xl">#{selected.sale.id}</span>
                </h2>
                <table className="data-table mt-3">
                  <thead>
                    <tr>
                      <th className="!pl-0">Item</th>
                      <th className="num">Qty</th>
                      <th className="num !pr-0">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="w-full max-w-0 !pl-0">
                          <ProductName name={line.product_name} />
                          {line.qty_returned > 0 ? (
                            <Status tone="caution" icon="returns" className="text-xs">
                              {line.qty_returned} returned
                            </Status>
                          ) : null}
                        </td>
                        <td className="num">
                          {line.qty} <span className="text-ink-3">× {formatUsd(line.unit_price_usd)}</span>
                        </td>
                        <td className="num !pr-0 font-medium">{formatUsd(line.line_total_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 ml-auto max-w-xs text-dense">
                  {selected.sale.discount_usd > 0 ? <Line label="Discount">−{formatUsd(selected.sale.discount_usd)}</Line> : null}
                  <div className="border-t-2 border-ink pt-1">
                    <Line label="Total" strong>
                      {formatUsd(selected.sale.total_usd)}
                    </Line>
                  </div>
                  <Line label="In LBP">{formatLbp(selected.sale.total_lbp)}</Line>
                  <Line label={`Paid · ${METHOD_LABEL[selected.sale.payment_method] ?? selected.sale.payment_method}`}>
                    {[selected.sale.paid_usd > 0 ? formatUsd(selected.sale.paid_usd) : null, selected.sale.paid_lbp > 0 ? formatLbp(selected.sale.paid_lbp) : null].filter(Boolean).join(" + ") || "—"}
                  </Line>
                  {(selected.sale.change_usd ?? 0) > 0 || (selected.sale.change_lbp ?? 0) > 0 ? (
                    <Line label="Change given">
                      {[(selected.sale.change_usd ?? 0) > 0 ? formatUsd(selected.sale.change_usd ?? 0) : null, (selected.sale.change_lbp ?? 0) > 0 ? formatLbp(selected.sale.change_lbp ?? 0) : null]
                        .filter(Boolean)
                        .join(" + ")}
                    </Line>
                  ) : null}
                  <Line label="Rate">1 USD = {selected.sale.exchange_rate_used.toLocaleString()} LBP</Line>
                </div>
              </ScrollBox>
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-rule bg-paper px-5 py-3">
                <button type="button" onClick={() => printReceipt(selected)} className="btn btn-primary">
                  <Icon name="printer" className="h-4 w-4" /> Print receipt
                </button>
                {canReturn ? (
                  <Link to={`/returns?sale=${selected.sale.id}`} className="btn btn-secondary">
                    <Icon name="returns" className="h-4 w-4" /> Return items
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState title="No invoice selected." description="Choose an invoice on the left to see its lines, payment and change." />
          )}
        </div>
      </div>
    </PageShell>
  );
}
