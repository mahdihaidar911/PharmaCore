import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { ProductName } from "../components/ProductName";
import { RevenueChart } from "../components/RevenueChart";
import { Alert, EmptyState, FigureRow, Spinner, StatCard, Status } from "../components/ui";
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
import { daysUntil, expiryStatus } from "../lib/expiry";

const PRESETS = [
  { label: "Today", from: () => localToday(), to: () => localToday() },
  { label: "7 days", from: () => localToday(-6), to: () => localToday() },
  { label: "30 days", from: () => localToday(-29), to: () => localToday() },
  { label: "This month", from: () => `${localToday().slice(0, 8)}01`, to: () => localToday() },
];

const MOVEMENT_LABEL: Record<string, string> = { receive: "Received", sale: "Sale", return: "Return", adjustment: "Adjustment" };
const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", mixed: "Mixed cash (USD + LBP)" };

type Data = {
  summary?: SalesSummary;
  top?: TopProductsReport;
  daily?: DailyRevenueReport;
  profit?: ProfitReport;
  stock?: DashboardReport;
  movements?: MovementsReport;
};

function ExportButton({ name, headers, rows }: { name: string; headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return null;
  return (
    <button type="button" className="btn btn-ghost btn-sm print:hidden" onClick={() => downloadCsv(name, headers, rows)}>
      <Icon name="download" className="h-3.5 w-3.5" /> CSV
    </button>
  );
}

function Question({
  id,
  title,
  count,
  action,
  children,
  className = "",
  bare = false,
}: {
  id: string;
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** For content that is already a framed strip (figure rows): no card around it. */
  bare?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={`break-inside-avoid ${bare ? "" : "sheet px-4 pt-3 pb-2"} ${className}`.trim()}>
      <SectionHead id={id} title={title} count={count} action={action} />
      <div className={`mt-2 ${bare ? "" : "overflow-x-auto"}`}>{children}</div>
    </section>
  );
}

/** A proportional bar inside a table cell: the number is always printed beside it. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <span className="meter meter-ok h-1.5" aria-hidden>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

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

  const days = data?.summary?.period.days ?? Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
  const methodTotal = data?.summary?.by_payment_method.reduce((s, m) => s + m.net_revenue_usd, 0) ?? 0;

  return (
    <PageShell
      title="Reports"
      description={`${from === to ? from : `${from} to ${to}`} · revenue is after discounts`}
      actions={
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="segmented" role="group" aria-label="Period">
            {PRESETS.map((p) => {
              const active = from === p.from() && to === p.to();
              return (
                <button key={p.label} type="button" aria-pressed={active} className={`tab ${active ? "tab-active" : ""}`} onClick={() => (setFrom(p.from()), setTo(p.to()))}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <input type="date" className="input min-h-8 w-auto py-1 text-dense" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span className="text-fg-3">–</span>
          <input type="date" className="input min-h-8 w-auto py-1 text-dense" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <Icon name="printer" className="h-4 w-4" /> Print
          </button>
        </div>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <ScrollBox className="min-h-0 flex-1">
        {loading && !data ? <Spinner className="p-4" /> : null}
        {data ? (
          <div className={`space-y-5 pb-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {data.summary ? (
              <Question id="r-sold" title="How much did we sell?" bare>
                <FigureRow>
                  <StatCard label="Net revenue" value={formatUsd(data.summary.net_revenue_usd)} hint={formatLbp(data.summary.net_revenue_lbp)} />
                  <StatCard label="Sales" value={data.summary.sale_count} hint={`Average ${formatUsd(data.summary.average_sale_usd)} per sale`} />
                  <StatCard label="Units sold" value={data.summary.units_sold} hint={`${data.summary.distinct_products_sold} different products`} />
                  <StatCard
                    label="Refunds"
                    value={formatUsd(data.summary.refunds_usd)}
                    hint={`${data.summary.return_count} return(s) · discounts given ${formatUsd(data.summary.discounts_usd)}`}
                    tone={data.summary.refunds_usd > 0 ? "warning" : "neutral"}
                  />
                </FigureRow>
              </Question>
            ) : (
              <Alert tone="info">Your role sees stock reports only. Sales and revenue figures are for pharmacists and owners.</Alert>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
              {data.summary ? (
                <Question id="r-method" title="How did customers pay?">
                  {data.summary.by_payment_method.length === 0 ? (
                    <EmptyState title="No sales in this period." />
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="!pl-0">Method</th>
                          <th className="num">Sales</th>
                          <th className="w-1/3">Share of revenue</th>
                          <th className="num !pr-0">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.summary.by_payment_method.map((m) => (
                          <tr key={m.payment_method}>
                            <td className="!pl-0 font-medium">{METHOD_LABEL[m.payment_method] ?? m.payment_method}</td>
                            <td className="num">{m.sale_count}</td>
                            <td>
                              <span className="flex items-center gap-2">
                                <Bar value={m.net_revenue_usd} max={methodTotal} />
                                <span className="w-10 text-right text-xs text-fg-2">{methodTotal > 0 ? Math.round((m.net_revenue_usd / methodTotal) * 100) : 0}%</span>
                              </span>
                            </td>
                            <td className="num !pr-0 font-medium">{formatUsd(m.net_revenue_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Question>
              ) : null}

              {data.daily && data.daily.days.length > 1 ? (
                <Question
                  id="r-daily"
                  title="How did each day go?"
                  className="xl:order-first xl:col-span-2"
                  action={<ExportButton name={`daily-${from}-${to}.csv`} headers={["Date", "Sales", "Revenue USD"]} rows={data.daily.days.map((d) => [d.date, d.sale_count, d.net_revenue_usd])} />}
                >
                  <div className="pb-2">
                    <RevenueChart days={data.daily.days} today={localToday()} />
                  </div>
                </Question>
              ) : null}

              {data.top ? (
                <Question
                  id="r-fast"
                  title="What sells fastest?"
                  className="xl:order-1 xl:col-span-2"
                  action={
                    <ExportButton
                      name={`top-products-${from}-${to}.csv`}
                      headers={["Product", "Units sold", "Units returned", "Revenue USD", "In stock"]}
                      rows={data.top.products.map((p) => [p.name, p.units_sold, p.units_returned, p.net_revenue_usd, p.current_stock])}
                    />
                  }
                >
                  {data.top.products.length === 0 ? (
                    <EmptyState title="No sales in this period." />
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="!pl-0">Product</th>
                          <th className="num">Units</th>
                          <th className="num">Per day</th>
                          <th className="num hidden md:table-cell">Returned</th>
                          <th className="num">Revenue</th>
                          <th className="num">In stock</th>
                          <th className="num !pr-0" title="In stock ÷ units sold per day in this period">
                            Days of cover
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.top.products.map((p) => {
                          const perDay = p.units_sold / days;
                          const cover = perDay > 0 ? p.current_stock / perDay : null;
                          return (
                            <tr key={p.product_id}>
                              <td className="w-full max-w-0 !pl-0">
                                <ProductName name={p.name} inline className="block truncate" />
                              </td>
                              <td className="num font-medium">{p.units_sold}</td>
                              <td className="num text-fg-2">{perDay.toFixed(perDay < 10 ? 1 : 0)}</td>
                              <td className={`num hidden md:table-cell ${p.units_returned ? "" : "text-fg-4"}`}>{p.units_returned}</td>
                              <td className="num">{formatUsd(p.net_revenue_usd)}</td>
                              <td className="num">{p.current_stock}</td>
                              <td className="num !pr-0">
                                {cover === null ? (
                                  "—"
                                ) : cover < 7 ? (
                                  <Status tone={cover < 1 ? "danger" : "caution"} icon="alert">
                                    {cover < 1 ? "< 1 day" : `${Math.floor(cover)} days`}
                                  </Status>
                                ) : (
                                  `${Math.round(cover)} days`
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </Question>
              ) : null}

              {data.profit ? (
                <Question id="r-profit" title="What did we earn?" count="owner only" bare className="xl:order-1 xl:col-span-2">
                  <FigureRow columns={3}>
                    <StatCard
                      label="Gross profit"
                      value={formatUsd(data.profit.gross_profit_usd)}
                      hint={data.profit.gross_margin_percent !== null ? `${data.profit.gross_margin_percent}% margin` : "No cost data"}
                    />
                    <StatCard label="Cost of goods" value={formatUsd(data.profit.cost_of_goods_usd)} />
                    <StatCard
                      label="Cost coverage"
                      value={data.profit.cost_coverage_percent !== null ? `${data.profit.cost_coverage_percent}%` : "—"}
                      hint="Units sold that have a recorded purchase cost"
                      tone={data.profit.cost_coverage_percent !== null && data.profit.cost_coverage_percent < 80 ? "warning" : "neutral"}
                    />
                  </FigureRow>
                </Question>
              ) : null}

              {data.summary ? (
                <Question
                  id="r-cashier"
                  title="Who sold?"
                  action={
                    <ExportButton
                      name={`sales-by-cashier-${from}-${to}.csv`}
                      headers={["Cashier", "Sales", "Revenue USD"]}
                      rows={data.summary.by_cashier.map((c) => [c.cashier, c.sale_count, c.net_revenue_usd])}
                    />
                  }
                >
                  {data.summary.by_cashier.length === 0 ? (
                    <EmptyState title="No sales in this period." />
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="!pl-0">Cashier</th>
                          <th className="num">Sales</th>
                          <th className="num !pr-0">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.summary.by_cashier.map((c) => (
                          <tr key={c.cashier}>
                            <td className="!pl-0 font-medium">{c.cashier}</td>
                            <td className="num">{c.sale_count}</td>
                            <td className="num !pr-0 font-medium">{formatUsd(c.net_revenue_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Question>
              ) : null}

              {data.stock ? (
                <>
                  <Question
                    id="r-low"
                    className="xl:order-2"
                    title="What should be reordered?"
                    count={data.stock.lowStockTotal}
                    action={<ExportButton name="low-stock.csv" headers={["Product", "Qty", "Min"]} rows={data.stock.lowStock.map((p) => [p.name, p.total_qty, p.min_stock])} />}
                  >
                    {data.stock.lowStock.length === 0 ? (
                      <EmptyState title="Every product is above its minimum." />
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="!pl-0">Product</th>
                            <th className="num">On hand</th>
                            <th className="num !pr-0">Minimum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.stock.lowStock.map((p) => (
                            <tr key={p.id}>
                              <td className="w-full max-w-0 !pl-0">
                                <ProductName name={p.name} inline className="block truncate" />
                              </td>
                              <td className="num">{p.total_qty === 0 ? <Status tone="danger">0</Status> : p.total_qty}</td>
                              <td className="num !pr-0 text-fg-2">{p.min_stock}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Question>
                  <Question
                    id="r-expiry"
                    className="xl:order-2"
                    title="What is expiring?"
                    count={data.stock.expiredTotal + data.stock.nearExpiryTotal}
                    action={
                      <ExportButton
                        name="expiry.csv"
                        headers={["Product", "Qty", "Expiry"]}
                        rows={[...data.stock.expired, ...data.stock.nearExpiry].map((b) => [b.product_name, b.qty, b.expiry_date])}
                      />
                    }
                  >
                    {data.stock.expired.length + data.stock.nearExpiry.length === 0 ? (
                      <EmptyState title="Nothing expires in the next 90 days." />
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="!pl-0">Product</th>
                            <th className="num">Qty</th>
                            <th>Expiry</th>
                            <th className="!pr-0 text-right">State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...data.stock.expired, ...data.stock.nearExpiry].map((b) => {
                            const st = expiryStatus(daysUntil(b.expiry_date));
                            return (
                              <tr key={b.id}>
                                <td className="w-full max-w-0 !pl-0">
                                  <ProductName name={b.product_name} inline className="block truncate" />
                                </td>
                                <td className="num">{b.qty}</td>
                                <td className="code whitespace-nowrap text-fg-2">{b.expiry_date}</td>
                                <td className="!pr-0 text-right">
                                  <Status tone={st.tone} className="text-xs">
                                    {st.label}
                                  </Status>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </Question>
                </>
              ) : null}
            </div>

            {data.movements ? (
              <Question
                id="r-moves"
                title="What moved in and out of stock?"
                count={data.movements.totals_by_type.map((t) => `${MOVEMENT_LABEL[t.movement_type] ?? t.movement_type} ${t.net_units > 0 ? "+" : ""}${t.net_units}`).join(" · ")}
                action={
                  <ExportButton
                    name={`stock-movements-${from}-${to}.csv`}
                    headers={["Date", "Type", "Product", "Qty", "Reason / note", "User"]}
                    rows={data.movements.movements.map((m) => [
                      parseServerDate(m.created_at).toLocaleString(),
                      MOVEMENT_LABEL[m.movement_type] ?? m.movement_type,
                      m.product_name,
                      m.qty_change,
                      [m.reason?.replace("_", " "), m.notes].filter(Boolean).join(" — "),
                      m.username ?? "",
                    ])}
                  />
                }
              >
                {data.movements.movements.length === 0 ? (
                  <EmptyState title="No stock movements in this period." />
                ) : (
                  <div className="max-h-[28rem] overflow-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="!pl-0">When</th>
                          <th>Type</th>
                          <th>Product</th>
                          <th className="num">Qty</th>
                          <th className="hidden lg:table-cell">Reason / note</th>
                          <th className="!pr-0">User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.movements.movements.map((m) => (
                          <tr key={m.id}>
                            <td className="code !pl-0 whitespace-nowrap text-fg-2">{parseServerDate(m.created_at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                            <td>{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</td>
                            <td className="w-full max-w-0">
                              <ProductName name={m.product_name} inline className="block truncate" />
                            </td>
                            <td className={`num font-medium ${m.qty_change < 0 ? "text-fg" : "text-accent-text"}`}>
                              {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
                            </td>
                            <td className="hidden max-w-60 truncate text-fg-2 lg:table-cell">{[m.reason?.replace("_", " "), m.notes].filter(Boolean).join(" — ")}</td>
                            <td className="!pr-0 text-fg-2">{m.username ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Question>
            ) : null}
          </div>
        ) : null}
      </ScrollBox>
    </PageShell>
  );
}
