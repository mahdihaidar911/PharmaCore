import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell, ScrollBox } from "../components/PageShell";
import { api, formatLbp, formatUsd, type DashboardReport } from "../lib/api";
import { useSettings } from "../context/SettingsContext";

export default function DashboardPage() {
  const { settings } = useSettings();
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState("");
  const pharmacyName = settings?.name?.trim() || "PharmaCore Pharmacy";

  useEffect(() => {
    api
      .getDashboardReport()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, []);

  return (
    <PageShell
      title={pharmacyName}
      description={`Dashboard · ${report?.date ?? "today"}`}
      actions={
        <Link to="/pos" className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
          Open POS
        </Link>
      }
    >
      {error ? <p className="shrink-0 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <ScrollBox className="min-h-0 flex-1">
      {report ? (
        <div className="space-y-4 pb-2">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Today's sales" value={String(report.salesToday.sale_count)} hint="Completed invoices" />
            <StatCard label="Revenue (USD)" value={formatUsd(report.salesToday.total_usd)} hint="Included in reports" />
            <StatCard label="Low stock items" value={String(report.lowStock.length)} hint="At or below minimum" />
            <StatCard
              label="Expiry alerts"
              value={String(report.nearExpiry.length + report.expired.length)}
              hint="Near + expired batches"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">Quick actions</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/pos" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white">
                  New sale
                </Link>
                <Link to="/receive" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                  Receive stock
                </Link>
                <Link to="/reports" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                  Full reports
                </Link>
                <Link to="/backup" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                  Backup
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">Today's top products</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {report.topProducts.length === 0 ? (
                  <li className="text-slate-500">No sales yet today.</li>
                ) : (
                  report.topProducts.map((p) => (
                    <li key={p.name} className="flex justify-between">
                      <span>{p.name}</span>
                      <span className="text-slate-600">
                        {p.qty_sold} sold · {formatUsd(p.revenue_usd)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              {report.salesToday.total_lbp > 0 ? (
                <p className="mt-4 text-sm text-slate-500">LBP total: {formatLbp(report.salesToday.total_lbp)}</p>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
      </ScrollBox>
    </PageShell>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}
