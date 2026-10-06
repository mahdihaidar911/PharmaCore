import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox } from "../components/PageShell";
import { Alert, EmptyState, Spinner, StatCard } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, formatLbp, formatUsd, type DashboardReport } from "../lib/api";

function daysUntil(isoDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${isoDate}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

export default function DashboardPage() {
  const { settings } = useSettings();
  const { can } = useAuth();
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState("");
  const pharmacyName = settings?.name?.trim() || "PharmaCore Pharmacy";

  useEffect(() => {
    api
      .getDashboardReport()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, []);

  const expiryAlerts = report ? [...report.expired, ...report.nearExpiry].slice(0, 8) : [];

  return (
    <PageShell
      title={pharmacyName}
      description={`Today · ${report?.date ?? ""}`}
      actions={
        <div className="flex flex-wrap gap-2">
          {can("ai.use") ? (
            <Link to="/assistant?tab=analyze" className="btn btn-secondary">
              <Icon name="assistant" className="h-4 w-4" />
              Analyze business
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
          <div className="space-y-4 pb-2">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {report.salesToday ? (
                <>
                  <StatCard label="Sales today" value={report.salesToday.sale_count} hint="Completed invoices" />
                  <StatCard
                    label="Revenue today"
                    value={formatUsd(report.salesToday.total_usd)}
                    hint={report.salesToday.total_lbp > 0 ? formatLbp(report.salesToday.total_lbp) : "After discounts"}
                  />
                </>
              ) : null}
              <StatCard
                label="Low stock"
                value={report.lowStockTotal}
                hint={`${report.outOfStockTotal} out of stock`}
                tone={report.outOfStockTotal > 0 ? "danger" : report.lowStockTotal > 0 ? "warning" : "neutral"}
              />
              <StatCard
                label="Expiry alerts"
                value={report.nearExpiryTotal + report.expiredTotal}
                hint={`${report.expiredTotal} expired · ${report.nearExpiryTotal} within 90 days`}
                tone={report.expiredTotal > 0 ? "danger" : report.nearExpiryTotal > 0 ? "warning" : "neutral"}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                  <h3 className="card-title">Expiry alerts</h3>
                  <Link to="/inventory" className="text-sm font-medium text-brand-700 hover:underline">
                    Inventory →
                  </Link>
                </div>
                {expiryAlerts.length === 0 ? (
                  <EmptyState title="No batches expiring in the next 90 days" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {expiryAlerts.map((b) => {
                      const days = daysUntil(b.expiry_date);
                      return (
                        <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                          <span className="min-w-0 truncate font-medium text-slate-800">{b.product_name}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-slate-500">{b.qty} units</span>
                            <span className={`badge ${days <= 0 ? "badge-danger" : days <= 30 ? "badge-warning" : "badge-neutral"}`}>
                              {days <= 0 ? "Expired" : `${days} days`}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="card">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                  <h3 className="card-title">Low stock</h3>
                  {can("inventory.receive") ? (
                    <Link to="/receive" className="text-sm font-medium text-brand-700 hover:underline">
                      Receive stock →
                    </Link>
                  ) : null}
                </div>
                {report.lowStock.length === 0 ? (
                  <EmptyState title="All stocked products are above their minimum" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {report.lowStock.slice(0, 8).map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <span className="min-w-0 truncate font-medium text-slate-800">{p.name}</span>
                        <span className={`badge shrink-0 ${p.total_qty === 0 ? "badge-danger" : "badge-warning"}`}>
                          {p.total_qty} / min {p.min_stock}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {report.topProducts ? (
                <section className="card lg:col-span-2">
                  <div className="border-b border-slate-100 px-5 py-3">
                    <h3 className="card-title">Today's top products</h3>
                  </div>
                  {report.topProducts.length === 0 ? (
                    <EmptyState title="No sales yet today" />
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="text-right">Units</th>
                          <th className="text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.topProducts.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td className="text-right tabular-nums">{p.qty_sold}</td>
                            <td className="text-right tabular-nums">{formatUsd(p.revenue_usd)}</td>
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
