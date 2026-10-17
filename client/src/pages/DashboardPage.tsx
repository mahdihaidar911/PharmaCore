import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/icons";
import { PageShell, ScrollBox, SectionHead } from "../components/PageShell";
import { ProductName } from "../components/ProductName";
import { Alert, EmptyState, Spinner, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, formatLbp, formatUsd, type DashboardReport } from "../lib/api";
import { daysUntil, expiryStatus } from "../lib/expiry";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function Strong({ tone, children }: { tone?: "danger" | "caution"; children: ReactNode }) {
  const color = tone === "danger" ? "text-danger" : tone === "caution" ? "text-caution" : "text-fg";
  return <strong className={`font-semibold ${color}`}>{children}</strong>;
}

/** One-paragraph answer to "how is today going?" built only from the report figures. */
function Standfirst({ report }: { report: DashboardReport }) {
  const s = report.salesToday;
  const outOfStock = report.outOfStockTotal;
  const low = report.lowStockTotal;
  return (
    <p className="max-w-4xl font-serif text-xl leading-relaxed text-fg-2">
      {s ? (
        s.sale_count === 0 ? (
          <>No sales yet today. </>
        ) : (
          <>
            <Strong>{plural(s.sale_count, "sale", "sales")}</Strong> so far, <Strong>{formatUsd(s.total_usd)}</Strong> after discounts
            {s.total_lbp > 0 ? <> ({formatLbp(s.total_lbp)})</> : null}.{" "}
          </>
        )
      ) : null}
      {low === 0 ? (
        <>Every product is above its minimum stock. </>
      ) : (
        <>
          <Strong tone="caution">{plural(low, "product is", "products are")}</Strong> at or below minimum
          {outOfStock > 0 ? (
            <>
              , <Strong tone="danger">{plural(outOfStock, "of them", "of them")} out of stock</Strong>
            </>
          ) : null}
          .{" "}
        </>
      )}
      {report.expiredTotal > 0 ? (
        <>
          <Strong tone="danger">{plural(report.expiredTotal, "batch has", "batches have")} expired</Strong> and must be removed from the shelf
          {report.nearExpiryTotal > 0 ? (
            <>
              ; <Strong tone="caution">{report.nearExpiryTotal}</Strong> more expire within 90 days.
            </>
          ) : (
            "."
          )}
        </>
      ) : report.nearExpiryTotal > 0 ? (
        <>
          <Strong tone="caution">{plural(report.nearExpiryTotal, "batch expires", "batches expire")}</Strong> within 90 days.
        </>
      ) : (
        <>No batch expires in the next 90 days.</>
      )}
    </p>
  );
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
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load today's summary"));
  }, []);

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
          <div className="space-y-7 pb-4">
            <Standfirst report={report} />

            <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
              <section aria-labelledby="q-expiry">
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
                        <th>Expiry</th>
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
                            <td className="num code text-fg-2">{b.expiry_date}</td>
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

              <section aria-labelledby="q-reorder">
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
                <section aria-labelledby="q-sold">
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
                <section aria-labelledby="q-who">
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
