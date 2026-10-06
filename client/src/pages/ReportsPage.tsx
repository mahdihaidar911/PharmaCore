import { useEffect, useState } from "react";
import { PageShell, ScrollBox } from "../components/PageShell";
import { api, formatLbp, formatUsd, type DashboardReport } from "../lib/api";

export default function ReportsPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getDashboardReport(date)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"));
  }, [date]);

  return (
    <PageShell
      title="Reports"
      description="Daily sales, stock alerts, and top products."
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

      <ScrollBox className="min-h-0 flex-1">
      {report ? (
        <div className="space-y-4 pb-2">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Sales count" value={String(report.salesToday.sale_count)} />
            <StatCard label="Revenue (USD)" value={formatUsd(report.salesToday.total_usd)} />
            <StatCard label="Revenue (LBP)" value={formatLbp(report.salesToday.total_lbp)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable
              title="Sales by cashier"
              headers={["Cashier", "Sales", "USD"]}
              rows={report.salesByCashier.map((row) => [
                row.username ?? "—",
                String(row.sale_count),
                formatUsd(row.total_usd),
              ])}
            />
            <ReportTable
              title="Top products"
              headers={["Product", "Qty", "USD"]}
              rows={report.topProducts.map((row) => [row.name, String(row.qty_sold), formatUsd(row.revenue_usd)])}
            />
            <ReportTable
              title="Low stock"
              headers={["Product", "Qty", "Min"]}
              rows={report.lowStock.map((row) => [row.name, String(row.total_qty), String(row.min_stock)])}
            />
            <ReportTable
              title="Near expiry (90 days)"
              headers={["Product", "Qty", "Expiry"]}
              rows={report.nearExpiry.map((row) => [row.product_name, String(row.qty), row.expiry_date])}
            />
            <ReportTable
              title="Expired in stock"
              headers={["Product", "Qty", "Expiry"]}
              rows={report.expired.map((row) => [row.product_name, String(row.qty), row.expiry_date])}
            />
          </div>
        </div>
      ) : null}
      </ScrollBox>
    </PageShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ReportTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <table className="mt-3 min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            {headers.map((h) => (
              <th key={h} className="pb-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">No data.</p> : null}
    </section>
  );
}
