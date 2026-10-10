import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox } from "../components/PageShell";
import { ProductName } from "../components/ProductName";
import { Alert, EmptyState, Status } from "../components/ui";
import { api, formatLbp, formatUsd, parseServerDate, usdToLbp, type SaleDetail } from "../lib/api";

export default function ReturnsPage() {
  const [searchParams] = useSearchParams();
  const [saleId, setSaleId] = useState(searchParams.get("sale") ?? "");
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [returnQty, setReturnQty] = useState<Record<number, string>>({});
  const [refundUsd, setRefundUsd] = useState("");
  const [refundLbp, setRefundLbp] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const paramSale = searchParams.get("sale");
    if (paramSale) {
      setSaleId(paramSale);
      loadSale(Number(paramSale));
    }
  }, [searchParams]);

  async function loadSale(id?: number) {
    const targetId = id ?? Number(saleId);
    if (!targetId) return;
    setError("");
    try {
      const detail = await api.getSale(targetId);
      setSale(detail);
      const initial: Record<number, string> = {};
      for (const line of detail.lines) {
        initial[line.id] = "0";
      }
      setReturnQty(initial);
    } catch (err) {
      setSale(null);
      setError(err instanceof Error ? err.message : "Sale not found");
    }
  }

  function computeRefundUsd() {
    if (!sale) return 0;
    // Mirrors the server: a sale-level discount is shared proportionally across lines.
    const subtotal = sale.lines.reduce((sum, line) => sum + line.line_total_usd, 0);
    const ratio = subtotal > 0 ? Math.min(1, sale.sale.total_usd / subtotal) : 0;
    const raw = sale.lines.reduce((sum, line) => {
      const qty = Number(returnQty[line.id]) || 0;
      if (qty <= 0) return sum;
      return sum + Math.round((line.line_total_usd / line.qty) * qty * ratio * 100) / 100;
    }, 0);
    return Math.round(raw * 100) / 100;
  }

  const expectedRefund = computeRefundUsd();
  const rate = sale?.sale.exchange_rate_used ?? sale?.settings.exchange_rate ?? 89500;

  function fillRefund(currency: "usd" | "lbp") {
    if (currency === "usd") {
      setRefundUsd(expectedRefund.toFixed(2));
      setRefundLbp("0");
    } else {
      setRefundUsd("0");
      setRefundLbp(String(usdToLbp(expectedRefund, rate)));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sale) return;

    const items = sale.lines
      .map((line) => ({
        sale_line_id: line.id,
        qty: Number(returnQty[line.id]) || 0,
      }))
      .filter((item) => item.qty > 0);

    if (items.length === 0) {
      setError("Select at least one item to return");
      return;
    }

    setError("");
    setMessage("");

    try {
      await api.createReturn({
        sale_id: sale.sale.id,
        items,
        refund_usd: Number(refundUsd) || 0,
        refund_lbp: Number(refundLbp) || 0,
      });
      setMessage("Return processed. Stock restored.");
      await loadSale(sale.sale.id);
      setRefundUsd("");
      setRefundLbp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
    }
  }

  return (
    <PageShell title="Returns" description="Load the invoice, choose what comes back, and record the refund. Returned units go back to their original batch.">
      <div className="flex h-full min-h-0 w-full max-w-4xl flex-col gap-4 overflow-hidden">
        <form
          className="flex shrink-0 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void loadSale();
          }}
        >
          <label className="block">
            <span className="field-label">Invoice number</span>
            <input className="input w-48 font-mono" inputMode="numeric" placeholder="e.g. 1042" value={saleId} onChange={(e) => setSaleId(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-secondary">
            Load invoice
          </button>
        </form>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}

        <ScrollBox className="min-h-0 flex-1">
          {sale ? (
            <form onSubmit={handleSubmit} className="sheet">
              <div className="border-b border-rule px-5 py-3">
                <p className="meta">{parseServerDate(sale.sale.created_at).toLocaleString()}</p>
                <h2 className="font-serif text-xl font-semibold">
                  Invoice <span className="font-mono">#{sale.sale.id}</span>
                  <span className="ml-3 font-sans text-sm font-normal text-ink-2">{formatUsd(sale.sale.total_usd)} paid</span>
                </h2>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Sold</th>
                    <th className="num">Already returned</th>
                    <th className="num">Return now</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.lines.map((line) => {
                    const returnable = line.qty - line.qty_returned;
                    const value = Number(returnQty[line.id] ?? 0);
                    const over = value > returnable;
                    return (
                      <tr key={line.id}>
                        <td className="w-full max-w-0">
                          <ProductName name={line.product_name} />
                        </td>
                        <td className="num">{line.qty}</td>
                        <td className="num text-ink-2">{line.qty_returned}</td>
                        <td className="num">
                          {returnable === 0 ? (
                            <Status tone="muted">All returned</Status>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={returnable}
                                aria-label={`Units of ${line.product_name} to return`}
                                className={`input min-h-8 w-20 py-1 text-right ${over ? "input-invalid" : ""}`}
                                value={returnQty[line.id] ?? "0"}
                                onChange={(e) => setReturnQty({ ...returnQty, [line.id]: e.target.value })}
                                onFocus={(e) => e.currentTarget.select()}
                              />
                              <span className="meta w-12 text-left">of {returnable}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="grid gap-5 px-5 py-4 md:grid-cols-[1fr_1.2fr]">
                <div>
                  <p className="kicker">Refund due</p>
                  <p className="mt-1 font-serif text-3xl font-semibold">{formatUsd(expectedRefund)}</p>
                  <p className="font-mono text-dense text-ink-2">{formatLbp(usdToLbp(expectedRefund, rate))}</p>
                  <p className="meta mt-1">Includes the invoice discount share. Rate of the original sale.</p>
                </div>
                <div className="space-y-2">
                  {(["usd", "lbp"] as const).map((cur) => (
                    <div key={cur} className="flex items-stretch">
                      <label htmlFor={`refund-${cur}`} className="flex w-14 shrink-0 items-center justify-center rounded-l-sm border border-r-0 border-line-input bg-paper-2 font-mono text-xs font-medium text-ink-2">
                        {cur.toUpperCase()}
                      </label>
                      <input
                        id={`refund-${cur}`}
                        type="number"
                        min={0}
                        step={cur === "usd" ? "0.01" : "1"}
                        placeholder="0"
                        className="input rounded-none text-right"
                        value={cur === "usd" ? refundUsd : refundLbp}
                        onChange={(e) => (cur === "usd" ? setRefundUsd(e.target.value) : setRefundLbp(e.target.value))}
                      />
                      <button type="button" onClick={() => fillRefund(cur)} disabled={expectedRefund <= 0} className="btn btn-secondary shrink-0 rounded-l-none border-l-0 text-dense">
                        All in {cur.toUpperCase()}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end border-t border-rule bg-paper px-5 py-3">
                <button type="submit" className="btn btn-primary" disabled={expectedRefund <= 0}>
                  <Icon name="returns" className="h-4 w-4" /> Process return
                </button>
              </div>
            </form>
          ) : (
            <EmptyState title="No invoice loaded." description="Type the invoice number from the receipt, or open the invoice from Sales history and choose “Return items”." />
          )}
        </ScrollBox>
      </div>
    </PageShell>
  );
}
