import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AdjustStockModal } from "../components/AdjustStockModal";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox } from "../components/PageShell";
import { Pagination } from "../components/Pagination";
import { ProductName } from "../components/ProductName";
import { Alert, EmptyState, SearchInput, Spinner, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, formatUsd, parseServerDate, type BatchExpiryFilter, type BatchListResult, type BatchSort, type StockBatch } from "../lib/api";
import { daysUntil, expiryStatus } from "../lib/expiry";

const PAGE_SIZE = 50;

const SORTS: { value: BatchSort; label: string }[] = [
  { value: "expiry", label: "Earliest expiry" },
  { value: "name", label: "Product A–Z" },
  { value: "qty", label: "Largest quantity" },
  { value: "received", label: "Recently received" },
];

const EMPTY_SUMMARY: BatchListResult["summary"] = { batch_count: 0, total_qty: 0, product_count: 0, expired_batches: 0, soon_batches: 0 };

export default function InventoryPage() {
  const location = useLocation();
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [search, setSearch] = useState("");
  const [expiry, setExpiry] = useState<BatchExpiryFilter>("all");
  const [sort, setSort] = useState<BatchSort>("expiry");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adjusting, setAdjusting] = useState<StockBatch | null>(null);
  const canAdjust = useAuth().can("inventory.adjust");

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getBatches({ search, page, pageSize: PAGE_SIZE, expiry, sort });
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
  }, [search, page, expiry, sort]);

  useEffect(() => {
    const timer = setTimeout(() => void loadBatches(), 250);
    return () => clearTimeout(timer);
  }, [loadBatches, location.pathname]);

  const filters: { value: BatchExpiryFilter; label: string; count: number }[] = [
    { value: "all", label: "All batches", count: summary.batch_count },
    { value: "soon", label: "Expiring ≤ 90 days", count: summary.soon_batches },
    { value: "expired", label: "Expired", count: summary.expired_batches },
  ];

  return (
    <PageShell
      title="Inventory"
      description="Stock on hand, batch by batch. The till always sells the earliest-expiring sellable batch first."
      actions={
        <p className="text-dense text-ink-2">
          <span className="font-medium text-ink">{summary.total_qty.toLocaleString()}</span> units ·{" "}
          <span className="font-medium text-ink">{summary.product_count.toLocaleString()}</span> products ·{" "}
          <span className="font-medium text-ink">{summary.batch_count.toLocaleString()}</span> batches
        </p>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-3">{notice}</Alert> : null}

      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <SearchInput
          label="Search inventory"
          className="w-full sm:w-72"
          placeholder="Product, barcode or MoPH code"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <div className="segmented" role="group" aria-label="Filter by expiry">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={expiry === f.value}
              className={`tab ${expiry === f.value ? "tab-active" : ""}`}
              onClick={() => {
                setExpiry(f.value);
                setPage(1);
              }}
            >
              {f.label} <span className="ml-1 font-mono text-xs opacity-80">{f.count}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-dense text-ink-2">
          Sort
          <select className="input min-h-8 w-auto py-1 text-dense" value={sort} onChange={(e) => (setSort(e.target.value as BatchSort), setPage(1))}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void loadBatches()} className="btn btn-ghost btn-sm btn-icon" aria-label="Refresh" title="Refresh">
          <Icon name="refresh" className="h-4 w-4" />
        </button>
      </div>

      <div className="sheet flex min-h-0 flex-1 flex-col overflow-hidden">
        <ScrollBox className={`min-h-0 flex-1 ${loading ? "opacity-60" : ""}`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="hidden md:table-cell">MoPH</th>
                <th className="hidden lg:table-cell">Barcode</th>
                <th className="num">Qty</th>
                <th>Expiry</th>
                <th className="num hidden sm:table-cell">Price</th>
                <th className="hidden lg:table-cell">Received</th>
                {canAdjust ? (
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const st = expiryStatus(daysUntil(batch.expiry_date));
                return (
                  <tr key={batch.id}>
                    <td className="w-full max-w-0 min-w-56">
                      <ProductName name={batch.product_name} />
                    </td>
                    <td className="code hidden text-ink-2 md:table-cell">{batch.moph_code ?? "—"}</td>
                    <td className="code hidden text-ink-2 lg:table-cell">{batch.barcode ?? "—"}</td>
                    <td className="num font-medium">{batch.qty}</td>
                    <td className="whitespace-nowrap">
                      <span className="code mr-2 text-ink">{batch.expiry_date}</span>
                      <Status tone={st.tone} icon={st.tone === "muted" ? null : undefined} className="text-xs">
                        {st.label}
                      </Status>
                    </td>
                    <td className="num hidden sm:table-cell">{formatUsd(batch.sale_price_usd)}</td>
                    <td className="code hidden whitespace-nowrap text-ink-3 lg:table-cell">{parseServerDate(batch.received_at).toLocaleDateString("en-CA")}</td>
                    {canAdjust ? (
                      <td className="text-right">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjusting(batch)}>
                          Adjust
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {batches.length === 0 && !loading ? (
            <EmptyState
              title={search || expiry !== "all" ? "No batches match these filters." : "No stock yet."}
              description={search || expiry !== "all" ? "Clear the search or choose “All batches”." : "Batches appear here after you receive stock."}
            />
          ) : null}
          {loading && batches.length === 0 ? <Spinner className="p-4" /> : null}
        </ScrollBox>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
      </div>

      {adjusting ? (
        <AdjustStockModal
          batch={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={(message) => {
            setAdjusting(null);
            setNotice(message);
            void loadBatches();
          }}
        />
      ) : null}
    </PageShell>
  );
}
