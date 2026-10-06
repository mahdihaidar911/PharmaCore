import type { AiToolCall } from "../../lib/api";

const LABELS: Record<string, string> = {
  get_sales_summary: "Sales summary",
  compare_sales_periods: "Period comparison",
  get_daily_revenue: "Daily revenue",
  get_top_products: "Top products",
  get_low_stock_products: "Low stock",
  get_expiring_batches: "Expiring batches",
  get_inventory_movements: "Stock movements",
  search_products: "Product lookup",
  get_profit_summary: "Profit summary",
  get_inventory_valuation: "Stock valuation",
};

export function toolLabel(name: string) {
  return LABELS[name] ?? name;
}

/** Human-readable description of the parameters a tool was called with. */
export function describeToolArgs(call: AiToolCall): string {
  const a = call.arguments as Record<string, unknown>;
  const parts: string[] = [];
  if (a.from || a.to) parts.push(`${a.from ?? "…"} → ${a.to ?? "today"}`);
  if (a.within_days !== undefined) parts.push(`within ${a.within_days} days`);
  if (a.min_qty !== undefined) parts.push(`qty ≥ ${a.min_qty}`);
  if (a.include_expired) parts.push("incl. expired");
  if (a.only_out_of_stock) parts.push("out of stock only");
  if (a.sort_by) parts.push(`by ${a.sort_by}`);
  if (a.movement_type) parts.push(String(a.movement_type));
  if (a.query) parts.push(`"${a.query}"`);
  if (a.limit !== undefined) parts.push(`top ${a.limit}`);
  return parts.join(" · ");
}
