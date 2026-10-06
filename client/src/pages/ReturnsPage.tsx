import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageShell, ScrollBox } from "../components/PageShell";
import { api, formatLbp, formatUsd, usdToLbp, type SaleDetail } from "../lib/api";

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
    <PageShell title="Returns" description="Find a sale and return items to stock.">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Sale / invoice ID"
          value={saleId}
          onChange={(e) => setSaleId(e.target.value)}
        />
        <button
          type="button"
          onClick={() => loadSale()}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Load
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-teal-700">{message}</p> : null}

      <ScrollBox className="min-h-0 flex-1">
      {sale ? (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold">Invoice #{sale.sale.id}</h3>
          <p className="text-sm text-slate-500">{new Date(sale.sale.created_at).toLocaleString()}</p>

          <div className="mt-4 space-y-3">
            {sale.lines.map((line) => {
              const returnable = line.qty - line.qty_returned;
              return (
                <div key={line.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                  <div>
                    <p className="font-medium">{line.product_name}</p>
                    <p className="text-xs text-slate-500">
                      Sold: {line.qty} · Returned: {line.qty_returned} · Returnable: {returnable}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={returnable}
                    className="w-20 rounded border border-slate-300 px-2 py-1"
                    value={returnQty[line.id] ?? "0"}
                    disabled={returnable === 0}
                    onChange={(e) => setReturnQty({ ...returnQty, [line.id]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-sm">
            Expected refund: <strong>{formatUsd(expectedRefund)}</strong> ({formatLbp(usdToLbp(expectedRefund, rate))})
          </p>

          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => fillRefund("usd")} className="btn btn-secondary btn-sm">
              Refund all in USD
            </button>
            <button type="button" onClick={() => fillRefund("lbp")} className="btn btn-secondary btn-sm">
              Refund all in LBP
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Refund USD
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={refundUsd}
                onChange={(e) => setRefundUsd(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Refund LBP
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={refundLbp}
                onChange={(e) => setRefundLbp(e.target.value)}
              />
            </label>
          </div>

          <button type="submit" className="mt-5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
            Process return
          </button>
        </form>
      ) : null}
      </ScrollBox>
      </div>
    </PageShell>
  );
}
