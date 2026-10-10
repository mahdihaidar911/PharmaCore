import { useState } from "react";
import { api, formatUsd, localToday, type BusinessAnalysis, type BusinessHighlight } from "../../lib/api";
import { SimpleMarkdown } from "../../lib/markdown";
import { SectionHead } from "../PageShell";
import { Alert, Badge, FigureRow, Spinner, StatCard } from "../ui";
import { Icon } from "../icons";

const PRESETS = [
  { id: "7", label: "Last 7 days", range: () => ({ from: localToday(-6), to: localToday() }) },
  { id: "30", label: "Last 30 days", range: () => ({ from: localToday(-29), to: localToday() }) },
  { id: "month", label: "This month", range: () => ({ from: `${localToday().slice(0, 8)}01`, to: localToday() }) },
] as const;

const SEVERITY_STYLE: Record<BusinessHighlight["severity"], { tone: "error" | "warning" | "info" | "success"; label: string }> = {
  critical: { tone: "error", label: "Action needed" },
  warning: { tone: "warning", label: "Attention" },
  info: { tone: "info", label: "Info" },
  positive: { tone: "success", label: "Good" },
};

type SalesComparison = {
  current: { net_revenue_usd: number; sale_count: number; average_sale_usd: number };
  change_percent: { net_revenue_usd: number | null; sale_count: number | null };
};

export function AnalyzePanel() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("30");
  const [result, setResult] = useState<BusinessAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    const { from, to } = PRESETS.find((p) => p.id === preset)!.range();
    setLoading(true);
    setError("");
    try {
      setResult(await api.aiAnalyze(from, to));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const sales = (result?.snapshot.sales as { comparison: SalesComparison } | undefined)?.comparison;
  const inventory = result?.snapshot.inventory as
    | { low_stock_total: number; out_of_stock_total: number; expiring_within_30_days: { batch_count: number }; expired_still_in_stock: { batch_count: number } }
    | undefined;
  const change = (v: number | null | undefined) => (v === null || v === undefined ? "no prior data" : `${v >= 0 ? "+" : ""}${v}% vs previous period`);

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
      <div className="card card-body flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="card-title">Business briefing</p>
          <p className="text-sm text-ink-3">Figures are computed from PharmaCore. If an AI model is configured, it writes a short summary of them.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={`tab ${preset === p.id ? "tab-active" : ""}`} onClick={() => setPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={analyze} disabled={loading}>
            <Icon name="assistant" className="h-4 w-4" />
            {loading ? "Analyzing…" : "Analyze business"}
          </button>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading && !result ? <Spinner label="Reading sales and stock data…" /> : null}

      {result ? (
        <>
          <p className="text-xs text-ink-3">
            Period {result.period.from} → {result.period.to}
          </p>

          <FigureRow>
            {sales ? (
              <>
                <StatCard label="Net revenue" value={formatUsd(sales.current.net_revenue_usd)} hint={change(sales.change_percent.net_revenue_usd)} />
                <StatCard label="Sales" value={sales.current.sale_count} hint={change(sales.change_percent.sale_count)} />
              </>
            ) : null}
            {inventory ? (
              <>
                <StatCard label="Low / out of stock" value={inventory.low_stock_total} hint={`${inventory.out_of_stock_total} with no units`} tone={inventory.low_stock_total ? "warning" : "neutral"} />
                <StatCard
                  label="Expiring ≤ 30 days"
                  value={inventory.expiring_within_30_days.batch_count}
                  hint={`${inventory.expired_still_in_stock.batch_count} batch(es) already expired`}
                  tone={inventory.expired_still_in_stock.batch_count ? "danger" : inventory.expiring_within_30_days.batch_count ? "warning" : "neutral"}
                />
              </>
            ) : null}
          </FigureRow>

          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <section className="space-y-2">
              <SectionHead title="Highlights" count={result.highlights.length} />
              {result.highlights.map((h, i) => (
                <Alert key={i} tone={SEVERITY_STYLE[h.severity].tone} title={h.title}>
                  {h.detail}
                </Alert>
              ))}
            </section>

            <section>
              <SectionHead title="AI summary" action={result.ai_used ? <Badge tone="brand">Written by AI from the figures shown</Badge> : undefined} />
              <div className="mt-2">
                {result.narrative ? (
                  <SimpleMarkdown text={result.narrative} />
                ) : result.ai_error ? (
                  <Alert tone="warning" title="AI summary unavailable">
                    {result.ai_error} The highlights on the left are still accurate.
                  </Alert>
                ) : (
                  <p className="text-sm text-ink-3">No AI model is configured, so only the computed highlights are shown.</p>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
