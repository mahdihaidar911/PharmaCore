import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Pagination } from "../components/Pagination";
import { PageShell, Panel, ScrollBox } from "../components/PageShell";
import { api, formatUsd, type StockBatch } from "../lib/api";

const PAGE_SIZE = 50;

export default function InventoryPage() {
  const location = useLocation();
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] = useState({ batch_count: 0, total_qty: 0, product_count: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadBatches = useCallback(
    async (query = search, pageNum = page) => {
      setLoading(true);
      try {
        const result = await api.getBatches({ search: query, page: pageNum, pageSize: PAGE_SIZE });
        setBatches(result.items);
        setTotal(result.total);
        setPage(result.page);
        setTotalPages(result.totalPages);
        setSummary(result.summary);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load inventory");
      } finally {
        setLoading(false);
      }
    },
    [search, page],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBatches(search, page);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, page, location.pathname, loadBatches]);

  return (
    <PageShell
      title="Inventory"
      description="Active batches sorted by expiry (FEFO-ready for POS)."
      actions={
        <button
          type="button"
          onClick={() => loadBatches()}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      }
    >
      {error ? <p className="shrink-0 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <Panel className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-4 text-sm text-slate-600">
            <li>
              <span className="text-slate-500">Batches</span>{" "}
              <strong className="text-slate-900">{summary.batch_count.toLocaleString()}</strong>
            </li>
            <li>
              <span className="text-slate-500">Units in stock</span>{" "}
              <strong className="text-slate-900">{summary.total_qty.toLocaleString()}</strong>
            </li>
            <li>
              <span className="text-slate-500">Products with stock</span>{" "}
              <strong className="text-slate-900">{summary.product_count.toLocaleString()}</strong>
            </li>
          </ul>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search product, barcode, MoPH code…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Panel padding={false} className="min-h-0 flex-1">
          <ScrollBox className="h-full min-h-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">MoPH code</th>
                  <th className="px-4 py-3 font-medium">Barcode</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                  <th className="px-4 py-3 font-medium">Sale price</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const daysToExpiry = Math.ceil(
                    (new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                  );
                  const expiryClass =
                    daysToExpiry <= 30
                      ? "text-red-600 font-medium"
                      : daysToExpiry <= 90
                        ? "text-amber-600"
                        : "text-slate-700";

                  return (
                    <tr key={batch.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{batch.product_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{batch.moph_code ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{batch.barcode ?? "—"}</td>
                      <td className="px-4 py-3">{batch.qty}</td>
                      <td className={`px-4 py-3 ${expiryClass}`}>
                        {batch.expiry_date}
                        <span className="ml-2 text-xs">({daysToExpiry}d)</span>
                      </td>
                      <td className="px-4 py-3">{formatUsd(batch.sale_price_usd)}</td>
                      <td className="px-4 py-3 text-slate-600">{batch.received_at}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {batches.length === 0 && !loading ? (
              <p className="px-4 py-6 text-sm text-slate-500">No stock batches yet.</p>
            ) : null}
            {loading ? <p className="px-4 py-6 text-sm text-slate-500">Loading…</p> : null}
          </ScrollBox>
          <div className="px-4 pb-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              disabled={loading}
            />
          </div>
        </Panel>
      </Panel>
    </PageShell>
  );
}
