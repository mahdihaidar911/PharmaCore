import { hasPermission, type Role } from "../auth/permissions.js";
import { addDays, localDateString, resolveRange, type DateRange } from "../services/dates.js";
import { compareSalesPeriods, getExpiringBatches, getLowStockProducts, getProfitSummary, getTopProducts } from "../services/reports.js";
import { logAiRequest } from "./log.js";
import type { AiUser } from "./orchestrator.js";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompts.js";
import { getProvider } from "./provider.js";

export type Highlight = {
  severity: "critical" | "warning" | "info" | "positive";
  title: string;
  detail: string;
};

/** Facts computed directly from the database, filtered to what the user's role may see. */
export function buildBusinessSnapshot(role: Role, range: DateRange) {
  const lowStock = getLowStockProducts({ limit: 10 });
  const expiring30 = getExpiringBatches({ withinDays: 30, limit: 5 });
  const expired = getExpiringBatches({ withinDays: 0, includeExpired: true, limit: 5 });

  const snapshot: Record<string, unknown> & { period: DateRange; generated_at: string } = {
    period: range,
    generated_at: new Date().toISOString(),
    inventory: {
      low_stock_total: lowStock.total_matching,
      out_of_stock_total: lowStock.out_of_stock_count,
      out_of_stock_but_selling: lowStock.products
        .filter((p) => p.total_qty === 0 && p.units_sold_last_30_days > 0)
        .map((p) => ({ name: p.name, units_sold_last_30_days: p.units_sold_last_30_days })),
      low_stock_examples: lowStock.products.slice(0, 5).map((p) => ({ name: p.name, qty: p.total_qty, min: p.min_stock })),
      expiring_within_30_days: expiring30.summary,
      expiring_examples: expiring30.batches.map((b) => ({ name: b.name, qty: b.qty, expiry_date: b.expiry_date })),
      expired_still_in_stock: expired.summary,
    },
  };

  if (hasPermission(role, "reports.sales")) {
    snapshot.sales = {
      comparison: compareSalesPeriods(range),
      top_products: getTopProducts({ ...range, limit: 5, sortBy: "units" }).products.map((p) => ({
        name: p.name,
        units_sold: p.units_sold,
        net_revenue_usd: p.net_revenue_usd,
        current_stock: p.current_stock,
      })),
    };
  }
  if (hasPermission(role, "reports.profit")) {
    snapshot.profit = getProfitSummary(range);
  }
  return snapshot;
}

type Snapshot = ReturnType<typeof buildBusinessSnapshot>;

/** Deterministic rules so the briefing is useful even when no AI model is configured. */
export function deriveHighlights(snapshot: Snapshot): Highlight[] {
  const highlights: Highlight[] = [];
  const inv = snapshot.inventory as {
    low_stock_total: number;
    out_of_stock_total: number;
    out_of_stock_but_selling: { name: string; units_sold_last_30_days: number }[];
    expiring_within_30_days: { batch_count: number; units: number; retail_value_usd: number };
    expired_still_in_stock: { batch_count: number; units: number };
  };

  if (inv.expired_still_in_stock.batch_count > 0) {
    highlights.push({
      severity: "critical",
      title: `${inv.expired_still_in_stock.batch_count} expired batch(es) still in stock`,
      detail: `${inv.expired_still_in_stock.units} units should be removed from sale and written off.`,
    });
  }
  if (inv.out_of_stock_but_selling.length > 0) {
    highlights.push({
      severity: "critical",
      title: `${inv.out_of_stock_but_selling.length} selling product(s) are out of stock`,
      detail: inv.out_of_stock_but_selling.map((p) => `${p.name} (${p.units_sold_last_30_days} sold in 30 days)`).join(", "),
    });
  }
  if (inv.low_stock_total > 0) {
    highlights.push({
      severity: "warning",
      title: `${inv.low_stock_total} product(s) at or below minimum stock`,
      detail: `${inv.out_of_stock_total} of them have no units left.`,
    });
  }
  if (inv.expiring_within_30_days.batch_count > 0) {
    highlights.push({
      severity: "warning",
      title: `${inv.expiring_within_30_days.batch_count} batch(es) expire within 30 days`,
      detail: `${inv.expiring_within_30_days.units} units, about $${inv.expiring_within_30_days.retail_value_usd.toFixed(2)} at retail price.`,
    });
  }

  const sales = snapshot.sales as
    | { comparison: ReturnType<typeof compareSalesPeriods> }
    | undefined;
  if (sales) {
    const { current, previous, change_percent } = sales.comparison;
    const change = change_percent.net_revenue_usd;
    if (current.sale_count === 0) {
      highlights.push({ severity: "info", title: "No sales recorded in this period", detail: `${current.period.from} to ${current.period.to}.` });
    } else if (change !== null) {
      highlights.push({
        severity: change >= 0 ? "positive" : change <= -10 ? "warning" : "info",
        title: `Net revenue ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% vs previous period`,
        detail: `$${current.net_revenue_usd.toFixed(2)} from ${current.sale_count} sales, compared with $${previous.net_revenue_usd.toFixed(2)} from ${previous.sale_count} sales.`,
      });
    } else {
      highlights.push({
        severity: "info",
        title: `$${current.net_revenue_usd.toFixed(2)} net revenue from ${current.sale_count} sales`,
        detail: "No sales in the previous period to compare with.",
      });
    }
  }

  const profit = snapshot.profit as ReturnType<typeof getProfitSummary> | undefined;
  if (profit && profit.cost_coverage_percent !== null && profit.cost_coverage_percent < 80) {
    highlights.push({
      severity: "info",
      title: `Profit figures cover only ${profit.cost_coverage_percent}% of units sold`,
      detail: "Record purchase costs when receiving stock to get accurate margins.",
    });
  }

  if (highlights.length === 0) {
    highlights.push({ severity: "positive", title: "Nothing needs attention right now", detail: "No stock, expiry or sales alerts were found." });
  }
  return highlights;
}

export async function analyzeBusiness(user: AiUser, from?: string, to?: string) {
  const started = Date.now();
  const range = resolveRange(from ?? addDays(localDateString(), -29), to);
  const snapshot = buildBusinessSnapshot(user.role, range);
  const highlights = deriveHighlights(snapshot);
  const provider = getProvider();

  let narrative: string | null = null;
  let aiError: string | null = null;
  if (provider) {
    try {
      const result = await provider.complete({
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ snapshot, highlights }) },
        ],
        temperature: 0.2,
      });
      narrative = result.content?.trim() || null;
    } catch (error) {
      aiError = error instanceof Error ? error.message : "AI narrative failed";
    }
  }

  logAiRequest({
    userId: user.userId,
    kind: "analyze",
    prompt: `Analyze business ${range.from}..${range.to}`,
    response: narrative,
    model: provider?.model ?? null,
    status: !provider ? "unconfigured" : aiError ? "error" : "ok",
    error: aiError,
    latencyMs: Date.now() - started,
  });

  return {
    period: range,
    snapshot,
    highlights,
    narrative,
    ai_used: Boolean(narrative),
    ai_configured: Boolean(provider),
    ai_error: aiError,
    model: provider?.model ?? null,
  };
}
