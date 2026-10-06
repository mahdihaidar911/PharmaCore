import { FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, formatUsd, parseServerDate, type AiSearchResult, type QueryColumn } from "../../lib/api";
import { Alert, EmptyState, Spinner } from "../ui";

const EXAMPLES = [
  { text: "Products that expire in the next 60 days and have more than 10 units", needs: "reports.inventory" },
  { text: "Stocked products with less than 5 units", needs: "products.view" },
  { text: "Show sales over $500 from last month", needs: "reports.sales" },
  { text: "Card payments this week", needs: "reports.sales" },
] as const;

function formatCell(value: unknown, type: QueryColumn["type"]) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "usd") return formatUsd(Number(value));
  if (type === "datetime") return parseServerDate(String(value)).toLocaleString();
  if (type === "number") return Number(value).toLocaleString();
  return String(value);
}

export function SmartSearchPanel({ configured }: { configured: boolean }) {
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AiSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(text: string) {
    if (!text.trim() || loading) return;
    setQuery(text);
    setLoading(true);
    setError("");
    try {
      setResult(await api.aiSearch(text.trim()));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(query);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form onSubmit={onSubmit} className="card card-body space-y-3">
        <div className="flex gap-2">
          <input
            className="input min-h-11 flex-1 text-base"
            placeholder="Describe what you want to see, e.g. “batches expiring in 90 days with at least 20 units”"
            value={query}
            maxLength={300}
            disabled={!configured}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!configured || loading || query.trim().length < 3}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.filter((e) => can(e.needs)).map((e) => (
            <button key={e.text} type="button" className="btn btn-secondary btn-sm" disabled={!configured || loading} onClick={() => run(e.text)}>
              {e.text}
            </button>
          ))}
        </div>
        {!configured ? <Alert tone="warning">Smart search needs an AI model. See the Ask tab for setup details.</Alert> : null}
      </form>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? <Spinner label="Interpreting and running your search…" /> : null}

      {result && !loading ? (
        <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-200 p-4">
            {result.interpretation ? <p className="text-sm text-slate-700">{result.interpretation}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="badge badge-neutral capitalize">{result.entity}</span>
              {result.applied_filters.length ? (
                result.applied_filters.map((f) => (
                  <span key={f} className="badge badge-brand">
                    {f}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">No filters applied</span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {result.truncated ? `Showing first ${result.rows.length} of ${result.total.toLocaleString()} results.` : `${result.total.toLocaleString()} result(s).`}{" "}
              Check the filters above to confirm the request was understood correctly.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {result.rows.length === 0 ? (
              <EmptyState title="Nothing matches these filters" description="Try widening the date range or quantity limits." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c.key} className={c.type === "text" ? "" : "text-right"}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {result.columns.map((c) => (
                        <td key={c.key} className={c.type === "text" ? "" : "text-right tabular-nums"}>
                          {formatCell(row[c.key], c.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
