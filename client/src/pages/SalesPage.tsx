import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell, Panel, ScrollBox } from "../components/PageShell";
import { printReceipt } from "../components/Receipt";
import { api, formatLbp, formatUsd, localToday, parseServerDate, type SaleDetail, type SaleSummary } from "../lib/api";

export default function SalesPage() {
  const [date, setDate] = useState(localToday());
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [selected, setSelected] = useState<SaleDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getSales(date)
      .then(setSales)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sales"));
  }, [date]);

  async function viewSale(id: number) {
    try {
      const detail = await api.getSale(id);
      setSelected(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sale");
    }
  }

  return (
    <PageShell
      title="Sales history"
      description="View invoices and process returns."
      actions={
        <label className="text-sm">
          Date
          <input
            type="date"
            className="ml-2 rounded-lg border border-slate-300 px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      }
    >
      {error ? <p className="shrink-0 text-sm text-red-600">{error}</p> : null}

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-2">
        <Panel padding={false} className="min-h-0">
          <ScrollBox className="h-full min-h-0">
          {sales.map((sale) => (
            <button
              key={sale.id}
              type="button"
              onClick={() => viewSale(sale.id)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium">Invoice #{sale.id}</p>
                <p className="text-xs text-slate-500">
                  {parseServerDate(sale.created_at).toLocaleString()} · {sale.cashier_name ?? "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatUsd(sale.total_usd)}</p>
                <p className="text-xs capitalize text-slate-500">{sale.payment_method}</p>
              </div>
            </button>
          ))}
          {sales.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No sales for this date.</p> : null}
          </ScrollBox>
        </Panel>

        <Panel className="min-h-0 flex flex-col">
          {selected ? (
            <ScrollBox className="min-h-0 flex-1">
              <h3 className="text-lg font-semibold">Invoice #{selected.sale.id}</h3>
              <p className="mt-1 text-sm text-slate-500">{parseServerDate(selected.sale.created_at).toLocaleString()}</p>
              <p className="mt-3 font-semibold">
                {formatUsd(selected.sale.total_usd)} · {formatLbp(selected.sale.total_lbp)}
              </p>

              <ul className="mt-4 space-y-2 text-sm">
                {selected.lines.map((line) => (
                  <li key={line.id} className="flex justify-between border-b border-slate-100 pb-2">
                    <span>
                      {line.product_name} ({line.qty} sold, {line.qty_returned} returned)
                    </span>
                    <span>{formatUsd(line.line_total_usd)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => printReceipt(selected)}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white"
                >
                  Print receipt
                </button>
                <Link
                  to={`/returns?sale=${selected.sale.id}`}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Return items
                </Link>
              </div>
            </ScrollBox>
          ) : (
            <p className="text-sm text-slate-500">Select an invoice to view details.</p>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
