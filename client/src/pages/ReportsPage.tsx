import { useEffect, useState, type ReactNode } from "react";
import { PageShell, ScrollBox } from "../components/PageShell";
import { Alert, EmptyState, Spinner, StatCard } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  api,
  formatLbp,
  formatUsd,
  localToday,
  parseServerDate,
  type DailyRevenueReport,
  type DashboardReport,
  type MovementsReport,
  type ProfitReport,
  type SalesSummary,
  type TopProductsReport,
} from "../lib/api";
import { downloadCsv } from "../lib/csv";

const PRESETS = [
  { label: "Today", from: () => localToday(), to: () => localToday() },
  { label: "7 days", from: () => localToday(-6), to: () => localToday() },
  { label: "30 days", from: () => localToday(-29), to: () => localToday() },
  { label: "This month", from: () => `${localToday().slice(0, 8)}01`, to: () => localToday() },
];

const MOVEMENT_LABEL: Record<string, string> = { receive: "Received", sale: "Sale", return: "Return", adjustment: "Adjustment" };

type Data = {
  summary?: SalesSummary;
  top?: TopProductsReport;
  daily?: DailyRevenueReport;
  profit?: ProfitReport;
  stock?: DashboardReport;
  movements?: MovementsReport;
};

export default function ReportsPage() {
  const { can } = useAuth();
  const [from, setFrom] = useState(localToday(-6));
  const [to, setTo] = useState(localToday());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const showSales = can("reports.sales");
  const showProfit = can("reports.profit");

  useEffect(() => {
    if (from > to) {
      setError("The start date must be before the end date.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      showSales ? api.getSalesSummary(from, to) : undefined,
      showSales ? api.getTopProducts(from, to) : undefined,
      showSales ? api.getDailyRevenue(from, to) : undefined,
      showProfit ? api.getProfit(from, to) : undefined,
      api.getDashboardReport(),
      can("inventory.view") ? api.getMovements({ from, to, limit: 200 }) : undefined,
    ])
      .then(([summary, top, daily, profit, stock, movements]) => {
        if (!cancelled) setData({ summary, top, daily, profit, stock, movements });
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load reports"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to, showSales, showProfit, can]);

  const maxDaily = Math.max(1, ...(data?.daily?.days.map((d) => d.net_revenue_usd) ?? [1]));

  return (
    <PageShell
      title="Reports"
      description="Sales, stock alerts and stock movements for a date range. Revenue is after discounts."
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg bg-slate-200/70 p-1">
            {PRESETS.map((p) => {
              const active = from === p.from() && to === p.to();
              return (
                <button key={p.label} type="button" className={`tab ${active ? "tab-active" : ""}`} onClick={() => (setFrom(p.from()), setTo(p.to()))}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <input type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <input type="date" className="input w-auto" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ScrollBox className="min-h-0 flex-1">
        {loading && !data ? <Spinner className="p-4" /> : null}
        {data ? (
          <div className={`space-y-4 pb-2 ${loading ? "opacity-60" : ""}`}>
            {data.summary ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Net revenue" value={formatUsd(data.summary.net_revenue_usd)} hint={formatLbp(data.summary.net_revenue_lbp)} />
                <StatCard label="Sales" value={data.summary.sale_count} hint={`Average ${formatUsd(data.summary.average_sale_usd)}`} />
                <StatCard label="Units sold" value={data.summary.units_sold} hint={`${data.summary.distinct_products_sold} different products`} />
                <StatCard
                  label="Refunds"
                  value={formatUsd(data.summary.refunds_usd)}
                  hint={`${data.summary.return_count} return(s) · discounts ${formatUsd(data.summary.discounts_usd)}`}
                  tone={data.summary.refunds_usd > 0 ? "warning" : "neutral"}
                />
              </div>
            ) : (
              <Alert tone="info">Your role can see stock reports only. Sales and revenue figures are restricted to pharmacists and owners.</Alert>
            )}

            {data.profit ? (
              <Section title="Profit (owner only)">
                <div className="grid gap-3 p-4 sm:grid-cols-3">
                  <StatCard label="Gross profit" value={formatUsd(data.profit.gross_profit_usd)} hint={data.profit.gross_margin_percent !== null ? `${data.profit.gross_margin_percent}% margin` : "No cost data"} />
                  <StatCard label="Cost of goods" value={formatUsd(data.profit.cost_of_goods_usd)} />
                  <StatCard
                    label="Cost coverage"
                    value={data.profit.cost_coverage_percent !== null ? `${data.profit.cost_coverage_percent}%` : "—"}
                    hint="Share of units sold with a recorded purchase cost"
                    tone={data.profit.cost_coverage_percent !== null && data.profit.cost_coverage_percent < 80 ? "warning" : "neutral"}
                  />
                </div>
              </Section>
            ) : null}

            {data.daily && data.daily.days.length > 1 ? (
              <Section title="Daily revenue">
                <div className="flex h-40 items-end gap-1 overflow-x-auto px-4 pt-4 pb-2">
                  {data.daily.days.map((d) => (
                    <div key={d.date} className="flex min-w-6 flex-1 flex-col items-center gap-1" title={`${d.date}: ${formatUsd(d.net_revenue_usd)} · ${d.sale_count} sales`}>
                      <div className="w-full rounded-t bg-brand-600" style={{ height: `${Math.max(2, (d.net_revenue_usd / maxDaily) * 120)}px` }} />
                      <span className="text-[10px] text-slate-500">{d.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              {data.top ? (
                <TableSection
                  title="Top products"
                  headers={["Product", "Units", "Returned", "Revenue", "In stock"]}
                  rows={data.top.products.map((p) => [p.name, p.units_sold, p.units_returned, formatUsd(p.net_revenue_usd), p.current_stock])}
                  csvName={`top-products-${from}-${to}.csv`}
                />
              ) : null}
              {data.summary ? (
                <TableSection
                  title="Sales by cashier"
                  headers={["Cashier", "Sales", "Revenue"]}
                  rows={data.summary.by_cashier.map((c) => [c.cashier, c.sale_count, formatUsd(c.net_revenue_usd)])}
                  csvName={`sales-by-cashier-${from}-${to}.csv`}
                />
              ) : null}
              {data.stock ? (
                <>
                  <TableSection
                    title={`Low stock (${data.stock.lowStockTotal})`}
                    headers={["Product", "Qty", "Min"]}
                    rows={data.stock.lowStock.map((p) => [p.name, p.total_qty, p.min_stock])}
                    csvName="low-stock.csv"
                  />
                  <TableSection
                    title={`Expired & expiring within 90 days (${data.stock.expiredTotal + data.stock.nearExpiryTotal})`}
                    headers={["Product", "Qty", "Expiry"]}
                    rows={[...data.stock.expired, ...data.stock.nearExpiry].map((b) => [b.product_name, b.qty, b.expiry_date])}
                    csvName="expiry.csv"
                  />
                </>
              ) : null}
            </div>

            {data.movements ? (
              <TableSection
                title="Stock movements"
                subtitle={data.movements.totals_by_type.map((t) => `${MOVEMENT_LABEL[t.movement_type] ?? t.movement_type}: ${t.net_units > 0 ? "+" : ""}${t.net_units}`).join(" · ")}
                headers={["Date", "Type", "Product", "Qty", "Reason / note", "User"]}
                rows={data.movements.movements.map((m) => [
                  parseServerDate(m.created_at).toLocaleString(),
                  MOVEMENT_LABEL[m.movement_type] ?? m.movement_type,
                  m.product_name,
                  m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change,
                  [m.reason?.replace("_", " "), m.notes].filter(Boolean).join(" — "),
                  m.username ?? "",
                ])}
                csvName={`stock-movements-${from}-${to}.csv`}
              />
            ) : null}
          </div>
        ) : null}
      </ScrollBox>
    </PageShell>
  );
}

function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div>
          <h3 className="card-title">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const isNumericColumn = (rows: (string | number)[][], index: number) =>
  rows.length > 0 && rows.every((row) => typeof row[index] === "number" || /^[+-]?\$?[\d,.]+$/.test(String(row[index])));

function TableSection({
  title,
  subtitle,
  headers,
  rows,
  csvName,
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  csvName: string;
}) {
  return (
    <Section
      title={title}
      subtitle={subtitle}
      action={
        rows.length ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadCsv(csvName, headers, rows)}>
            Export CSV
          </button>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No data for this period" />
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={h} className={isNumericColumn(rows, i) ? "text-right" : ""}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={isNumericColumn(rows, j) ? "text-right tabular-nums" : ""}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
