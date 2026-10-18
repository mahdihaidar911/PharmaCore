import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { ProductName } from "../components/ProductName";
import { RevenueChart } from "../components/RevenueChart";
import { Alert, EmptyState, Spinner, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, formatLbp, formatUsd, localToday, type DailyRevenueReport, type DashboardReport } from "../lib/api";
import { daysUntil, expiryStatus } from "../lib/expiry";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function Line({ tone, children }: { tone: "ok" | "caution" | "danger"; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-2 text-dense text-fg-2">
      <Status tone={tone} className="mt-px shrink-0">
        <span className="sr-only">{tone === "ok" ? "OK" : tone === "caution" ? "Attention" : "Action needed"}</span>
      </Status>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** "How is today going?" — the day's takings and the three shelf checks, built only from the report figures. */
function TodayPanel({ report }: { report: DashboardReport }) {
  const s = report.salesToday;
  const low = report.lowStockTotal;
  const out = report.outOfStockTotal;
  return (
    <section aria-label="Today at a glance" className="sheet flex flex-col px-4 py-3.5">
      {s ? (
        <div className="border-b border-line pb-3.5">
          <p className="kicker">Sales today</p>
          <p className="mt-1 text-figure leading-none font-semibold tracking-[-0.025em] text-fg">{formatUsd(s.total_usd)}</p>
          <p className="mt-1.5 text-dense text-fg-3">
            {s.sale_count === 0 ? "No sales yet" : plural(s.sale_count, "sale", "sales")}
            {s.total_lbp > 0 ? <span className="code"> · {formatLbp(s.total_lbp)}</span> : null}
            <span> · after discounts</span>
          </p>
        </div>
      ) : null}
      <ul className="divide-y divide-line">
        {low === 0 ? (
          <Line tone="ok">Every product is above its minimum stock.</Line>
        ) : (
          <Line tone={out > 0 ? "danger" : "caution"}>
            <strong className="font-semibold text-fg">{plural(low, "product", "products")}</strong> at or below minimum
            {out > 0 ? <>, {out} out of stock</> : null}.
          </Line>
        )}
        {report.expiredTotal > 0 ? (
          <Line tone="danger">
            <strong className="font-semibold text-fg">{plural(report.expiredTotal, "batch", "batches")} expired</strong> — remove from the shelf.
          </Line>
        ) : (
          <Line tone="ok">No expired stock on the shelf.</Line>
        )}
        {report.nearExpiryTotal > 0 ? (
          <Line tone="caution">
            <strong className="font-semibold text-fg">{plural(report.nearExpiryTotal, "batch expires", "batches expire")}</strong> within 90 days.
          </Line>
        ) : (
          <Line tone="ok">Nothing expires in the next 90 days.</Line>
        )}
      </ul>
    </section>
  );
}

export default function DashboardPage() {
  const { settings } = useSettings();
  const { can } = useAuth();
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [daily, setDaily] = useState<DailyRevenueReport | null>(null);
  const [error, setError] = useState("");
  const pharmacyName = settings?.name?.trim() || "PharmaCore Pharmacy";
  const showTrend = can("reports.sales");

  useEffect(() => {
    api
      .getDashboardReport()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load today's summary"));
    if (showTrend) {
      api
        .getDailyRevenue(localToday(-6), localToday())
        .then(setDaily)
        .catch(() => setDaily(null));
    }
  }, [showTrend]);

  const expiryAlerts = report ? [...report.expired, ...report.nearExpiry].slice(0, 10) : [];
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <PageShell
      eyebrow={`${pharmacyName} · ${dateLabel}`}
      title="Today"
      actions={
        <div className="flex flex-wrap gap-2">
          {can("ai.use") ? (
            <Link to="/assistant?tab=analyze" className="btn btn-secondary">
              <Icon name="assistant" className="h-4 w-4" />
              Analyse business
            </Link>
          ) : null}
          {can("pos.sell") ? (
            <Link to="/pos" className="btn btn-primary">
              New sale
            </Link>
          ) : null}
        </div>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ScrollBox className="min-h-0 flex-1">
        {!report && !error ? <Spinner className="p-4" /> : null}
        {report ? (
          <div className="space-y-5 pb-4">
            <div className={`grid gap-5 ${showTrend ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]" : ""}`}>
              <TodayPanel report={report} />
              {showTrend ? (
                <section aria-labelledby="q-week" className="sheet px-4 pt-3 pb-3">
                  <SectionHead id="q-week" title="Last 7 days" />
                  <div className="mt-2">
                    {daily ? <RevenueChart days={daily.days} today={localToday()} /> : <Spinner className="py-6" />}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section aria-labelledby="q-expiry" className="sheet px-4 pt-3 pb-2">
                <SectionHead
                  id="q-expiry"
                  title="What must come off the shelf soon?"
                  count={report.expiredTotal + report.nearExpiryTotal}
                  action={
                    can("inventory.view") ? (
                      <Link to="/inventory" className="text-dense font-medium text-accent-text hover:underline">
                        Inventory
                      </Link>
                    ) : null
                  }
                />
                {expiryAlerts.length === 0 ? (
                  <EmptyState title="No batches expire in the next 90 days." />
                ) : (
                  <table className="data-table">
                    <thead className="sr-only">
                      <tr>
                        <th>Product</th>
                        <th>Units</th>
                        <th className="max-sm:hidden">Expiry</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiryAlerts.map((b) => {
                        const st = expiryStatus(daysUntil(b.expiry_date));
                        return (
                          <tr key={b.id}>
                            <td className="w-full max-w-0 !pl-0">
                              <ProductName name={b.product_name} />
                            </td>
                            <td className="num text-fg-2">{b.qty} u</td>
                            <td className="num code text-fg-2 max-sm:hidden">{b.expiry_date}</td>
                            <td className="!pr-0 text-right">
                              <Status tone={st.tone}>{st.label}</Status>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>

              <section aria-labelledby="q-reorder" className="sheet px-4 pt-3 pb-2">
                <SectionHead
                  id="q-reorder"
                  title="What should be reordered?"
                  count={report.lowStockTotal}
                  action={
                    can("inventory.receive") ? (
                      <Link to="/receive" className="text-dense font-medium text-accent-text hover:underline">
                        Receive stock
                      </Link>
                    ) : null
                  }
                />
                {report.lowStock.length === 0 ? (
                  <EmptyState title="Every product is above its minimum stock." />
                ) : (
                  <table className="data-table">
                    <thead className="sr-only">
                      <tr>
                        <th>Product</th>
                        <th>On hand / minimum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.lowStock.slice(0, 10).map((p) => (
                        <tr key={p.id}>
                          <td className="w-full max-w-0 !pl-0">
                            <ProductName name={p.name} />
                          </td>
                          <td className="!pr-0 text-right">
                            {p.total_qty === 0 ? (
                              <Status tone="danger">Out of stock</Status>
                            ) : (
                              <Status tone="caution" icon="alert">
                                {p.total_qty} left <span className="font-normal text-fg-3">of min {p.min_stock}</span>
                              </Status>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {report.topProducts ? (
                <section aria-labelledby="q-sold" className="sheet px-4 pt-3 pb-2">
                  <SectionHead id="q-sold" title="What sold today?" />
                  {report.topProducts.length === 0 ? (
                    <EmptyState title="No sales yet today." />
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="!pl-0">Product</th>
                          <th className="num">Units</th>
                          <th className="num !pr-0">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.topProducts.map((p) => (
                          <tr key={p.name}>
                            <td className="w-full max-w-0 !pl-0">
                              <ProductName name={p.name} inline className="block truncate" />
                            </td>
                            <td className="num">{p.qty_sold}</td>
                            <td className="num !pr-0 font-medium">{formatUsd(p.revenue_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              ) : null}

              {report.salesByCashier ? (
                <section aria-labelledby="q-who" className="sheet px-4 pt-3 pb-2">
                  <SectionHead id="q-who" title="Who has been selling?" />
                  {report.salesByCashier.length === 0 ? (
                    <EmptyState title="No sales yet today." />
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
                        {report.salesByCashier.map((c) => (
                          <tr key={c.username ?? "unknown"}>
                            <td className="!pl-0 font-medium">{c.username ?? "Unknown"}</td>
                            <td className="num">{c.sale_count}</td>
                            <td className="num !pr-0 font-medium">{formatUsd(c.total_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        ) : null}
      </ScrollBox>
    </PageShell>
  );
}
